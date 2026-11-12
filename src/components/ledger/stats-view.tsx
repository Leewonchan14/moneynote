"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Wallet,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Label,
  Pie,
  PieChart,
  Sector,
  XAxis,
  YAxis,
  type PieSectorShapeProps,
} from "recharts";

import {
  categoryChipClass,
  ExcludeTripsChip,
  ExpenseCategoryChips,
  matchesSubcategory,
  SubcategoryChips,
  type CategoryFilter,
  type SubcategoryFilter,
} from "@/components/ledger/category-chips";
import {
  CATEGORY_COLOR_HEX,
  CategoryIcon,
  EntryIcon,
} from "@/components/ledger/category-icon";
import { SavingsCard, UnusualSpendCard } from "@/components/ledger/insight-cards";
import { MonthPicker, WeekPicker } from "@/components/ledger/period-picker";
import { groupTopExpenses, TopExpensesList } from "@/components/ledger/top-expenses";
import { compactWon, shortDate, TrendChart } from "@/components/ledger/trend-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { DatePicker } from "@/components/ui/date-picker";
import { useAuthStore } from "@/lib/auth-store";
import type { LedgerEntryView, LedgerMonthPayload } from "@/lib/db/ledger";
import type { LedgerInsights } from "@/lib/db/ledger-insights";
import type { LedgerStats } from "@/lib/db/ledger-stats";
import { kst } from "@/lib/kst";
import { LEDGER_LIVE_QUERY, ledgerKeys, ledgerRequest } from "@/lib/ledger/client";
import { comparableMonthRange, compareLedgerPeriods } from "@/lib/ledger/compare";
import { currentMonthKst, formatWon, shiftMonth, todayKst } from "@/lib/ledger/format";
import {
  CATEGORY_COLOR_OPTIONS,
  type LedgerCategoryColorKey,
  type LedgerCategoryIconKey,
} from "@/lib/ledger/icons";
import { projectMonthExpense } from "@/lib/ledger/pace";
import {
  comparableWeekRange,
  shiftWeek,
  weekRange,
  weekStartOf,
} from "@/lib/ledger/week";
import { cn } from "@/lib/utils";

interface Props {
  categories: LedgerMonthPayload["categories"];
  subcategories: LedgerMonthPayload["subcategories"];
  month: string;
  onMonthChange: (month: string) => void;
  expenseReference: LedgerMonthPayload["expenseReference"];
  totalBudget: number | null;
  onEdit: (entry: LedgerEntryView) => void;
  trips: LedgerMonthPayload["trips"];
  /** 내역·달력에서 주 단위로 보고 있었으면 주별 리포트로 연다. */
  initialPeriod: "month" | "week";
  /** 주별 리포트의 주(월요일). 내역·달력 탭과 같은 주를 함께 쓴다. */
  weekStart: string;
  onWeekChange: (weekStart: string) => void;
  /** 여행 내역을 뺀 리포트. 내역·달력 탭과 같은 값을 함께 쓴다. */
  excludeTrips: boolean;
  onExcludeTripsChange: (value: boolean) => void;
}

const RANGES = [
  { id: "month", label: "월별" },
  { id: "week", label: "주별" },
  { id: "trip", label: "여행" },
  { id: "all", label: "전체" },
  { id: "3m", label: "최근 3개월" },
  { id: "30", label: "최근 30일" },
  { id: "7", label: "최근 7일" },
  { id: "custom", label: "직접 설정" },
] as const;

type RangeId = (typeof RANGES)[number]["id"];

const fetchStats = async (
  token: string,
  from?: string,
  to?: string,
  scope: { tripId?: number; excludeTrips?: boolean } = {}
): Promise<LedgerStats> => {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (scope.tripId != null) params.set("trip", String(scope.tripId));
  if (scope.excludeTrips) params.set("excludeTrips", "1");
  const query = params.toString();
  const { stats } = await ledgerRequest<{ stats: LedgerStats }>(
    token,
    `/api/ledger/stats${query ? `?${query}` : ""}`
  );
  return stats;
};

const fetchInsights = async (
  token: string,
  month: string,
  excludeTrips: boolean
): Promise<LedgerInsights> => {
  const params = new URLSearchParams({ month });
  if (excludeTrips) params.set("excludeTrips", "1");
  const { insights } = await ledgerRequest<{ insights: LedgerInsights }>(
    token,
    `/api/ledger/insights?${params}`
  );
  return insights;
};

