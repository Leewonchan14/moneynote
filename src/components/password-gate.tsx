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
import { cn } from "@/lib/utils";

/** 앱 아이콘(icon.svg)과 같은 검정 지갑 마크 */
const LogoMark = ({ className }: { className?: string }) => (
  <span
    className={cn(
      "grid size-9 place-items-center rounded-xl bg-neutral-950 text-white ring-1 ring-white/15 dark:bg-white dark:text-neutral-950",
      className
    )}
  >
    <Wallet className="size-[18px]" strokeWidth={2.2} />
  </span>
);

/** 브랜드 패널의 한 주 막대. 금액이 아닌 장식이라 숫자를 쓰지 않는다. */
const WEEK = [
  { day: "월", height: 38 },
  { day: "화", height: 62 },
  { day: "수", height: 45 },
  { day: "목", height: 80 },
  { day: "금", height: 54 },
  { day: "토", height: 96 },
  { day: "일", height: 30 },
];
const HIGHLIGHT_DAY = 5;

/** 한 주 막대. 오늘 자리(HIGHLIGHT_DAY)만 밝게 칠한다. */
const WeekBars = ({
  className,
  labels = true,
}: {
  className?: string;
  labels?: boolean;
}) => (
  <div className={cn("flex items-end gap-2.5", className)}>
    {WEEK.map((bar, index) => (
      <div key={bar.day} className="flex h-full flex-1 flex-col items-center gap-2">
        <div className="flex w-full flex-1 items-end">
          <div
            className={cn(
              "animate-bar-rise w-full rounded-md",
              index === HIGHLIGHT_DAY ? "bg-white" : "bg-white/15"
            )}
            style={{ height: `${bar.height}%`, animationDelay: `${150 + index * 70}ms` }}
          />
        </div>
        {labels && (
          <span
            className={cn(
              "text-[11px]",
              index === HIGHLIGHT_DAY ? "text-white" : "text-white/40"
            )}
          >
            {bar.day}
          </span>
        )}
      </div>
    ))}
  </div>
);

/** 좁은 화면에서 브랜드 패널 대신 폼 위에 두는 작은 검정 카드 */
const MobileHero = () => (
  <div
    aria-hidden
    className="relative isolate mb-10 flex items-end justify-between gap-6 overflow-hidden rounded-3xl bg-neutral-950 p-6 text-white md:hidden"
  >
    <div className="pointer-events-none absolute -top-20 -right-16 -z-10 size-56 rounded-full bg-white/10 blur-3xl" />
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <LogoMark className="size-8 rounded-lg bg-white text-neutral-950 dark:bg-white" />
        <span className="font-semibold tracking-tight">머니노트</span>
      </div>
      <p className="text-xl leading-snug font-semibold tracking-tight">
        쓴 만큼 보이고,
        <br />
        <span className="text-white/45">보이는 만큼 아껴요.</span>
      </p>
    </div>
    <WeekBars className="h-20 w-28 shrink-0 gap-1.5" labels={false} />
  </div>
);

/** 넓은 화면 왼쪽의 검정 브랜드 패널. 테마와 상관없이 늘 어둡다. */
const BrandPanel = () => (
  <aside
    aria-hidden
    className="relative isolate hidden w-[46%] max-w-2xl flex-col justify-between overflow-hidden border-r border-white/10 bg-neutral-950 p-10 text-white md:flex lg:p-14"
  >
    {/* 가는 격자와 위쪽의 은은한 빛 */}
    <div className="pointer-events-none absolute inset-0 -z-10 [background-image:linear-gradient(to_right,rgb(255_255_255/0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.05)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_top_right,black_20%,transparent_70%)] [background-size:44px_44px]" />
    <div className="pointer-events-none absolute -top-32 -right-32 -z-10 size-[30rem] rounded-full bg-white/10 blur-3xl" />

    <div className="flex items-center gap-2.5">
      <LogoMark className="bg-white text-neutral-950 dark:bg-white" />
      <span className="text-lg font-semibold tracking-tight">머니노트</span>
    </div>

    <div className="space-y-10">
      <div className="space-y-4">
        <p className="text-4xl leading-[1.15] font-semibold tracking-tight lg:text-5xl">
          쓴 만큼 보이고,
          <br />
          <span className="text-white/45">보이는 만큼 아껴요.</span>
        </p>
        <p className="max-w-sm text-[15px] leading-relaxed text-white/55">
          내역, 예산, 달력, 지도까지. 혼자 쓰는 가계부를 한곳에서.
        </p>
      </div>

      <div className="max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-xs font-medium text-white/60">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            이번 주
          </span>
          <span className="h-2 w-16 rounded-full bg-white/10" />
        </div>
        <WeekBars className="mt-5 h-36" />
      </div>
    </div>

    <p className="text-xs text-white/35">혼자 쓰는 가계부 · 비밀번호로만 열려요</p>
  </aside>
);

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
    <div className="flex min-h-dvh bg-background">
      <BrandPanel />

      <main className="flex flex-1 items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-sm animate-in duration-500 fade-in slide-in-from-bottom-3 motion-reduce:animate-none">
          <MobileHero />

          <h1 className="text-3xl font-semibold tracking-tight">로그인</h1>
          <p className="mt-2 text-[15px] text-muted-foreground">
            비밀번호를 입력하면 가계부가 열려요.
          </p>

          <form
            onSubmit={handleSubmit}
            className={cn("mt-8 space-y-5", isShaking && "animate-shake")}
          >
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                비밀번호
              </label>
              <InputGroup className="h-12 rounded-xl bg-card px-1 shadow-xs">
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
                  placeholder="비밀번호 입력"
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
                  className="flex items-center gap-1.5 text-sm font-medium text-destructive"
                >
                  <CircleAlert className="size-4 shrink-0" />
                  {error}
                </p>
              )}
            </div>

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
          </form>

          <p className="mt-8 flex items-center gap-1.5 border-t pt-6 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 shrink-0" />
            5분에 5번까지 시도할 수 있어요. 로그인은 이 브라우저에만 남아요.
          </p>
        </div>
      </main>
    </div>
  );
};
