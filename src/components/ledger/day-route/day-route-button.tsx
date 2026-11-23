"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Route } from "lucide-react";
import { useState } from "react";

import { DayRoutePlayer } from "@/components/ledger/day-route/day-route-player";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuthStore } from "@/lib/auth-store";
import { LEDGER_LIVE_QUERY, ledgerRequest } from "@/lib/ledger/client";
import {
  DAY_ROUTE_MIN_LOCATED,
  formatDistance,
  routeDistanceKm,
  type DayRouteDay,
  type DayRoutePayload,
} from "@/lib/ledger/day-route";
import { formatDayKo, formatWon, todayKst } from "@/lib/ledger/format";
import { cn } from "@/lib/utils";

/** 모든 가계부 쿼리처럼 ["ledger", ...] 아래에 두어 내역을 고치면 함께 새로 읽는다. */
const dayRouteKey = (date: string) => ["ledger", "day-route", date] as const;

/** "오늘 4곳 · 총 이동 약 6.2km · 총 지출 52,000원" */
export const dayRouteSummary = (route: DayRoutePayload) => {
  const word = route.date === todayKst() ? "오늘" : "이날";
  const spent = route.stops.reduce((sum, stop) => sum + stop.amount, 0);
  return [
    `${word} ${route.stops.length}곳`,
    route.stops.length > 1 &&
      `총 이동 약 ${formatDistance(routeDistanceKm(route.stops))}`,
    `총 지출 ${formatWon(spent)}`,
  ]
    .filter(Boolean)
    .join(" · ");
};

/**
 * 기간 안에서 동선 보기를 띄울 수 있는 날. 내역·통계 탭은 날마다 묻지 않고 이것 한 번으로
 * 버튼 자리를 정한다. 최근 날부터.
 */
export const useDayRouteDays = (from: string | undefined, to: string | undefined) => {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["ledger", "day-route-days", from, to] as const,
    queryFn: () =>
      ledgerRequest<{ days: DayRouteDay[] }>(
        token,
        `/api/ledger/day-route/days?from=${from}&to=${to}`
      ),
    enabled: Boolean(token && from && to),
    placeholderData: keepPreviousData,
    ...LEDGER_LIVE_QUERY,
  });
};

interface Props {
  /** YYYY-MM-DD */
  date: string;
  className?: string;
  /**
   * 그날 동선을 볼 수 있다는 걸 이미 안다(useDayRouteDays). 이때는 미리 묻지 않고
   * 버튼을 누를 때 그날 동선을 읽는다. 날이 여럿 나오는 내역·통계 탭에서 쓴다.
   */
  known?: boolean;
}

/**
 * 그날 지도에 찍힌 지출이 두 건 이상이면 "동선 보기" 버튼을 보여 주고,
 * 누르면 그날 다닌 곳을 시간 순서로 잇는 재생 창을 연다.
 */
export const DayRouteButton = ({ date, className, known = false }: Props) => {
  const token = useAuthStore((s) => s.token);
  const [open, setOpen] = useState(false);
  // 연 순간의 동선을 그대로 보여 준다. 재생 중에 30초마다 새로 읽어도 그림이 흔들리지 않는다.
  const [shown, setShown] = useState<DayRoutePayload | null>(null);
  const { data, isError } = useQuery({
    queryKey: dayRouteKey(date),
    queryFn: () =>
      ledgerRequest<DayRoutePayload>(token, `/api/ledger/day-route?date=${date}`),
    enabled: Boolean(token) && (!known || open),
    ...LEDGER_LIVE_QUERY,
  });
  const ready = data && data.date === date ? data : null;

  // 연 뒤에 처음 받은 동선을 붙잡아 둔다(미리 받아 두었으면 누르자마자).
  if (open && !shown && ready) setShown(ready);

  if (!known && (!ready || ready.located < DAY_ROUTE_MIN_LOCATED)) return null;

  const close = () => {
    setOpen(false);
    setShown(null);
  };

  return (
    <>
      <Button
        size="xs"
        variant="outline"
        className={cn("shrink-0", className)}
        onClick={() => setOpen(true)}
      >
        <Route />
        동선 보기
      </Button>
      <Dialog open={open} onOpenChange={(next) => !next && close()}>
        <DialogContent className="flex max-h-[92dvh] flex-col gap-3 overflow-y-auto overscroll-contain sm:max-w-lg">
          <DialogHeader className="gap-1.5 pr-8">
            <DialogTitle>{formatDayKo(date)} 동선</DialogTitle>
            <DialogDescription className="text-[13px] tabular-nums">
              {shown && dayRouteSummary(shown)}
            </DialogDescription>
            {shown && shown.untimed > 0 && (
              <p className="text-[12px] text-muted-foreground">
                시간을 안 적은 {shown.untimed}건은 맨 뒤에 이었어요.
              </p>
            )}
          </DialogHeader>
          {/* 열 때마다 처음부터 다시 그린다. */}
          {shown ? (
            <DayRoutePlayer stops={shown.stops} />
          ) : (
            <p
              role="status"
              className="py-10 text-center text-[13px] text-muted-foreground"
            >
              {isError ? "그날 동선을 불러오지 못했어요." : "동선을 불러오는 중…"}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