const StatCard = ({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) => (
  <Card className={` ${className}`}>
    <CardContent className="px-4">{children}</CardContent>
  </Card>
);

const KpiCards = ({ stats }: { stats: LedgerStats }) => {
  const { income, expense, net, avgDailyExpense, incomeCount, expenseCount } =
    stats.summary;

  return (
    <div className="grid grid-cols-2 gap-2 md:col-span-2 md:grid-cols-4">
      <div className="rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
        <p className="text-[11px] font-medium text-muted-foreground">
          총 입금 · {incomeCount}건
        </p>
        <p className="mt-1 text-[17px] font-semibold text-[color:var(--success)] tabular-nums">
          {formatWon(income)}
        </p>
      </div>
      <div className="rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
        <p className="text-[11px] font-medium text-muted-foreground">
          총 지출 · {expenseCount}건
        </p>
        <p className="mt-1 text-[17px] font-semibold text-primary tabular-nums">
          {formatWon(expense)}
        </p>
      </div>
      <div className="rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
        <p className="text-[11px] font-medium text-muted-foreground">순증감</p>
        <p
          className={`mt-1 text-[17px] font-semibold tabular-nums ${
            net > 0
              ? "text-[color:var(--success)]"
              : net < 0
                ? "text-[color:var(--destructive)]"
                : "text-foreground"
          }`}
        >
          {net > 0 ? "+" : ""}
          {formatWon(net)}
        </p>
      </div>
      <div className="rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
        <p className="text-[11px] font-medium text-muted-foreground">하루 평균 지출</p>
        <p className="mt-1 text-[17px] font-semibold text-foreground tabular-nums">
          {formatWon(avgDailyExpense)}
        </p>
      </div>
    </div>
  );
};

const AllTimeCard = ({ allTime }: { allTime: LedgerStats["allTime"] }) => {
  const { from, to, income, expense, net, incomeCount, expenseCount } = allTime;

  return (
    <StatCard className="md:col-span-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[12px] font-medium text-muted-foreground">
          이제까지 총 입금·지출
        </p>
        {from && to ? (
          <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
            {from.replaceAll("-", ".")} ~ {to.replaceAll("-", ".")}
          </span>
        ) : null}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="min-w-0 rounded-xl bg-muted/70 p-2.5">
          <p className="text-[11px] text-muted-foreground">입금 · {incomeCount}건</p>
          <p className="mt-0.5 truncate text-[13px] font-semibold text-[color:var(--success)] tabular-nums">
            {formatWon(income)}
          </p>
        </div>
        <div className="min-w-0 rounded-xl bg-muted/70 p-2.5">
          <p className="text-[11px] text-muted-foreground">지출 · {expenseCount}건</p>
          <p className="mt-0.5 truncate text-[13px] font-semibold text-primary tabular-nums">
            {formatWon(expense)}
          </p>
        </div>
        <div className="col-span-2 min-w-0 rounded-xl bg-muted/70 p-2.5 sm:col-span-1">
          <p className="text-[11px] text-muted-foreground">입금 - 지출</p>
          <p
            className={`mt-0.5 truncate text-[13px] font-semibold tabular-nums ${
              net > 0
                ? "text-[color:var(--success)]"
                : net < 0
                  ? "text-[color:var(--destructive)]"
                  : "text-foreground"
            }`}
          >
            {net > 0 ? "+" : ""}
            {formatWon(net)}
          </p>
        </div>
      </div>
    </StatCard>
  );
};

const BalanceCard = ({ daily }: { daily: LedgerStats["daily"] }) => {
  if (!daily.length) return null;

  return (
    <StatCard className="md:col-span-2">
      <TrendChart
        title="잔액 추이"
        ariaLabel="기간 잔액 추이"
        points={daily.map((day) => ({ date: day.date, value: day.balance }))}
        dots={daily.flatMap((day, index) =>
          day.income > 0
            ? [
                {
                  index,
                  title: `${day.date} · 입금 ${formatWon(day.income)} · 잔액 ${formatWon(day.balance)}`,
                },
              ]
            : []
        )}
        idleText="시작 잔액부터 누적"
        formatPoint={(point) => `${shortDate(point.date)} · ${formatWon(point.value)}`}
      />

      <p className="mt-1 text-[10px] text-muted-foreground">
        기록된 내역 기준 · 설정의 통장 탭에서 실제 잔액과 맞출 수 있어요
      </p>
    </StatCard>
  );
};

const SPEND_VIEWS = [
  { id: "daily", label: "일별" },
  { id: "total", label: "누적" },
] as const;

type SpendView = (typeof SPEND_VIEWS)[number]["id"];

const toRunningTotals = (daily: LedgerStats["daily"]) => {
  let running = 0;
  return daily.map((day) => {
    running += day.spent;
    return { date: day.date, value: running };
  });
};

const SpendCard = ({ daily }: { daily: LedgerStats["daily"] }) => {
  const [view, setView] = useState<SpendView>("daily");

  const total = daily.reduce((sum, day) => sum + day.spent, 0);
  const peakIndex = daily.reduce(
    (best, day, index) => (day.spent > (daily[best]?.spent ?? 0) ? index : best),
    0
  );
  const peak = daily[peakIndex];
  const isDaily = view === "daily";

  const points = isDaily
    ? daily.map((day) => ({ date: day.date, value: day.spent }))
    : toRunningTotals(daily);

  const toggle = (
    <div
      role="group"
      aria-label="사용 금액 보기"
      className="flex rounded-md bg-muted p-0.5"
    >
      {SPEND_VIEWS.map((option) => {
        const active = option.id === view;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            onClick={() => setView(option.id)}
            className={cn(
              "rounded-sm px-2.5 py-0.5 text-[11px] font-medium transition-colors",
              active && "bg-card text-foreground shadow-sm",
              !active && "text-muted-foreground hover:text-foreground"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );

  if (total === 0) {
    return (
      <StatCard className="md:col-span-2">
        <p className="text-[12px] font-medium text-muted-foreground">사용 금액 추이</p>
        <p className="py-8 text-center text-[12px] text-muted-foreground">
          이 기간에는 사용 금액이 없어요
        </p>
      </StatCard>
    );
  }

  const peakLabel = peak ? `최고 ${shortDate(peak.date)} · ${formatWon(peak.spent)}` : "";

  return (
    <StatCard className="md:col-span-2">
      <TrendChart
        title="사용 금액 추이"
        ariaLabel={`사용 금액 추이, ${isDaily ? "일별" : "누적"}, 합계 ${formatWon(total)}`}
        points={points}
        dots={isDaily && peak ? [{ index: peakIndex, title: peakLabel }] : []}
        controls={toggle}
        idleText={isDaily ? peakLabel : `합계 ${formatWon(total)}`}
        formatPoint={(point) =>
          `${shortDate(point.date)}${isDaily ? "" : "까지"} · ${formatWon(point.value)}`
        }
      />
    </StatCard>
  );
};

type BreakdownRow = { name: string; amount: number; count: number };

const sumBy = (entries: LedgerEntryView[], keyOf: (entry: LedgerEntryView) => string) => {
  const totals = new Map<string, BreakdownRow>();
  for (const entry of entries) {
    const name = keyOf(entry);
    const row = totals.get(name) ?? { name, amount: 0, count: 0 };
    row.amount += entry.amount;
    row.count += 1;
    totals.set(name, row);
  }
  return [...totals.values()].sort((a, b) => b.amount - a.amount || b.count - a.count);
};

const BreakdownList = ({
  title,
  rows,
  total,
}: {
  title: string;
  rows: BreakdownRow[];
  total: number;
}) => (
  <div>
    <p className="text-[11px] font-medium text-muted-foreground">{title}</p>
    <ul className="mt-1 space-y-1">
      {rows.map((row, index) => (
        <li
          key={`${row.name}-${index}`}
          className="flex items-baseline justify-between gap-2 text-[12px] tabular-nums"
        >
          <span className="min-w-0 truncate text-foreground">{row.name}</span>
          <span className="shrink-0 text-foreground">
            {formatWon(row.amount)}{" "}
            <span className="text-[11px] text-muted-foreground">
              {row.count}건 · {total === 0 ? 0 : Math.round((row.amount / total) * 100)}%
            </span>
          </span>
        </li>
      ))}
    </ul>
  </div>
);

/** 분류를 눌렀을 때 그 돈이 어느 소분류·어디에서 나갔는지 보여 준다. */
type CategoryGroupBy = "category" | "subcategory" | "place";

const CategoryBreakdown = ({
  entries,
  total,
  groupBy,
}: {
  entries: LedgerEntryView[];
  total: number;
  groupBy: CategoryGroupBy;
}) => {
  if (groupBy === "place") {
    const recent = [...entries]
      .sort((a, b) => b.entryDate.localeCompare(a.entryDate) || b.id - a.id)
      .slice(0, 5)
      .map((entry) => ({
        name: shortDate(entry.entryDate),
        amount: entry.amount,
        count: 1,
      }));
    return (
      <div className="mt-2 rounded-lg bg-muted/60 p-2.5">
        <BreakdownList title="최근 내역" rows={recent} total={total} />
      </div>
    );
  }

  const hasSubcategory =
    groupBy === "category" && entries.some((entry) => entry.subcategoryName);
  const subcategories = sumBy(entries, (entry) => entry.subcategoryName ?? "소분류 없음");
  const places = sumBy(
    entries,
    (entry) => entry.memo.trim() || entry.subcategoryName || entry.categoryName || "지출"
  ).slice(0, 5);

  return (
    <div className="mt-2 space-y-2.5 rounded-lg bg-muted/60 p-2.5">
      {hasSubcategory && (
        <BreakdownList title="소분류별" rows={subcategories} total={total} />
      )}
      <BreakdownList title="많이 쓴 곳 TOP 5" rows={places} total={total} />
    </div>
  );
};

/** 통계 탭과 내역 탭이 함께 쓰는 분류별 지출 도넛. 분류를 누르면 소분류·사용처를 펼친다. */
const SLICE_COLORS = CATEGORY_COLOR_OPTIONS.map((option) => option.key).filter(
  (key) => key !== "neutral"
);

type CategoryGroup = {
  key: string;
  name: string;
  icon: LedgerCategoryIconKey;
  color: LedgerCategoryColorKey;
  amount: number;
  match: (entry: LedgerEntryView) => boolean;
};

/** 소분류나 사용처로 묶는다. 색은 큰 순서대로 돌려 쓴다. */
const groupEntries = (
  expenses: LedgerEntryView[],
  groupBy: Exclude<CategoryGroupBy, "category">
): CategoryGroup[] => {
  const keyOf = (entry: LedgerEntryView) =>
    groupBy === "subcategory"
      ? String(entry.subcategoryId ?? "none")
      : entry.memo.trim() || entry.subcategoryName || entry.categoryName || "지출";
  const groups = new Map<string, Omit<CategoryGroup, "color">>();
  for (const entry of expenses) {
    const key = keyOf(entry);
    const group = groups.get(key) ?? {
      key,
      name: groupBy === "subcategory" ? (entry.subcategoryName ?? "소분류 없음") : key,
      icon: entry.categoryIcon ?? "tag",
      amount: 0,
      match: (other: LedgerEntryView) => keyOf(other) === key,
    };
    group.amount += entry.amount;
    groups.set(key, group);
  }
  return [...groups.values()]
    .sort((a, b) => b.amount - a.amount)
    .map((group, index) => ({
      ...group,
      color: SLICE_COLORS[index % SLICE_COLORS.length],
    }));
};

/**
 * 분류별 지출 도넛. groupBy를 바꾸면 소분류별·사용처별로도 보여 준다.
 * 항목을 누르면 그 안에서 어디에 썼는지 펼친다.
 */
export const CategoryCard = ({
  total: totalProp,
  byCategory = [],
  entries,
  groupBy = "category",
  title = "분류별 지출",
  className,
}: {
  total?: number;
  byCategory?: LedgerStats["byCategory"];
  entries: LedgerEntryView[];
  groupBy?: CategoryGroupBy;
  title?: string;
  className?: string;
}) => {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const expenses = entries.filter((entry) => entry.kind === "expense");
  const groups: CategoryGroup[] =
    groupBy === "category"
      ? byCategory.map((category) => ({
          key: category.categoryId == null ? "none" : String(category.categoryId),
          name: category.name,
          icon: category.icon,
          color: category.color,
          amount: category.amount,
          match: (entry: LedgerEntryView) => entry.categoryId === category.categoryId,
        }))
      : groupEntries(expenses, groupBy);
  const total = totalProp ?? groups.reduce((sum, group) => sum + group.amount, 0);
  const pctOf = (amount: number) =>
    total === 0 ? 0 : Math.round((amount / total) * 100);

  const top = groups.slice(0, 7);
  const rest = groups.slice(7);
  const slices = top.map((group) => ({
    key: group.key,
    name: group.name,
    icon: group.icon,
    colorKey: group.color,
    amount: group.amount,
    pct: pctOf(group.amount),
    color: CATEGORY_COLOR_HEX(group.color),
    match: group.match,
  }));

  if (rest.length) {
    const amount = rest.reduce((sum, group) => sum + group.amount, 0);
    slices.push({
      key: "etc",
      name: "기타",
      icon: "tag",
      colorKey: "neutral",
      amount,
      pct: pctOf(amount),
      color: CATEGORY_COLOR_HEX("neutral"),
      match: (entry) => rest.some((group) => group.match(entry)),
    });
  }

  const entriesOf = (match: (entry: LedgerEntryView) => boolean) =>
    expenses.filter(match);

  const toggle = (key: string) => setOpenKey((current) => (current === key ? null : key));

  // 합계(total)가 조각 합보다 크면 남는 몫을 회색 조각으로 채워 비율을 그대로 둔다.
  const sliceSum = slices.reduce((sum, slice) => sum + slice.amount, 0);
  const pieData = [
    ...slices.map((slice) => ({
      key: slice.key,
      name: slice.name,
      amount: slice.amount,
      pct: slice.pct,
      color: slice.color,
    })),
    ...(total > sliceSum
      ? [{ key: "", name: "", amount: total - sliceSum, pct: 0, color: "var(--muted)" }]
      : []),
  ];

  return (
    <StatCard className={className}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[12px] font-medium text-muted-foreground">{title}</p>
        {slices.length > 0 && (
          <span className="text-[11px] text-muted-foreground">눌러서 자세히</span>
        )}
      </div>
      {slices.length ? (
        <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row">
          <div className="w-36 shrink-0">
            <ChartContainer
              config={{}}
              role="img"
              aria-label="분류별 지출 비중"
              className="aspect-square w-full"
            >
              <PieChart>
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      hideLabel
                      formatter={(_, __, item) => {
                        const slice = item.payload as (typeof pieData)[number];
                        if (!slice.key) return null;
                        return (
                          <div className="flex w-full items-center gap-2 whitespace-nowrap">
                            <span
                              className="size-2.5 shrink-0 rounded-[2px]"
                              style={{ background: slice.color }}
                            />
                            <span className="text-muted-foreground">{slice.name}</span>
                            <span className="ml-auto font-medium text-foreground tabular-nums">
                              {formatWon(slice.amount)} · {slice.pct}%
                            </span>
                          </div>
                        );
                      }}
                    />
                  }
                />
                <Pie
                  data={pieData}
                  dataKey="amount"
                  nameKey="name"
                  innerRadius="59%"
                  outerRadius="81%"
                  startAngle={90}
                  endAngle={-270}
                  stroke="none"
                  isAnimationActive={false}
                  onClick={(sector) => {
                    const key = (sector.payload as (typeof pieData)[number]).key;
                    if (key) toggle(key);
                  }}
                  shape={(props: PieSectorShapeProps) => {
                    const slice = props.payload as (typeof pieData)[number];
                    return (
                      <Sector
                        {...props}
                        fill={slice.color}
                        fillOpacity={openKey && openKey !== slice.key ? 0.25 : 1}
                        className={cn(slice.key && "cursor-pointer")}
                      />
                    );
                  }}
                >
                  <Label
                    content={({ viewBox }) => {
                      if (!viewBox || !("cx" in viewBox)) return null;
                      const { cx, cy } = viewBox;
                      return (
                        <text x={cx} y={cy} textAnchor="middle">
                          <tspan
                            x={cx}
                            dy={-6}
                            fontSize={10}
                            fill="var(--muted-foreground)"
                          >
                            총 지출
                          </tspan>
                          <tspan
                            x={cx}
                            dy={19}
                            fontSize={15}
                            fontWeight={600}
                            fill="var(--foreground)"
                          >
                            {formatWon(total)}
                          </tspan>
                        </text>
                      );
                    }}
                  />
                </Pie>
              </PieChart>
            </ChartContainer>
          </div>

          <ul className="w-full min-w-0 flex-1 space-y-2">
            {slices.map((slice) => (
              <li key={slice.key}>
                <button
                  type="button"
                  aria-expanded={openKey === slice.key}
                  onClick={() => toggle(slice.key)}
                  className="block w-full rounded-md text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <div className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="flex min-w-0 items-center gap-1.5 text-foreground">
                      <CategoryIcon icon={slice.icon} color={slice.colorKey} size={18} />
                      <span className="truncate">{slice.name}</span>
                      <ChevronDown
                        className={cn(
                          "size-3 shrink-0 text-muted-foreground transition-transform",
                          openKey === slice.key && "rotate-180"
                        )}
                      />
                    </span>
                    <span className="shrink-0 text-[11px] text-foreground tabular-nums">
                      {formatWon(slice.amount)}{" "}
                      <span className="text-muted-foreground">{slice.pct}%</span>
                    </span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(0, Math.min(slice.pct, 100))}%`,
                        backgroundColor: slice.color,
                      }}
                    />
                  </div>
                </button>
                {openKey === slice.key && (
                  <CategoryBreakdown
                    entries={entriesOf(slice.match)}
                    groupBy={slice.key === "etc" ? "category" : groupBy}
                    total={slice.amount}
                  />
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-2 text-[12px] text-muted-foreground">기간 내 지출이 없어요</p>
      )}
    </StatCard>
  );
};

const KIND_FILTERS = [
  { id: "all", label: "전체" },
  { id: "expense", label: "지출" },
  { id: "income", label: "입금" },
] as const;

type EntryKindFilter = (typeof KIND_FILTERS)[number]["id"];

const SORT_KEYS = [
  { id: "date", label: "날짜" },
  { id: "amount", label: "금액" },
] as const;

type EntrySortKey = (typeof SORT_KEYS)[number]["id"];
type EntrySortDir = "desc" | "asc";

const SORT_DIR_LABEL: Record<EntrySortKey, Record<EntrySortDir, string>> = {
  date: { desc: "최신순", asc: "오래된순" },
  amount: { desc: "큰 금액순", asc: "작은 금액순" },
};

/** rows는 최신순으로 들어온다. 금액이 같으면 최신 내역이 먼저 오도록 안정 정렬한다. */
const sortEntries = (rows: LedgerEntryView[], key: EntrySortKey, dir: EntrySortDir) => {
  if (key === "date") return dir === "desc" ? rows : [...rows].reverse();
  const sign = dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => sign * (a.amount - b.amount));
};

const ENTRY_PAGE_SIZE = 10;
const ENTRY_MORE_SIZE = 20;

const PeriodEntriesCard = ({
  entries,
  categories,
  subcategories,
  onEdit,
}: {
  entries: LedgerEntryView[];
  categories: LedgerMonthPayload["categories"];
  subcategories: LedgerMonthPayload["subcategories"];
  onEdit: (entry: LedgerEntryView) => void;
}) => {
  const [kind, setKind] = useState<EntryKindFilter>("all");
  const [selected, setSelected] = useState<CategoryFilter>("all");
  const [selectedSub, setSelectedSub] = useState<SubcategoryFilter>("all");
  const [sortKey, setSortKey] = useState<EntrySortKey>("date");
  const [sortDir, setSortDir] = useState<EntrySortDir>("desc");
  const [visibleCount, setVisibleCount] = useState(ENTRY_PAGE_SIZE);

  const selectCategory = (value: CategoryFilter) => {
    setSelected(value);
    setSelectedSub("all");
    setVisibleCount(ENTRY_PAGE_SIZE);
  };

  const selectSubcategory = (value: SubcategoryFilter) => {
    setSelectedSub(value);
    setVisibleCount(ENTRY_PAGE_SIZE);
  };

  const rows = entries
    .filter(
      (entry) =>
        (kind === "all" || entry.kind === kind) &&
        (selected === "all" ||
          (entry.categoryId === selected && matchesSubcategory(entry, selectedSub)))
    )
    .reverse();
  const sortedRows = sortEntries(rows, sortKey, sortDir);

  const expenseTotal = rows
    .filter((entry) => entry.kind === "expense")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const incomeTotal = rows
    .filter((entry) => entry.kind === "income")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const singleTotal = kind === "income" ? incomeTotal : expenseTotal;
  const emptyLabel = kind === "income" ? "입금" : kind === "expense" ? "지출" : "기간";

  return (
    <StatCard>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[12px] font-medium text-muted-foreground">지출·입금 내역</p>
        <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
          {kind === "all"
            ? `${rows.length}건 · 지출 ${formatWon(expenseTotal)} · 입금 ${formatWon(incomeTotal)}`
            : `${rows.length}건 · ${formatWon(singleTotal)}`}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex flex-wrap gap-1.5">
          {KIND_FILTERS.map((option) => {
            const active = kind === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setKind(option.id);
                  if (option.id === "income") selectCategory("all");
                  else setVisibleCount(ENTRY_PAGE_SIZE);
                }}
                className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  active
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1">
          <div role="group" aria-label="정렬 기준" className="flex gap-0.5">
            {SORT_KEYS.map((option) => {
              const active = sortKey === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    if (active) return;
                    setSortKey(option.id);
                    setSortDir("desc");
                    setVisibleCount(ENTRY_PAGE_SIZE);
                  }}
                  className={`rounded-md px-1.5 py-1 text-[11px] transition-colors ${
                    active
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            aria-label={`정렬 방향: ${SORT_DIR_LABEL[sortKey][sortDir]}`}
            onClick={() => {
              setSortDir((dir) => (dir === "desc" ? "asc" : "desc"));
              setVisibleCount(ENTRY_PAGE_SIZE);
            }}
            className="flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            {sortDir === "desc" ? (
              <ArrowDown className="size-3" />
            ) : (
              <ArrowUp className="size-3" />
            )}
            {SORT_DIR_LABEL[sortKey][sortDir]}
          </button>
        </div>
      </div>

      {kind !== "income" && (
        <ExpenseCategoryChips
          label="지출·입금 내역 분류"
          className="mt-1.5"
          categories={categories}
          selected={selected}
          onSelect={selectCategory}
        />
      )}
      {kind !== "income" && selected !== "all" && (
        <SubcategoryChips
          label="지출·입금 내역 소분류"
          className="mt-1.5"
          categoryId={selected}
          subcategories={subcategories}
          entries={entries}
          selected={selectedSub}
          onSelect={selectSubcategory}
        />
      )}

      {rows.length ? (
        <ul className="mt-2 divide-y divide-border">
          {sortedRows.slice(0, visibleCount).map((entry) => {
            const isIncome = entry.kind === "income";
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => onEdit(entry)}
                  className="flex w-full items-center gap-2 py-2 text-left hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <EntryIcon entry={entry} size={20} />
                  <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                    {entry.entryDate.slice(5).replace("-", ".")}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">
                    {entry.memo.trim() || (isIncome ? "입금" : "지출")}
                  </span>
                  <span
                    className={`shrink-0 text-[12px] font-medium tabular-nums ${
                      isIncome ? "text-[color:var(--success)]" : "text-primary"
                    }`}
                  >
                    {isIncome ? "+" : "-"}
                    {formatWon(entry.amount)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-[12px] text-muted-foreground">
          이 {emptyLabel} 내역이 없어요
        </p>
      )}

      {rows.length > ENTRY_PAGE_SIZE && (
        <div className="mt-2 flex justify-center gap-1">
          {rows.length > visibleCount && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setVisibleCount((count) => count + ENTRY_MORE_SIZE)}
            >
              더 보기 · {rows.length - visibleCount}건 남음
            </Button>
          )}
          {visibleCount > ENTRY_PAGE_SIZE && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setVisibleCount(ENTRY_PAGE_SIZE)}
            >
              접기
            </Button>
          )}
        </div>
      )}
    </StatCard>
  );
};

/** 기록이 없는 달도 빈 막대로 채워 시간 간격이 일정하게 보이게 한다. */
const fillMonths = (monthly: LedgerStats["monthly"]) => {
  if (monthly.length < 2) return monthly;
  const byMonth = new Map(monthly.map((month) => [month.month, month]));
  const start = kst(`${monthly[0].month}-01`);
  const count = kst(`${monthly[monthly.length - 1].month}-01`).diff(start, "month") + 1;
  return Array.from({ length: count }, (_, index) => {
    const key = start.add(index, "month").format("YYYY-MM");
    return byMonth.get(key) ?? { month: key, income: 0, expense: 0 };
  });
};

const monthlyChartConfig = {
  income: { label: "입금", color: "var(--success)" },
  expense: { label: "지출", color: "var(--primary)" },
} satisfies ChartConfig;

const MonthlyCard = ({ monthly: rawMonthly }: { monthly: LedgerStats["monthly"] }) => {
  const monthly = fillMonths(rawMonthly);
  const multiYear =
    monthly.length > 0 &&
    monthly[0].month.slice(0, 4) !== monthly.at(-1)?.month.slice(0, 4);
  const monthTick = (month: string) =>
    multiYear ? kst(`${month}-01`).format("YY.M") : kst(`${month}-01`).format("M월");

  return (
    <StatCard>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-medium text-muted-foreground">월별 입출금</p>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-[color:var(--success)]" />
            입금
          </span>
          <span className="flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-primary" />
            지출
          </span>
        </div>
      </div>

      {monthly.length ? (
        <ChartContainer
          config={monthlyChartConfig}
          role="img"
          aria-label="월별 입출금"
          className="mt-3 aspect-auto h-[180px] w-full"
        >
          <BarChart data={monthly} margin={{ top: 8, right: 6, bottom: 0, left: 0 }}>
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
              tickFormatter={compactWon}
              tickLine={false}
              axisLine={false}
              tickCount={3}
              width={40}
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
                          monthlyChartConfig[name as keyof typeof monthlyChartConfig]
                            ?.label
                        }
                      </span>
                      <span className="ml-auto font-medium text-foreground tabular-nums">
                        {formatWon(Number(value))}
                      </span>
                    </div>
                  )}
                />
              }
            />
            <Bar
              dataKey="income"
              fill="var(--color-income)"
              radius={[2, 2, 0, 0]}
              maxBarSize={16}
              isAnimationActive={false}
            />
            <Bar
              dataKey="expense"
              fill="var(--color-expense)"
              radius={[2, 2, 0, 0]}
              maxBarSize={16}
              isAnimationActive={false}
            />
          </BarChart>
        </ChartContainer>
      ) : (
        <p className="mt-2 text-[12px] text-muted-foreground">기간 내 기록이 없어요</p>
      )}
    </StatCard>
  );
};

const TopExpensesCard = ({
  entries,
  categories,
  subcategories,
}: {
  entries: LedgerEntryView[];
  categories: LedgerMonthPayload["categories"];
  subcategories: LedgerMonthPayload["subcategories"];
}) => {
  const [selected, setSelected] = useState<CategoryFilter>("all");
  const [selectedSub, setSelectedSub] = useState<SubcategoryFilter>("all");
  const merchants = groupTopExpenses(
    entries.filter((entry) => matchesSubcategory(entry, selectedSub)),
    selected
  );

  return (
    <StatCard>
      <p className="text-[12px] font-medium text-muted-foreground">큰 지출 TOP 8</p>
      <ExpenseCategoryChips
        label="큰 지출 분류"
        className="mt-1.5"
        categories={categories}
        selected={selected}
        onSelect={(value) => {
          setSelected(value);
          setSelectedSub("all");
        }}
      />
      {selected !== "all" && (
        <SubcategoryChips
          label="큰 지출 소분류"
          className="mt-1.5"
          categoryId={selected}
          subcategories={subcategories}
          entries={entries}
          selected={selectedSub}
          onSelect={setSelectedSub}
        />
      )}
      {merchants.length ? (
        <TopExpensesList items={merchants} className="mt-2" />
      ) : (
        <p className="mt-2 text-[12px] text-muted-foreground">기간 내 지출이 없어요</p>
      )}
    </StatCard>
  );
};

const presetRange = (id: RangeId): { from?: string; to?: string } => {
  const today = todayKst();
  const base = kst(today);
  const day = (value: typeof base) => value.format("YYYY-MM-DD");

  if (id === "3m") {
    return { from: day(base.subtract(2, "month").startOf("month")), to: today };
  }
  if (id === "30") return { from: day(base.subtract(29, "day")), to: today };
  if (id === "7") return { from: day(base.subtract(6, "day")), to: today };
  return {};
};

/** 해당 달의 첫날부터 마지막 날까지. 이번 달은 오늘까지다. */
const monthRange = (month: string): { from: string; to: string } => {
  const first = kst(`${month}-01`);
  return {
    from: first.format("YYYY-MM-DD"),
    to:
      month === currentMonthKst()
        ? todayKst()
        : first.endOf("month").format("YYYY-MM-DD"),
  };
};

const signedWon = (value: number) => `${value > 0 ? "+" : ""}${formatWon(value)}`;

const MonthCompareCard = ({
  current,
  previous,
  range,
  isCurrentMonth,
  wide,
  unit = "month",
}: {
  current: LedgerStats;
  previous: LedgerStats;
  range: { from: string; to: string };
  isCurrentMonth: boolean;
  wide: boolean;
  /** 주별 리포트면 지난주와 비교한다. */
  unit?: "month" | "week";
}) => {
  const previousName = unit === "week" ? "지난주" : "지난달";
  const result = compareLedgerPeriods(current, previous);
  const { expense, income } = result;
  const span = `${range.from.slice(5).replace("-", ".")} ~ ${range.to.slice(5).replace("-", ".")}`;

  return (
    <StatCard className={cn(wide && "md:col-span-2")}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[12px] font-medium text-muted-foreground">
          {unit === "week" ? "전주 대비" : "전월 대비"}
        </p>
        <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
          {isCurrentMonth
            ? `${previousName} 같은 기간 ${span}`
            : `${previousName} ${span}`}
        </span>
      </div>

      {result.hasPrevious ? (
        <>
          <p className="mt-2 text-[11px] text-muted-foreground">지출</p>
          <p
            className={cn(
              "text-lg font-semibold tabular-nums",
              expense.diff > 0 && "text-[color:var(--destructive)]",
              expense.diff < 0 && "text-[color:var(--success)]",
              expense.diff === 0 && "text-foreground"
            )}
          >
            {signedWon(expense.diff)}
            {expense.pct != null && (
              <span className="ml-1 text-[12px] font-normal">
                ({expense.pct > 0 ? "+" : ""}
                {expense.pct}%)
              </span>
            )}
          </p>
          <p className="text-[11px] text-muted-foreground tabular-nums">
            {previousName} {formatWon(expense.previous)} → {formatWon(expense.current)}
          </p>
          <p className="mt-1.5 text-[11px] text-foreground tabular-nums">
            입금 {signedWon(income.diff)}
          </p>

          {result.categories.length > 0 && (
            <ul aria-label="분류별 증감" className="mt-3 space-y-2">
              {result.categories.map((category) => (
                <li
                  key={category.categoryId ?? "none"}
                  className="flex items-center justify-between gap-2 text-[12px]"
                >
                  <span className="flex min-w-0 items-center gap-1.5 text-foreground">
                    <CategoryIcon icon={category.icon} color={category.color} size={18} />
                    <span className="truncate">{category.name}</span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 font-medium tabular-nums",
                      category.diff > 0 && "text-[color:var(--destructive)]",
                      category.diff < 0 && "text-[color:var(--success)]"
                    )}
                  >
                    {signedWon(category.diff)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="mt-2 text-[12px] text-muted-foreground">
          비교할 {previousName} 기록이 없어요
        </p>
      )}
    </StatCard>
  );
};

const MonthForecastCard = ({
  month,
  spent,
  reference,
  totalBudget,
}: {
  month: string;
  spent: number;
  reference: LedgerMonthPayload["expenseReference"];
  totalBudget: number | null;
}) => {
  const forecast = projectMonthExpense({ month, today: todayKst(), spent });
  if (!forecast) return null;
  const budgetGap = totalBudget == null ? null : forecast.projected - totalBudget;

  return (
    <StatCard>
      <p className="text-[12px] font-medium text-muted-foreground">이번 달 예상 지출</p>
      <p className="mt-2 text-lg font-semibold text-foreground tabular-nums">
        {formatWon(forecast.projected)}
      </p>
      <p className="text-[11px] text-muted-foreground tabular-nums">
        지금 속도 기준 · {forecast.day}/{forecast.daysInMonth}일 지남
      </p>
      <dl className="mt-3 space-y-1.5 text-[12px] tabular-nums">
        {reference.average != null && (
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">최근 {reference.months}개월 평균</dt>
            <dd className="text-foreground">{formatWon(reference.average)}</dd>
          </div>
        )}
        {totalBudget != null && budgetGap != null && (
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">예산 {formatWon(totalBudget)}</dt>
            <dd
              className={cn(
                budgetGap > 0 && "text-[color:var(--destructive)]",
                budgetGap <= 0 && "text-foreground"
              )}
            >
              {budgetGap > 0
                ? `${formatWon(budgetGap)} 초과 예상`
                : `${formatWon(-budgetGap)} 남을 예상`}
            </dd>
          </div>
        )}
      </dl>
    </StatCard>
  );
};

const TripSummaryCard = ({ stats, name }: { stats: LedgerStats; name: string }) => (
  <StatCard className="md:col-span-2">
    <p className="text-[12px] font-medium text-muted-foreground">{name} 총 지출</p>
    <p className="mt-1 text-2xl font-semibold text-primary tabular-nums">
      {formatWon(stats.summary.expense)}
    </p>
    <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
      {stats.summary.expenseCount}건 · 여행 {stats.days}일 기준 하루{" "}
      {formatWon(stats.summary.avgDailyExpense)}
    </p>
  </StatCard>
);

const NO_REFERENCE: LedgerMonthPayload["expenseReference"] = {
  months: 0,
  average: null,
  byCategory: [],
};

export const StatsView = ({
  categories,
  subcategories,
  trips,
  month,
  onMonthChange,
  expenseReference,
  totalBudget,
  onEdit,
  initialPeriod,
  weekStart,
  onWeekChange,
  excludeTrips,
  onExcludeTripsChange,
}: Props) => {
  const token = useAuthStore((s) => s.token);
  const [range, setRange] = useState<RangeId>(initialPeriod);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const [appliedRange, setAppliedRange] = useState<{ from?: string; to?: string }>({});
  const applied =
    range === "month"
      ? monthRange(month)
      : range === "week"
        ? weekRange(weekStart, todayKst())
        : appliedRange;
  const [selectedTripId, setSelectedTripId] = useState<number | null>(null);
  const isTripReport = range === "trip";
  const activeTrip = trips.find((trip) => trip.id === selectedTripId) ?? trips[0] ?? null;
  const shouldExclude = !isTripReport && excludeTrips;
  const statsScope = shouldExclude ? "without-trips" : undefined;
  const thisMonth = currentMonthKst();
  const thisWeek = weekStartOf(todayKst());

  const selectRange = (id: RangeId) => {
    setRange(id);
    setCustomError(null);

    if (id === "month" || id === "week" || id === "trip") return;

    if (id === "custom") {
      const from = customFrom || kst(todayKst()).subtract(30, "day").format("YYYY-MM-DD");
      const to = customTo || todayKst();
      setCustomFrom(from);
      setCustomTo(to);
      setAppliedRange({ from, to });
      return;
    }

    setAppliedRange(presetRange(id));
  };

  const applyCustomRange = () => {
    if (!customFrom || !customTo) {
      setCustomError("시작일과 종료일을 모두 선택해 주세요.");
      return;
    }
    if (customFrom > customTo) {
      setCustomError("시작일은 종료일보다 늦을 수 없어요.");
      return;
    }
    setCustomError(null);
    setAppliedRange({ from: customFrom, to: customTo });
  };

  const statsQuery = useQuery({
    queryKey: isTripReport
      ? ledgerKeys.stats(undefined, undefined, `trip-${activeTrip?.id ?? "none"}`)
      : ledgerKeys.stats(applied.from, applied.to, statsScope),
    queryFn: () =>
      isTripReport
        ? fetchStats(token, undefined, undefined, { tripId: activeTrip?.id })
        : fetchStats(token, applied.from, applied.to, { excludeTrips: shouldExclude }),
    enabled: Boolean(token) && (!isTripReport || Boolean(activeTrip)),
    placeholderData: keepPreviousData,
    ...LEDGER_LIVE_QUERY,
  });
  const stats = statsQuery.data;

  const previousRange =
    range === "month"
      ? comparableMonthRange(month, todayKst())
      : range === "week"
        ? comparableWeekRange(weekStart, todayKst())
        : null;
  const previousQuery = useQuery({
    queryKey: ledgerKeys.stats(previousRange?.from, previousRange?.to, statsScope),
    queryFn: () =>
      fetchStats(token, previousRange?.from, previousRange?.to, {
        excludeTrips: shouldExclude,
      }),
    enabled: Boolean(token && previousRange),
    placeholderData: keepPreviousData,
    ...LEDGER_LIVE_QUERY,
  });

  // 평소와 비교하는 인사이트는 달 단위로만 본다.
  const insightsQuery = useQuery({
    queryKey: ledgerKeys.insights(month, statsScope),
    queryFn: () => fetchInsights(token, month, shouldExclude),
    enabled: Boolean(token) && range === "month",
    placeholderData: keepPreviousData,
    ...LEDGER_LIVE_QUERY,
  });
  const insights = range === "month" ? insightsQuery.data : undefined;

  const hasActivity = stats
    ? stats.summary.income !== 0 || stats.summary.expense !== 0
    : false;
  const rangeLabel = stats
    ? `${stats.from.replaceAll("-", ".")} ~ ${stats.to.replaceAll("-", ".")} · ${
        stats.days
      }일`
    : "기간 확인 중…";

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 [&>*]:min-w-0">
      <div className="flex flex-col gap-2 md:col-span-2">
        <p className="text-[12px] font-medium text-muted-foreground">기간별 리포트</p>
        <div className="flex w-full flex-col items-start gap-1.5">
          <div
            role="group"
            aria-label="리포트 기간"
            className="flex flex-wrap rounded-lg bg-muted p-[3px]"
          >
            {RANGES.map((option) => {
              const active = option.id === range;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => selectRange(option.id)}
                  className={`rounded-md px-3 py-1 text-[11px] font-medium transition-colors ${
                    active
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          {isTripReport && trips.length > 0 && (
            <div role="group" aria-label="여행 선택" className="flex flex-wrap gap-1.5">
              {trips.map((trip) => {
                const active = trip.id === activeTrip?.id;
                return (
                  <button
                    key={trip.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelectedTripId(trip.id)}
                    className={categoryChipClass(active)}
                  >
                    {trip.name}
                  </button>
                );
              })}
            </div>
          )}

          {!isTripReport && trips.length > 0 && (
            <ExcludeTripsChip value={excludeTrips} onChange={onExcludeTripsChange} />
          )}

          {range === "month" && (
            <div className="-ml-2 flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label="이전 달"
                onClick={() => onMonthChange(shiftMonth(month, -1))}
              >
                <ChevronLeft />
              </Button>
              <MonthPicker month={month} onChange={onMonthChange} max={thisMonth} />
              <Button
                variant="ghost"
                size="icon"
                aria-label="다음 달"
                disabled={month >= thisMonth}
                onClick={() => onMonthChange(shiftMonth(month, 1))}
              >
                <ChevronRight />
              </Button>
              {month !== thisMonth && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onMonthChange(thisMonth)}
                >
                  이번 달
                </Button>
              )}
            </div>
          )}

          {range === "week" && (
            <div className="-ml-2 flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label="이전 주"
                onClick={() => onWeekChange(shiftWeek(weekStart, -1))}
              >
                <ChevronLeft />
              </Button>
              <WeekPicker weekStart={weekStart} onChange={onWeekChange} max={thisWeek} />
              <Button
                variant="ghost"
                size="icon"
                aria-label="다음 주"
                disabled={weekStart >= thisWeek}
                onClick={() => onWeekChange(shiftWeek(weekStart, 1))}
              >
                <ChevronRight />
              </Button>
              {weekStart !== thisWeek && (
                <Button variant="ghost" size="sm" onClick={() => onWeekChange(thisWeek)}>
                  이번 주
                </Button>
              )}
            </div>
          )}

          {range === "custom" ? (
            <div className="w-full">
              <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:items-end">
                <label className="flex min-w-0 flex-col gap-0.5 sm:w-[8.5rem] sm:flex-none">
                  <span className="text-[10px] text-muted-foreground">시작</span>
                  <DatePicker
                    value={customFrom}
                    onChange={(next) => {
                      setCustomFrom(next);
                      setCustomError(null);
                    }}
                    invalid={Boolean(customError)}
                    placeholder="시작일"
                    className="h-8 px-2 text-[12px]"
                  />
                </label>
                <label className="flex min-w-0 flex-col gap-0.5 sm:w-[8.5rem] sm:flex-none">
                  <span className="text-[10px] text-muted-foreground">종료</span>
                  <DatePicker
                    value={customTo}
                    onChange={(next) => {
                      setCustomTo(next);
                      setCustomError(null);
                    }}
                    invalid={Boolean(customError)}
                    placeholder="종료일"
                    className="h-8 px-2 text-[12px]"
                  />
                </label>
                <Button
                  size="sm"
                  className="col-span-2 h-8 w-full sm:col-span-1 sm:w-auto"
                  onClick={applyCustomRange}
                >
                  조회
                </Button>
              </div>
              {customError ? (
                <p className="mt-1 text-[11px] text-[color:var(--destructive)]">
                  {customError}
                </p>
              ) : null}
            </div>
          ) : null}

          <p className="text-[11px] text-muted-foreground tabular-nums">{rangeLabel}</p>
        </div>
      </div>

      {isTripReport && !activeTrip ? (
        <StatCard className="md:col-span-2">
          <p className="py-8 text-center text-[12px] text-muted-foreground">
            등록된 여행이 없어요. 여행 탭에서 추가해 주세요.
          </p>
        </StatCard>
      ) : statsQuery.isPending ? (
        <StatCard className="md:col-span-2">
          <p className="py-8 text-center text-[12px] text-muted-foreground">
            불러오는 중…
          </p>
        </StatCard>
      ) : statsQuery.isError ? (
        <StatCard className="md:col-span-2">
          <div className="flex flex-col items-center gap-2 py-8">
            <p className="text-[12px] text-muted-foreground">
              {statsQuery.error instanceof Error
                ? statsQuery.error.message
                : "통계를 불러오지 못했어요."}
            </p>
            <Button variant="outline" size="sm" onClick={() => statsQuery.refetch()}>
              다시 불러오기
            </Button>
          </div>
        </StatCard>
      ) : stats ? (
        <>
          {isTripReport && activeTrip && (
            <TripSummaryCard stats={stats} name={activeTrip.name} />
          )}
          {hasActivity && !isTripReport && <KpiCards stats={stats} />}
          {hasActivity && previousRange && previousQuery.data && (
            <MonthCompareCard
              current={stats}
              previous={previousQuery.data}
              range={previousRange}
              unit={range === "week" ? "week" : "month"}
              isCurrentMonth={
                range === "week" ? weekStart === thisWeek : month === thisMonth
              }
              // 주별에는 이번 달 예상 카드가 없어 비교 카드가 한 줄을 다 쓴다.
              wide={range === "week" || month !== thisMonth}
            />
          )}
          {hasActivity && range === "month" && (
            <MonthForecastCard
              month={month}
              spent={stats.summary.expense}
              reference={shouldExclude ? NO_REFERENCE : expenseReference}
              totalBudget={shouldExclude ? null : totalBudget}
            />
          )}
          {hasActivity && insights && insights.unusual.month === month && (
            <UnusualSpendCard
              unusual={insights.unusual}
              categories={categories}
              entries={stats.entries}
              onEdit={onEdit}
            />
          )}
          {/* 큰 지출은 요약 바로 아래에서 먼저 보이게 하고, 분류 카드와 한 줄을 이룬다. */}
          {hasActivity && (
            <>
              <TopExpensesCard
                entries={stats.entries}
                categories={categories}
                subcategories={subcategories}
              />
              <CategoryCard
                total={stats.summary.expense}
                byCategory={stats.byCategory}
                entries={stats.entries}
              />
            </>
          )}
          {insights && insights.savings.month === month && (
            <SavingsCard savings={insights.savings} />
          )}
          {!isTripReport && <AllTimeCard allTime={stats.allTime} />}
          {hasActivity ? (
            <>
              {!isTripReport && stats.balanceReady && (
                <BalanceCard
                  daily={stats.daily.filter(
                    (day) => !stats.balanceFrom || day.date >= stats.balanceFrom
                  )}
                />
              )}
              {!isTripReport && <SpendCard daily={stats.daily} />}
              <PeriodEntriesCard
                entries={stats.entries}
                categories={categories}
                subcategories={subcategories}
                onEdit={onEdit}
              />
              {!isTripReport && stats.monthly.length > 1 && (
                <MonthlyCard monthly={stats.monthly} />
              )}
            </>
          ) : (
            <StatCard className="md:col-span-2">
              <div className="flex flex-col items-center py-10">
                <div className="grid size-12 place-items-center rounded-full bg-muted text-primary">
                  <Wallet className="size-5" />
                </div>
                <p className="mt-3 text-sm font-medium text-foreground">
                  이 기간에는 기록이 없어요
                </p>
              </div>
            </StatCard>
          )}
        </>
      ) : null}
    </div>
  );
};
