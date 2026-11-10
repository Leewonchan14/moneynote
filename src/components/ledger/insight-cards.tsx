"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { CategoryIcon } from "@/components/ledger/category-icon";
import { Card, CardContent } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { LedgerEntryView, LedgerMonthPayload } from "@/lib/db/ledger";
import { kst } from "@/lib/kst";
import { formatWon } from "@/lib/ledger/format";
import type { SavingsInsight, UnusualSpending } from "@/lib/ledger/insights";
import { cn } from "@/lib/utils";

const signedWon = (value: number) => `${value > 0 ? "+" : ""}${formatWon(value)}`;
const shortDay = (date: string) =>
  `${Number(date.slice(5, 7))}.${Number(date.slice(8, 10))}`;

/* ─────────────── 평소와 다른 지출 ─────────────── */

export const UnusualSpendCard = ({
  unusual,
  categories,
  entries,
  onEdit,
}: {
  unusual: UnusualSpending;
  categories: LedgerMonthPayload["categories"];
  /** 목록에서 내역을 눌러 바로 고칠 수 있게 이 달의 내역을 받는다. */
  entries: LedgerEntryView[];
  onEdit: (entry: LedgerEntryView) => void;
}) => {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const { total, throughDay, baselineMonths } = unusual;
  const basis = throughDay
    ? `최근 ${baselineMonths.length}개월 1~${throughDay}일 중앙값과 비교`
    : `최근 ${baselineMonths.length}개월 중앙값과 비교`;

  return (
    <Card className="md:col-span-2" data-testid="unusual-spend-card">
      <CardContent className="px-4">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[12px] font-medium text-muted-foreground">
            평소와 다른 지출
          </p>
          {baselineMonths.length > 0 && (
            <span className="shrink-0 text-[10px] text-muted-foreground">{basis}</span>
          )}
        </div>

        {!total ? (
          <p className="mt-2 text-[12px] text-muted-foreground">
            이전 기록이 3개월 이상 쌓이면 평소와 비교해 드려요
          </p>
        ) : (
          <>
            <p className="mt-2 text-[13px] text-foreground">
              {total.ratio == null ? (
                <>평소 지출 기록이 없어요</>
              ) : Math.abs(total.diff) < 50_000 || Math.abs(total.ratio - 1) < 0.15 ? (
                <>
                  전체 지출은 <b className="font-semibold">평소와 비슷해요</b>
                </>
              ) : (
                <>
                  전체 지출이 평소보다{" "}
                  <b
                    className={cn(
                      "font-semibold tabular-nums",
                      total.diff > 0
                        ? "text-[color:var(--destructive)]"
                        : "text-[color:var(--success)]"
                    )}
                  >
                    {signedWon(total.diff)}
                  </b>
                </>
              )}
            </p>
            <p className="text-[11px] text-muted-foreground tabular-nums">
              평소 {formatWon(total.usual)} → 이번 {formatWon(total.current)}
            </p>

            {unusual.categories.length > 0 ? (
              <ul aria-label="평소와 다른 분류" className="mt-3 space-y-2">
                {unusual.categories.map((item) => {
                  const category =
                    item.categoryId == null ? null : categoryById.get(item.categoryId);
                  const up = item.direction === "up";
                  return (
                    <li
                      key={item.categoryId ?? "none"}
                      className="flex items-center justify-between gap-2 text-[12px]"
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <CategoryIcon
                          icon={category?.icon ?? "tag"}
                          color={category?.color ?? "neutral"}
                          size={22}
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-foreground">
                            {item.name}
                          </span>
                          <span className="block text-[10px] text-muted-foreground tabular-nums">
                            평소 {formatWon(item.usual)} → {formatWon(item.current)}
                          </span>
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end">
                        <span
                          className={cn(
                            "font-medium tabular-nums",
                            up
                              ? "text-[color:var(--destructive)]"
                              : "text-[color:var(--success)]"
                          )}
                        >
                          {signedWon(item.diff)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {item.ratio == null
                            ? "평소엔 거의 안 씀"
                            : up
                              ? `${item.ratio}배`
                              : item.current === 0
                                ? "이번엔 안 씀"
                                : `평소의 ${Math.round((item.current / item.usual) * 100)}%`}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-3 text-[12px] text-muted-foreground">
                분류별로도 평소와 크게 다른 곳이 없어요
              </p>
            )}
          </>
        )}

        {unusual.entries.length > 0 && (
          <div className="mt-4 border-t pt-3">
            <p className="text-[11px] font-medium text-muted-foreground">
              유난히 큰 내역
            </p>
            <ul aria-label="유난히 큰 내역" className="mt-1.5 space-y-0.5">
              {unusual.entries.map((item) => {
                const entry = entryById.get(item.id);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      disabled={!entry}
                      onClick={() => entry && onEdit(entry)}
                      className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-1 text-left text-[12px] enabled:hover:bg-muted"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-foreground">
                          <span className="mr-1.5 text-muted-foreground tabular-nums">
                            {shortDay(item.entryDate)}
                          </span>
                          {item.memo || item.groupName}
                          {item.onTrip && (
                            <span className="ml-1 text-[10px] text-muted-foreground">
                              여행
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-[10px] text-muted-foreground tabular-nums">
                          {item.groupName} 평소 {formatWon(item.usual)}의 {item.ratio}배
                        </span>
                      </span>
                      <span className="shrink-0 font-medium text-foreground tabular-nums">
                        {formatWon(item.amount)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

/* ─────────────── 저축·고정비 ─────────────── */

const savingsChartConfig = {
  savingShare: { label: "저축 비중", color: "var(--success)" },
  fixedShare: { label: "고정비 비중", color: "var(--primary)" },
} satisfies ChartConfig;

const FIXED_PREVIEW = 4;

export const SavingsCard = ({ savings }: { savings: SavingsInsight }) => {
  const [showAllFixed, setShowAllFixed] = useState(false);
  const current = savings.months.find((row) => row.month === savings.month);
  if (!current) return null;

  const multiYear =
    savings.months[0]?.month.slice(0, 4) !== savings.months.at(-1)?.month.slice(0, 4);
  const monthTick = (month: string) =>
    kst(`${month}-01`).format(multiYear ? "YY.M" : "M월");
  const fixedItems = showAllFixed
    ? savings.fixedItems
    : savings.fixedItems.slice(0, FIXED_PREVIEW);
  const pctText = (value: number | null) => (value == null ? "-" : `${value}%`);

  return (
    <Card className="md:col-span-2" data-testid="savings-card">
      <CardContent className="px-4">
        <p className="text-[12px] font-medium text-muted-foreground">저축·고정비</p>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="min-w-0 rounded-xl bg-muted/70 p-2.5">
            <p className="text-[11px] text-muted-foreground">저축 비중</p>
            <p className="mt-0.5 text-[17px] font-semibold text-[color:var(--success)] tabular-nums">
              {pctText(current.savingShare)}
            </p>
            <p className="truncate text-[10px] text-muted-foreground tabular-nums">
              저축 {formatWon(current.saving)} · 지출 {formatWon(current.expense)}
            </p>
          </div>
          <div className="min-w-0 rounded-xl bg-muted/70 p-2.5">
            <p className="text-[11px] text-muted-foreground">고정비 비중</p>
            <p className="mt-0.5 text-[17px] font-semibold text-primary tabular-nums">
              {pctText(current.fixedShare)}
            </p>
            <p className="truncate text-[10px] text-muted-foreground tabular-nums">
              고정비 {formatWon(current.fixed)}
            </p>
          </div>
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          저축 비중은 나간 돈(지출+적금 이체) 중 적금으로 간 몫이에요.
          {current.savingsRate != null && (
            <>
              {" "}
              수입 대비로는{" "}
              <b className="font-medium text-foreground tabular-nums">
                {current.savingsRate}%
              </b>
              를 남겼어요.
            </>
          )}
        </p>

        {savings.months.length > 1 && (
          <>
            <div className="mt-3 flex items-center justify-end gap-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-[color:var(--success)]" />
                저축 비중
              </span>
              <span className="flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-primary" />
                고정비 비중
              </span>
            </div>
            <ChartContainer
              config={savingsChartConfig}
              role="img"
              aria-label="월별 저축·고정비 비중"
              className="mt-1 aspect-auto h-[160px] w-full"
            >
              <LineChart
                data={savings.months}
                margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="month"
                  tickFormatter={monthTick}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  minTickGap={16}
                  fontSize={10}
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 50, 100]}
                  tickFormatter={(value) => `${value}%`}
                  tickLine={false}
                  axisLine={false}
                  width={36}
                  fontSize={10}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(month) => kst(`${month}-01`).format("YYYY년 M월")}
                      formatter={(value, name) => (
                        <div className="flex w-full items-center gap-2 whitespace-nowrap">
                          <span
                            className="size-2.5 shrink-0 rounded-[2px]"
                            style={{ background: `var(--color-${name})` }}
                          />
                          <span className="text-muted-foreground">
                            {
                              savingsChartConfig[name as keyof typeof savingsChartConfig]
                                ?.label
                            }
                          </span>
                          <span className="ml-auto font-medium text-foreground tabular-nums">
                            {value == null ? "-" : `${value}%`}
                          </span>
                        </div>
                      )}
                    />
                  }
                />
                <Line
                  dataKey="savingShare"
                  stroke="var(--color-savingShare)"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  connectNulls
                  isAnimationActive={false}
                />
                <Line
                  dataKey="fixedShare"
                  stroke="var(--color-fixedShare)"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  connectNulls
                  isAnimationActive={false}
                />
              </LineChart>
            </ChartContainer>
          </>
        )}

        <div className="mt-3 border-t pt-3">
          <p className="text-[11px] font-medium text-muted-foreground">이 달의 고정비</p>
          {savings.fixedItems.length ? (
            <>
              <ul aria-label="이 달의 고정비" className="mt-1.5 space-y-1.5">
                {fixedItems.map((item) => (
                  <li
                    key={item.memo}
                    className="flex items-center justify-between gap-2 text-[12px]"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-foreground">{item.memo}</span>
                      <span className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">
                        {item.reason === "recurring" ? "반복 거래" : "매달 나감"}
                      </span>
                    </span>
                    <span className="shrink-0 text-foreground tabular-nums">
                      {formatWon(item.amount)}
                    </span>
                  </li>
                ))}
              </ul>
              {savings.fixedItems.length > FIXED_PREVIEW && (
                <button
                  type="button"
                  onClick={() => setShowAllFixed((value) => !value)}
                  className="mt-1.5 flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  {showAllFixed
                    ? "접기"
                    : `${savings.fixedItems.length - FIXED_PREVIEW}개 더 보기`}
                  <ChevronDown
                    className={cn(
                      "size-3 transition-transform",
                      showAllFixed && "rotate-180"
                    )}
                  />
                </button>
              )}
            </>
          ) : (
            <p className="mt-1.5 text-[12px] text-muted-foreground">
              이 달에는 고정비로 본 지출이 없어요
            </p>
          )}
          <p className="mt-2 text-[10px] text-muted-foreground">
            반복 거래로 등록했거나, 같은 내용이 3개월 넘게 비슷한 금액으로 나간
            지출이에요.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
