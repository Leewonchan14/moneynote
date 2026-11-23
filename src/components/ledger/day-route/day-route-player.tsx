"use client";

import {
  Loader2,
  MapPin,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import type {
  DayRouteFocus,
  DayRouteMapController,
} from "@/components/ledger/day-route/day-route-map";
import { Button } from "@/components/ui/button";
import {
  easeInOut,
  formatDistance,
  haversineKm,
  type DayRouteStop,
} from "@/lib/ledger/day-route";
import { formatWon } from "@/lib/ledger/format";
import { cn } from "@/lib/utils";

/** 지도(maplibre)는 브라우저에서만, 동선을 열 때만 받는다. */
const DayRouteMap = dynamic(
  () => import("@/components/ledger/day-route/day-route-map").then((m) => m.DayRouteMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex size-full items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    ),
  }
);

/** 정거장에 머무는 시간과 다음 정거장까지 선을 그리는 시간(ms) */
const DWELL_MS = 1200;
const LEG_MS = 1800;
const MOVE_MS = 900;

/** 동작 줄이기를 켠 기기에서는 저절로 재생하지 않고, 선도 단번에 긋는다. */
const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const StopPhoto = ({ src }: { src: string | null }) => {
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
      {src && !failed ? (
        // 네이버 이미지 서버에서 바로 받는다. next/image 최적화를 거치지 않는다.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      ) : (
        <MapPin className="size-5 text-muted-foreground/60" />
      )}
    </div>
  );
};

