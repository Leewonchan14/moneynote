"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  ArrowRight,
  CircleAlert,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { useAuthStore } from "@/lib/auth-store";

interface PasswordGateProps {
  onSuccess: () => void;
}

export const PasswordGate = ({ onSuccess }: PasswordGateProps) => {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isShaking, setIsShaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * Bitwarden(및 브라우저 자동완성)은 `element.value = ...` 로 값을 직접 대입한 뒤
   * input/change 이벤트를 발생시킨다. React의 value tracker가 그 대입을 이미 흡수해
   * onChange가 호출되지 않으므로, 네이티브 이벤트에서 DOM 값을 상태로 동기화한다.
   */
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    const syncValue = () => setPassword(input.value);

    input.addEventListener("input", syncValue);
    input.addEventListener("change", syncValue);
    return () => {
      input.removeEventListener("input", syncValue);
      input.removeEventListener("change", syncValue);
    };
  }, []);

  const handleSubmit = useCallback(
    async (e?: React.SyntheticEvent) => {
      e?.preventDefault();
      // 자동완성으로 채워진 값은 DOM이 원본이므로 제출 시점의 DOM 값을 신뢰한다.
      const value = inputRef.current?.value ?? password;
      if (!value.trim()) return;

      setIsLoading(true);
      setError("");

      try {
        const res = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: value }),
        });

        const data = await res.json();

        if (data.success) {
          login(data.token);
          onSuccess();
        } else {
          setError(data.error || "비밀번호가 틀렸습니다.");
          setIsShaking(true);
          setTimeout(() => setIsShaking(false), 500);
          setPassword("");
          inputRef.current?.focus();
        }
      } catch {
        setError("서버에 연결할 수 없습니다.");
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 500);
      } finally {
        setIsLoading(false);
      }
    },
    [password, onSuccess, login]
  );

  return (
    <div className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden bg-background px-4 py-16">
      {/* 은은한 색 번짐과 점 무늬 배경 */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-emerald-400/20 blur-3xl dark:bg-emerald-500/10" />
        <div className="absolute -bottom-48 -left-24 size-[28rem] rounded-full bg-sky-400/15 blur-3xl dark:bg-sky-500/10" />
        <div className="absolute inset-0 [background-image:radial-gradient(var(--border)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)] [background-size:22px_22px]" />
      </div>

      <form
        onSubmit={handleSubmit}
        className={`w-full max-w-sm rounded-3xl border bg-card/80 p-8 shadow-xl shadow-black/5 backdrop-blur-xl sm:p-10 dark:shadow-black/30 ${
          isShaking ? "animate-shake" : ""
        }`}
      >
        <div className="flex flex-col items-center text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-lg shadow-emerald-500/30">
            <Wallet className="size-7" strokeWidth={2.2} />
          </span>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">머니노트</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            비밀번호를 입력하고 가계부를 여세요
          </p>
        </div>

        <div className="mt-8 space-y-3">
          <label htmlFor="password" className="sr-only">
            비밀번호
          </label>
          <InputGroup className="h-12 rounded-xl bg-background/60 px-1">
            <InputGroupAddon>
              <LockKeyhole />
            </InputGroupAddon>
            <InputGroupInput
              ref={inputRef}
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="비밀번호"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "password-error" : undefined}
              className="text-base"
              autoFocus
            />

            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-sm"
                onClick={() => setShowPassword((visible) => !visible)}
                disabled={isLoading}
                aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                className="text-muted-foreground"
              >
                {showPassword ? <EyeOff /> : <Eye />}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>

          {error && (
            <p
              id="password-error"
              role="alert"
              className="flex items-center gap-2 rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm font-medium text-destructive"
            >
              <CircleAlert className="size-4 shrink-0" />
              {error}
            </p>
          )}

          <Button
            type="submit"
            size="lg"
            className="group h-12 w-full rounded-xl text-base"
            disabled={isLoading || !password.trim()}
          >
            {isLoading ? (
              <>
                <LoaderCircle className="animate-spin" />
                확인 중...
              </>
            ) : (
              <>
                입장하기
                <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </Button>
        </div>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5" />
          5분에 5번까지 시도할 수 있어요
        </p>
      </form>
    </div>
  );
};
