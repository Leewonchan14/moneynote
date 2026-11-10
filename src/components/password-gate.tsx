"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Eye, EyeOff, Wallet } from "lucide-react";

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
    <div
      className="flex min-h-dvh flex-col items-center justify-center px-4 py-32"
      style={{ backgroundColor: "var(--background)" }}
    >
      <form
        onSubmit={handleSubmit}
        className={`flex w-80 max-w-full flex-col items-center gap-5 rounded-xl border p-8 ${
          isShaking ? "animate-shake" : ""
        }`}
        style={{
          borderColor: "var(--border)",
          backgroundColor: "var(--card)",
        }}
      >
        <span className="grid size-14 place-items-center rounded-full bg-muted text-primary">
          <Wallet className="size-6" />
        </span>

        <h1 className="text-lg font-medium" style={{ color: "var(--foreground)" }}>
          머니노트
        </h1>

        <div className="w-full space-y-3">
          <InputGroup>
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
              className="text-center tracking-widest"
              autoFocus
            />

            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                onClick={() => setShowPassword((visible) => !visible)}
                disabled={isLoading}
                aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                className="text-muted-foreground"
              >
                {showPassword ? <EyeOff /> : <Eye />}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>

          <Button
            type="submit"
            className="w-full"
            disabled={isLoading || !password.trim()}
          >
            {isLoading ? "확인 중..." : "입장하기"}
          </Button>
        </div>

        {error && (
          <p className="text-sm font-medium" style={{ color: "var(--destructive)" }}>
            {error}
          </p>
        )}
      </form>
    </div>
  );
};