const StopCard = ({
  stop,
  index,
  next,
}: {
  stop: DayRouteStop;
  index: number;
  next: DayRouteStop | null;
}) => {
  const memos = stop.payments.filter(
    (payment) => payment.memo && payment.memo !== stop.name
  );
  return (
    <section
      aria-label="지금 곳"
      aria-live="polite"
      className="flex gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10"
    >
      <StopPhoto key={stop.id} src={stop.imageUrl} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground tabular-nums">
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[#e5484d] text-[11px] font-semibold text-white">
            {index + 1}
          </span>
          {stop.time ?? "시간 없음"}
          {stop.category && <span className="truncate">· {stop.category}</span>}
        </p>
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="min-w-0 truncate text-[15px] font-semibold text-foreground">
            {stop.name}
          </h3>
          <span className="shrink-0 text-[14px] font-semibold text-foreground tabular-nums">
            {formatWon(stop.amount)}
          </span>
        </div>
        {memos.length > 0 && (
          <p className="truncate text-[12px] text-muted-foreground">
            {stop.payments.length > 1
              ? `결제 ${stop.payments.length}건 · ${memos.map((p) => p.memo).join(", ")}`
              : memos[0].memo}
          </p>
        )}
        <p className="truncate text-[12px] text-muted-foreground tabular-nums">
          {next
            ? `다음 ${next.name}까지 ${formatDistance(haversineKm(stop, next))}`
            : index > 0
              ? "마지막 곳이에요"
              : ""}
        </p>
      </div>
    </section>
  );
};

interface Props {
  stops: DayRouteStop[];
}

/**
 * 그날의 동선 다시 보기. 정거장에 잠깐 머문 뒤 다음 정거장까지 선을 긋고, 지도가 따라간다.
 * 시간은 프레임 수가 아니라 흐른 시간으로 재므로, GPU 없이 지도가 느리게 그려져도 같은 속도로 끝난다.
 * 재생·일시정지·앞뒤 넘기기 버튼은 늘 화면에 있다.
 */
export const DayRoutePlayer = ({ stops }: Props) => {
  const last = stops.length - 1;
  const [reduced] = useState(prefersReducedMotion);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(() => !reduced && last > 0);
  const [focus, setFocus] = useState<DayRouteFocus>("all");
  const controllerRef = useRef<DayRouteMapController>(null);
  /** 지금 정거장에서 흐른 시간(ms). 일시정지했다 다시 재생하면 이어서 그린다. */
  const elapsedRef = useRef(0);

  useEffect(() => {
    if (!playing) return;
    if (step >= last) {
      // 마지막 곳에 잠깐 머문 뒤 하루 동선 전체를 보여 준다.
      const timer = window.setTimeout(() => {
        setPlaying(false);
        setFocus("all");
      }, DWELL_MS);
      return () => window.clearTimeout(timer);
    }
    const legMs = reduced ? 0 : LEG_MS;
    let raf = 0;
    let start = -1;
    let travelling = elapsedRef.current >= DWELL_MS;
    const tick = (now: number) => {
      if (start < 0) start = now - elapsedRef.current;
      const elapsed = now - start;
      elapsedRef.current = elapsed;
      if (elapsed >= DWELL_MS) {
        if (!travelling) {
          travelling = true;
          setFocus("next");
        }
        const t = legMs ? Math.min(1, (elapsed - DWELL_MS) / legMs) : 1;
        controllerRef.current?.draw(step, easeInOut(t));
        if (t >= 1) {
          elapsedRef.current = 0;
          setFocus("hold");
          setStep(step + 1);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, step, last, reduced]);

  /** 직접 넘기면 재생을 멈추고 그 정거장에 선다. */
  const goTo = (index: number) => {
    const target = Math.max(0, Math.min(last, index));
    setPlaying(false);
    elapsedRef.current = 0;
    if (target === step) {
      controllerRef.current?.draw(step, 0);
      return;
    }
    setStep(target);
    setFocus("arrive");
  };

  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (step >= last) {
      // 끝까지 봤으면 처음부터 다시 그린다.
      elapsedRef.current = 0;
      setStep(0);
      setFocus("all");
    }
    setPlaying(true);
  };

  const current = stops[Math.min(step, last)];
  const atEnd = step >= last;
  const single = last === 0;

  return (
    <div className="flex flex-col gap-3" data-route-step={step + 1}>
      <div className="h-[38dvh] min-h-56 overflow-hidden rounded-xl ring-1 ring-foreground/10">
        <DayRouteMap
          stops={stops}
          step={step}
          focus={focus}
          moveMs={reduced ? 0 : MOVE_MS}
          controllerRef={controllerRef}
          onSelect={goTo}
        />
      </div>

      <StopCard stop={current} index={step} next={stops[step + 1] ?? null} />

      {!single && (
        <div
          role="group"
          aria-label="동선 재생"
          className="flex items-center justify-between gap-2"
        >
          <span className="w-12 text-[12px] text-muted-foreground tabular-nums">
            {step + 1} / {stops.length}
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="icon-lg"
              variant="outline"
              aria-label="이전 곳"
              disabled={step === 0}
              onClick={() => goTo(step - 1)}
            >
              <SkipBack />
            </Button>
            <Button
              size="icon-lg"
              className="size-11 rounded-full"
              aria-label={playing ? "일시정지" : atEnd ? "처음부터 다시 보기" : "재생"}
              onClick={togglePlay}
            >
              {playing ? <Pause /> : atEnd ? <RotateCcw /> : <Play />}
            </Button>
            <Button
              size="icon-lg"
              variant="outline"
              aria-label="다음 곳"
              disabled={atEnd}
              onClick={() => goTo(step + 1)}
            >
              <SkipForward />
            </Button>
          </div>
          <span className="w-12" />
        </div>
      )}

      <ol aria-label="들른 곳" className="flex flex-col gap-0.5">
        {stops.map((stop, index) => (
          <li key={stop.id}>
            <button
              type="button"
              aria-current={index === step || undefined}
              onClick={() => goTo(index)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                index === step && "bg-muted"
              )}
            >
              <span
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold tabular-nums",
                  index === step
                    ? "bg-[#e5484d] text-white"
                    : index < step
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground ring-1 ring-border"
                )}
              >
                {index + 1}
              </span>
              <span className="w-10 shrink-0 text-[12px] text-muted-foreground tabular-nums">
                {stop.time ?? "—"}
              </span>
              <span className="min-w-0 flex-1 truncate text-foreground">{stop.name}</span>
              <span className="shrink-0 text-muted-foreground tabular-nums">
                {formatWon(stop.amount)}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
};
