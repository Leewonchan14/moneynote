"use client";

import { useState, type PointerEvent, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

import { ChartContainer, type ChartConfig } from "@/components/ui/chart";

import { formatCompactWon } from "@/lib/ledger/format";
import { cn } from "@/lib/utils";

export type TrendPoint = { date: string; value: number };

interface Props {
  title: string;
  ariaLabel: string;
  points: TrendPoint[];
  /** 선 위에 찍을 점. title은 마우스를 올렸을 때 보인다. */
  dots?: { index: number; title: string }[];
  /** 제목 옆에 놓는 보기 전환 버튼 */
  controls?: ReactNode;
  /** 아무 지점도 고르지 않았을 때 오른쪽에 보이는 문구 */
  idleText: string;
  formatPoint: (point: TrendPoint) => string;
}

/** 22,000 → 2.2만, 음수는 -2.2만 */
export const compactWon = (value: number): string => {
  const rounded = Math.round(value);
  return rounded < 0
    ? `-${formatCompactWon(Math.abs(rounded))}`
    : formatCompactWon(rounded);
};

export const shortDate = (date: string): string => date.slice(5).replace("-", ".");

const chartConfig = {
  value: { label: "금액", color: "var(--primary)" },
} satisfies ChartConfig;

// 그래프 영역의 왼쪽(Y축 너비)과 오른쪽 여백. 가리킨 지점을 계산할 때도 같은 값을 쓴다.
const Y_AXIS_WIDTH = 44;
const RIGHT_MARGIN = 10;

/**
 * 원 단위 값을 그리는 선 그래프(shadcn Chart = Recharts). 가리킨 지점의 값은
 * 휴대폰에서도 읽을 수 있게 떠 있는 툴팁 대신 제목 오른쪽에 보여 준다.
 */
export const TrendChart = ({
  title,
  ariaLabel,
  points,
  dots = [],
  controls,
  idleText,
  formatPoint,
}: Props) => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const dotTitles = new Map(dots.map((dot) => [dot.index, dot.title]));
  const activePoint = activeIndex == null ? null : (points[activeIndex] ?? null);

  // Recharts 툴팁은 손가락을 움직일 때만 위치를 계산해서 탭 한 번으로는 값이 안 바뀐다.
  // 날짜 축은 첫 점과 끝 점이 그래프 양 끝에 오므로 x 좌표로 직접 index를 구한다.
  const selectAt = (event: PointerEvent<HTMLDivElement>) => {
    if (!points.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const plotWidth = Math.max(rect.width - Y_AXIS_WIDTH - RIGHT_MARGIN, 1);
    const ratio = (event.clientX - rect.left - Y_AXIS_WIDTH) / plotWidth;
    const index = Math.round(ratio * (points.length - 1));
    setActiveIndex(Math.min(Math.max(index, 0), points.length - 1));
  };

  // 터치는 손을 떼면 바로 leave가 오므로, 읽을 수 있게 고른 지점을 남겨 둔다.
  const clearOnMouseLeave = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse") setActiveIndex(null);
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <div className="flex items-center gap-2">
          <p className="text-[12px] font-medium text-muted-foreground">{title}</p>
          {controls}
        </div>
        <p
          className={cn(
            "text-[11px] whitespace-nowrap tabular-nums",
            activePoint && "font-medium text-foreground",
            !activePoint && "text-muted-foreground"
          )}
        >
          {activePoint ? formatPoint(activePoint) : idleText}
        </p>
      </div>

      <ChartContainer
        config={chartConfig}
        role="img"
        aria-label={ariaLabel}
        className="mt-2 aspect-auto h-[200px] w-full touch-pan-y"
        onPointerDown={selectAt}
        onPointerMove={selectAt}
        onPointerLeave={clearOnMouseLeave}
      >
        <AreaChart
          data={points}
          margin={{ top: 8, right: RIGHT_MARGIN, bottom: 0, left: 0 }}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={32}
            fontSize={10}
          />
          <YAxis
            tickFormatter={compactWon}
            tickLine={false}
            axisLine={false}
            width={Y_AXIS_WIDTH}
            fontSize={10}
          />
          <Area
            dataKey="value"
            type="linear"
            stroke="var(--color-value)"
            strokeWidth={2}
            fill="var(--color-value)"
            fillOpacity={0.12}
            isAnimationActive={false}
            activeDot={false}
            dot={({ index, cx, cy }) => {
              const dotTitle = dotTitles.get(index);
              if (dotTitle == null && points.length > 1) return <g key={index} />;
              return (
                <circle
                  key={index}
                  cx={cx}
                  cy={cy}
                  r={3.5}
                  fill="var(--color-value)"
                  stroke="var(--card)"
                  strokeWidth={1.5}
                >
                  {dotTitle && <title>{dotTitle}</title>}
                </circle>
              );
            }}
          />
          {activePoint && (
            <ReferenceLine x={activePoint.date} stroke="var(--muted-foreground)" />
          )}
          {activePoint && (
            <ReferenceDot
              x={activePoint.date}
              y={activePoint.value}
              r={4.5}
              fill="var(--color-value)"
              stroke="var(--card)"
              strokeWidth={2}
            />
          )}
        </AreaChart>
      </ChartContainer>
    </>
  );
};
