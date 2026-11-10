"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  LogOut,
  Plus,
  Search,
  Settings2,
  Wallet,
} from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { CalendarView } from "@/components/ledger/calendar-view";
import {
  AssetChips,
  assetFilterName,
  ExpenseCategoryChips,
  matchesAsset,
  matchesSubcategory,
  SubcategoryChips,
  subcategoryFilterName,
  type AssetFilter,
  type CategoryFilter,
  type SubcategoryFilter,
} from "@/components/ledger/category-chips";
import { CategoryIcon } from "@/components/ledger/category-icon";
import { EntryDialog } from "@/components/ledger/entry-dialog";
import type { LedgerEntryView } from "@/components/ledger/entry-list";
import { LedgerEntryList } from "@/components/ledger/entry-list";
import { PasteDialog } from "@/components/ledger/paste-dialog";
import { RecapCard } from "@/components/ledger/recap-card";
import { SavingsView } from "@/components/ledger/savings-view";
import {
  SettingsDialog,
  TripsTab,
  type LedgerSettingsTab,
} from "@/components/ledger/settings-dialog";
import { RecurringTab } from "@/components/ledger/settings-extra";
import { CategoryCard, StatsView } from "@/components/ledger/stats-view";
import { groupTopExpenses, TopExpensesList } from "@/components/ledger/top-expenses";
import { ViewToggle } from "@/components/ledger/view-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthStore } from "@/lib/auth-store";
import type { LedgerMonthPayload } from "@/lib/db/ledger";
import { kst } from "@/lib/kst";
import { LEDGER_LIVE_QUERY, ledgerKeys, ledgerRequest } from "@/lib/ledger/client";
import {
  currentMonthKst,
  formatCompactWon,
  formatDayKo,
  formatMonthKo,
  formatWon,
  shiftMonth,
  todayKst,
} from "@/lib/ledger/format";
import { getBudgetPace, type LedgerBudgetPace } from "@/lib/ledger/pace";
import {
  formatWeekKo,
  isInWeek,
  shiftWeek,
  weekMonth,
  weekMonths,
  weekStartOf,
} from "@/lib/ledger/week";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "list", label: "내역" },
  { id: "calendar", label: "달력" },
  { id: "stats", label: "통계" },
  { id: "savings", label: "저축" },
  { id: "recurring", label: "반복" },
  { id: "trips", label: "여행" },
] as const;

type LedgerTab = (typeof TABS)[number]["id"];

const PERIODS = [
  { id: "month", label: "월" },
  { id: "week", label: "주" },
] as const;

export type LedgerPeriod = (typeof PERIODS)[number]["id"];

interface DayGroup {
  date: string;
  entries: LedgerEntryView[];
  expense: number;
  income: number;
  transfer: number;
}

interface SearchResult {
  entries: LedgerEntryView[];
  income: number;
  expense: number;
  count: number;
}

const SummaryCard = ({
  label,
  value,
  hint,
  note,
  tone,
  bar,
  onClick,
}: {
  label: string;
  value: string;
  hint: string;
  note?: string;
  tone?: "success" | "primary" | "error";
  bar?: { pct: number; marker?: number };
  onClick?: () => void;
}) => {
  const body = (
    <Card className="h-full">
      <CardContent className="px-4">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground">
          {label}
        </p>
        <p
          className={cn(
            "mt-1 text-lg font-semibold tabular-nums md:text-xl",
            !tone && "text-foreground",
            tone === "success" && "text-[color:var(--success)]",
            tone === "primary" && "text-[color:var(--primary)]",
            tone === "error" && "text-[color:var(--destructive)]"
          )}
        >
          {value}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
        {bar && (
          <div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.max(0, Math.min(bar.pct, 100))}%` }}
            />
            {bar.marker != null && (
              <div
                aria-hidden="true"
                className="absolute inset-y-0 w-0.5 bg-foreground/50"
                style={{ left: `${bar.marker}%` }}
              />
            )}
          </div>
        )}
        {note && <p className="mt-1.5 text-[11px] text-foreground">{note}</p>}
      </CardContent>
    </Card>
  );

  if (!onClick) return body;
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {body}
    </button>
  );
};

const LedgerTabs = ({
  tab,
  onChange,
}: {
  tab: LedgerTab;
  onChange: (tab: LedgerTab) => void;
}) => (
  <Tabs value={tab} onValueChange={(next) => onChange(next as LedgerTab)}>
    <TabsList aria-label="가계부 보기">
      {TABS.map((option) => (
        <TabsTrigger key={option.id} value={option.id} className="px-3">
          {option.label}
        </TabsTrigger>
      ))}
    </TabsList>
  </Tabs>
);

const paceNote = (pace: LedgerBudgetPace | null): string | undefined => {
  if (pace?.state !== "current") return undefined;
  if (pace.status === "over") return "이번 달 예산을 넘었어요";
  const daily = `하루 약 ${formatCompactWon(pace.dailyAllowance)}원까지`;
  return pace.status === "risk"
    ? `${daily} · 이 속도면 ${formatCompactWon(pace.projectedOver)}원 초과`
    : `${daily} · 지금 속도면 예산 안이에요`;
};

const CategoryBudgetCard = ({ ledger }: { ledger: LedgerMonthPayload }) => {
  const spentById = new Map(ledger.byCategory.map((row) => [row.categoryId, row.amount]));
  const rows = ledger.budget.byCategory
    .map((row) => {
      const category = ledger.categories.find((c) => c.id === row.categoryId);
      return category ? { ...row, category } : null;
    })
    .filter((row) => row !== null);

  if (!rows.length) return null;

  return (
    <section
      aria-label="분류별 예산"
      className="mt-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10"
    >
      <p className="text-[12px] font-medium text-muted-foreground">분류별 예산</p>
      <ul className="mt-2 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map(({ category, amount }) => {
          const spent = spentById.get(category.id) ?? 0;
          const remaining = amount - spent;
          return (
            <li key={category.id}>
              <div className="flex items-center justify-between gap-2 text-[12px]">
                <span className="flex min-w-0 items-center gap-1.5 text-foreground">
                  <CategoryIcon icon={category.icon} color={category.color} size={18} />
                  <span className="truncate">{category.name}</span>
                </span>
                <span
                  className={cn(
                    "shrink-0 text-[11px] tabular-nums",
                    remaining >= 0 && "text-muted-foreground",
                    remaining < 0 && "text-[color:var(--destructive)]"
                  )}
                >
                  {remaining >= 0
                    ? `${formatWon(remaining)} 남음`
                    : `${formatWon(-remaining)} 초과`}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full",
                    remaining >= 0 && "bg-primary",
                    remaining < 0 && "bg-[var(--destructive)]"
                  )}
                  style={{ width: `${Math.min((spent / amount) * 100, 100)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

const SearchResults = ({
  query,
  onEdit,
}: {
  query: string;
  onEdit: (entry: LedgerEntryView) => void;
}) => {
  const token = useAuthStore((s) => s.token);
  const { data, isPending, isError } = useQuery({
    queryKey: ledgerKeys.search(query),
    queryFn: async () => {
      const { result } = await ledgerRequest<{ result: SearchResult }>(
        token,
        `/api/ledger/search?q=${encodeURIComponent(query)}`
      );
      return result;
    },
    enabled: Boolean(token),
  });

  return (
    <section className="rounded-xl bg-card p-2 ring-1 ring-foreground/10 md:p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-2 pt-1 pb-1.5">
        <h3 className="text-[13px] font-medium text-foreground">전체 기간 검색 결과</h3>
        {data && (
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {data.count}건 · 지출 {formatWon(data.expense)} · 입금{" "}
            {formatWon(data.income)}
          </span>
        )}
      </div>
      {isPending ? (
        <p className="px-2 py-6 text-center text-[12px] text-muted-foreground">
          찾는 중…
        </p>
      ) : isError ? (
        <p className="px-2 py-6 text-center text-[12px] text-muted-foreground">
          검색하지 못했어요
        </p>
      ) : (
        <div className="divide-y divide-border">
          {data.entries.length ? (
            data.entries.map((entry) => (
              <div key={entry.id}>
                <p className="px-2 pt-1.5 text-[10px] text-muted-foreground tabular-nums">
                  {entry.entryDate.replaceAll("-", ".")}
                </p>
                <LedgerEntryList entries={[entry]} onEdit={onEdit} />
              </div>
            ))
          ) : (
            <p className="px-2 py-6 text-center text-[12px] text-muted-foreground">
              일치하는 내역이 없어요
            </p>
          )}
        </div>
      )}
    </section>
  );
};

export const LedgerPage = () => {
  const token = useAuthStore((s) => s.token);
  const logout = useAuthStore((s) => s.logout);
  const [month, setMonth] = useState<string>(() => currentMonthKst());
  // 주 단위로 볼 때 그 주의 월요일. 이때 month는 그 주가 속한 달을 따라간다.
  const [period, setPeriod] = useState<LedgerPeriod>("month");
  const [weekStart, setWeekStart] = useState<string>(() => weekStartOf(todayKst()));
  const isWeek = period === "week";
  const [tab, setTab] = useState<LedgerTab>("list");
  const [entryOpen, setEntryOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<LedgerEntryView | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<LedgerSettingsTab>("budget");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [subcategoryFilter, setSubcategoryFilter] = useState<SubcategoryFilter>("all");
  const [assetFilter, setAssetFilter] = useState<AssetFilter>("all");
  const selectCategoryFilter = (value: CategoryFilter) => {
    setCategoryFilter(value);
    setSubcategoryFilter("all");
  };

  const {
    data: ledger,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ledgerKeys.month(month),
    queryFn: async () => {
      const data = await ledgerRequest<{ ledger: LedgerMonthPayload }>(
        token,
        `/api/ledger?month=${month}`
      );
      return data.ledger;
    },
    enabled: Boolean(token),
    ...LEDGER_LIVE_QUERY,
  });

  // 두 달에 걸친 주는 다른 달 내역도 읽어 합친다.
  const otherMonth = isWeek ? weekMonths(weekStart).find((m) => m !== month) : undefined;
  const otherQuery = useQuery({
    queryKey: ledgerKeys.month(otherMonth ?? ""),
    queryFn: async () => {
      const data = await ledgerRequest<{ ledger: LedgerMonthPayload }>(
        token,
        `/api/ledger?month=${otherMonth}`
      );
      return data.ledger;
    },
    enabled: Boolean(token && otherMonth),
    ...LEDGER_LIVE_QUERY,
  });
  const otherLedger = otherMonth ? otherQuery.data : undefined;
  const periodPending = Boolean(otherMonth) && !otherLedger;
  const loadError = isError ? error : otherQuery.error;

  // 지금 보는 기간(달 또는 주)의 내역과 날짜별 합계.
  const periodEntries = useMemo(() => {
    if (!ledger) return [];
    if (!isWeek) return ledger.entries;
    return [...ledger.entries, ...(otherLedger?.entries ?? [])].filter((entry) =>
      isInWeek(entry.entryDate, weekStart)
    );
  }, [ledger, otherLedger, isWeek, weekStart]);
  const periodCalendar = useMemo(() => {
    if (!ledger) return [];
    if (!isWeek) return ledger.calendar;
    return [...ledger.calendar, ...(otherLedger?.calendar ?? [])].filter((day) =>
      isInWeek(day.date, weekStart)
    );
  }, [ledger, otherLedger, isWeek, weekStart]);
  const periodTotals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const entry of periodEntries) {
      if (entry.kind === "income") income += entry.amount;
      else if (entry.kind === "expense") expense += entry.amount;
    }
    return { income, expense };
  }, [periodEntries]);

  // 고른 분류가 삭제됐으면 빈 목록 대신 전체를 보여 준다.
  const filterCategory =
    ledger?.categories.find(
      (category) => category.kind === "expense" && category.id === categoryFilter
    ) ?? null;
  const filterCategoryId = filterCategory?.id ?? null;
  // 분류를 안 골랐거나 고른 소분류가 지워졌으면 소분류 필터는 쓰지 않는다.
  const filterSubName = filterCategory
    ? subcategoryFilterName(ledger?.subcategories ?? [], subcategoryFilter)
    : null;
  const filterSub: SubcategoryFilter = filterSubName ? subcategoryFilter : "all";
  // 고른 결제수단이 지워졌으면 결제수단 필터는 쓰지 않는다.
  const filterAssetName = assetFilterName(ledger?.assets ?? [], assetFilter);
  const filterAsset: AssetFilter = filterAssetName ? assetFilter : "all";
  const filterLabel =
    [filterCategory?.name, filterSubName, filterAssetName].filter(Boolean).join(" · ") ||
    null;

  // 결제수단만 먼저 거른 내역. 분류·소분류 칩은 이 안에서 쓰인 것만 띄운다.
  const assetEntries = useMemo(
    () => periodEntries.filter((entry) => matchesAsset(entry, filterAsset)),
    [periodEntries, filterAsset]
  );

  const listEntries = useMemo(
    () =>
      filterCategoryId == null
        ? assetEntries
        : assetEntries.filter(
            (entry) =>
              entry.categoryId === filterCategoryId &&
              matchesSubcategory(entry, filterSub)
          ),
    [assetEntries, filterCategoryId, filterSub]
  );

  // 결제수단만 고른 경우 분류별 지출을 그 결제수단 내역으로 다시 계산한다.
  const assetByCategory = useMemo(() => {
    const totals = new Map<number | null, LedgerMonthPayload["byCategory"][number]>();
    let expense = 0;
    for (const entry of assetEntries) {
      if (entry.kind !== "expense") continue;
      expense += entry.amount;
      const row = totals.get(entry.categoryId) ?? {
        categoryId: entry.categoryId,
        name: entry.categoryName ?? "분류 없음",
        emoji: entry.categoryEmoji ?? "🧾",
        icon: entry.categoryIcon ?? "tag",
        color: entry.categoryColor ?? "neutral",
        amount: 0,
        pct: 0,
      };
      row.amount += entry.amount;
      totals.set(entry.categoryId, row);
    }
    const rows = [...totals.values()]
      .map((row) => ({
        ...row,
        pct: expense === 0 ? 0 : Math.round((row.amount / expense) * 100),
      }))
      .sort((a, b) => b.amount - a.amount);
    return { rows, expense };
  }, [assetEntries]);

  const topExpenses = useMemo(() => groupTopExpenses(listEntries, "all"), [listEntries]);

  const dayGroups = useMemo(() => {
    const groups = new Map<string, DayGroup>();

    for (const entry of listEntries) {
      const group = groups.get(entry.entryDate) ?? {
        date: entry.entryDate,
        entries: [],
        expense: 0,
        income: 0,
        transfer: 0,
      };
      group.entries.push(entry);
      if (entry.kind === "income") group.income += entry.amount;
      else if (entry.kind === "transfer") group.transfer += entry.amount;
      else group.expense += entry.amount;
      groups.set(entry.entryDate, group);
    }

    return [...groups.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [listEntries]);

  const openAdd = () => {
    setEditingEntry(null);
    setEntryOpen(true);
  };

  const openEdit = (entry: LedgerEntryView) => {
    setEditingEntry(entry);
    setEntryOpen(true);
  };

  const openSettings = (next: LedgerSettingsTab = "budget") => {
    setSettingsTab(next);
    setSettingsOpen(true);
  };

  const thisMonth = currentMonthKst();
  const today = todayKst();
  const thisWeek = weekStartOf(today);
  const inPeriod = (date: string) =>
    isWeek ? isInWeek(date, weekStart) : date.startsWith(`${month}-`);
  const fallbackDay = inPeriod(today) ? today : isWeek ? weekStart : `${month}-01`;
  const activeDay = selectedDay && inPeriod(selectedDay) ? selectedDay : fallbackDay;
  const defaultEntryDate = tab === "calendar" ? activeDay : fallbackDay;
  const monthLabel = formatMonthKo(month);
  const periodLabel = isWeek ? formatWeekKo(weekStart, today) : monthLabel;

  const goWeek = (start: string) => {
    setWeekStart(start);
    setMonth(weekMonth(start));
  };
  // 주 단위일 때 month는 늘 그 주가 속한 달이어야 한다. 통계 탭에서 달을 옮기면
  // 그 달에 속한 주(이번 달이면 이번 주, 아니면 첫 주)로 함께 옮긴다.
  const changeMonth = (next: string) => {
    setMonth(next);
    if (!isWeek) return;
    if (next === thisMonth) {
      setWeekStart(thisWeek);
      return;
    }
    const first = weekStartOf(`${next}-01`);
    setWeekStart(weekMonth(first) === next ? first : shiftWeek(first, 1));
  };
  const changePeriod = (next: LedgerPeriod) => {
    if (next === period) return;
    // 주로 바꿀 때는 보고 있던 날(달력에서 고른 날 등)이 든 주로 간다.
    if (next === "week") goWeek(weekStartOf(activeDay));
    setPeriod(next);
  };

  const totalBudget = ledger?.budget.totalBudget ?? null;
  const pace = ledger
    ? getBudgetPace({
        month,
        today,
        budget: totalBudget,
        spent: ledger.summary.expense,
      })
    : null;
  const isOverBudget = (ledger?.summary.budgetRemaining ?? 0) < 0;
  const hidesMonthSummary =
    tab === "stats" || tab === "savings" || tab === "recurring" || tab === "trips";
  const balanceNeedsSetup =
    ledger != null &&
    ledger.account.baseDate != null &&
    ledger.account.checkedBalance == null &&
    ledger.account.openingBalance === 0;

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-5 md:px-8 md:py-8">
        <header className="relative flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid size-9 place-items-center rounded-full bg-muted text-primary">
                <Wallet className="size-4" />
              </span>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                머니노트
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => openSettings()} disabled={!ledger}>
              <Settings2 /> 예산·설정
            </Button>
            <Button
              variant="outline"
              onClick={() => setPasteOpen(true)}
              disabled={!ledger}
            >
              <ClipboardPaste /> 알림 붙여넣기
            </Button>
            <Button onClick={openAdd} disabled={!ledger}>
              <Plus /> 내역 추가
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="로그아웃"
              onClick={logout}
              className="absolute top-0 right-0 md:static"
            >
              <LogOut />
            </Button>
          </div>
        </header>

        {/* 탭은 항상 같은 자리에 두고, 월 이동은 그 아래 왼쪽에 둔다. */}
        <div className="mt-5 flex flex-col items-start gap-2">
          <LedgerTabs tab={tab} onChange={setTab} />

          {!hidesMonthSummary && (
            <div className="-ml-2 flex flex-wrap items-center gap-1">
              {isWeek ? (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="이전 주"
                    onClick={() => goWeek(shiftWeek(weekStart, -1))}
                  >
                    <ChevronLeft />
                  </Button>
                  <span className="min-w-24 text-center text-sm font-medium text-foreground tabular-nums">
                    {periodLabel}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="다음 주"
                    onClick={() => goWeek(shiftWeek(weekStart, 1))}
                  >
                    <ChevronRight />
                  </Button>
                  {weekStart !== thisWeek && (
                    <Button variant="ghost" size="sm" onClick={() => goWeek(thisWeek)}>
                      이번 주
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="이전 달"
                    onClick={() => setMonth((current) => shiftMonth(current, -1))}
                  >
                    <ChevronLeft />
                  </Button>
                  <span className="min-w-24 text-center text-sm font-medium text-foreground tabular-nums">
                    {monthLabel}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="다음 달"
                    onClick={() => setMonth((current) => shiftMonth(current, 1))}
                  >
                    <ChevronRight />
                  </Button>
                  {month !== thisMonth && (
                    <Button variant="ghost" size="sm" onClick={() => setMonth(thisMonth)}>
                      이번 달
                    </Button>
                  )}
                </>
              )}
              <ViewToggle
                label="기간 단위"
                options={PERIODS}
                value={period}
                onChange={changePeriod}
              />
            </div>
          )}
        </div>

        <div className={cn("mt-4", hidesMonthSummary && "hidden")}>
          <RecapCard period={period} periodKey={isWeek ? weekStart : month} />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {!ledger ? (
              Array.from({ length: 4 }, (_, index) => (
                <div
                  key={index}
                  className="h-[104px] animate-pulse rounded-xl border border-border bg-muted"
                />
              ))
            ) : (
              <>
                <SummaryCard
                  label="잔액"
                  value={
                    balanceNeedsSetup
                      ? "맞추기 필요"
                      : formatWon(ledger.account.currentBalance)
                  }
                  hint={
                    ledger.account.checkedAt
                      ? `${kst(ledger.account.checkedAt).format("M월 D일")} 통장과 맞춤`
                      : "눌러서 실제 잔액과 맞추기"
                  }
                  tone={ledger.account.currentBalance < 0 ? "error" : undefined}
                  onClick={() => openSettings("account")}
                />
                <SummaryCard
                  label="입금"
                  value={formatWon(isWeek ? periodTotals.income : ledger.summary.income)}
                  hint={`${periodLabel} 입금`}
                  tone="success"
                />
                <SummaryCard
                  label="지출"
                  value={formatWon(
                    isWeek ? periodTotals.expense : ledger.summary.expense
                  )}
                  hint={`${periodLabel} 지출`}
                  tone="primary"
                />
                {totalBudget == null ? (
                  <Card className="">
                    <CardContent className="flex h-full flex-col justify-between px-4">
                      <div>
                        <p className="text-[11px] font-medium tracking-wide text-muted-foreground">
                          예산
                        </p>
                        <p className="mt-1 text-lg font-semibold text-muted-foreground md:text-xl">
                          아직 없음
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 self-start"
                        onClick={() => openSettings()}
                      >
                        예산 정하기
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <SummaryCard
                    label="예산"
                    value={
                      isOverBudget
                        ? `${formatWon(-(ledger.summary.budgetRemaining ?? 0))} 초과`
                        : `${formatWon(ledger.summary.budgetRemaining ?? 0)} 남음`
                    }
                    hint={`${formatWon(totalBudget)} 중 ${ledger.summary.budgetUsedPct ?? 0}%`}
                    note={paceNote(pace)}
                    tone={isOverBudget ? "error" : undefined}
                    bar={{
                      pct: ledger.summary.budgetUsedPct ?? 0,
                      marker: pace?.state === "current" ? pace.elapsedPct : undefined,
                    }}
                  />
                )}
              </>
            )}
          </div>
          {ledger && <CategoryBudgetCard ledger={ledger} />}
        </div>

        <div className="mt-6">
          {(isLoading && !ledger) || (periodPending && !otherQuery.isError) ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }, (_, index) => (
                <div
                  key={index}
                  className="h-24 animate-pulse rounded-xl border border-border bg-muted"
                />
              ))}
            </div>
          ) : (isError && !ledger) || (periodPending && otherQuery.isError) ? (
            <div className="rounded-xl bg-card px-6 py-10 text-center ring-1 ring-foreground/10">
              <p className="text-sm font-medium text-foreground">
                가계부를 불러오지 못했어요
              </p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                {loadError instanceof Error
                  ? loadError.message
                  : "잠시 후 다시 시도해 주세요."}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => (isError ? refetch() : otherQuery.refetch())}
              >
                다시 시도
              </Button>
            </div>
          ) : ledger ? (
            <>
              {tab === "list" && (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="search"
                      aria-label="내역 검색"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="내용, 태그, 분류로 전체 기간 검색"
                      className="pl-9"
                    />
                  </div>

                  {!deferredSearch && (
                    <AssetChips
                      label="내역 결제수단"
                      assets={ledger.assets}
                      entries={periodEntries}
                      selected={filterAsset}
                      onSelect={setAssetFilter}
                    />
                  )}

                  {!deferredSearch && (
                    <ExpenseCategoryChips
                      label="내역 분류"
                      categories={ledger.categories}
                      selected={filterCategory?.id ?? "all"}
                      onSelect={selectCategoryFilter}
                    />
                  )}

                  {!deferredSearch && filterCategory && (
                    <SubcategoryChips
                      label="내역 소분류"
                      categoryId={filterCategory.id}
                      subcategories={ledger.subcategories}
                      entries={assetEntries}
                      selected={filterSub}
                      onSelect={setSubcategoryFilter}
                    />
                  )}

                  {!deferredSearch && filterLabel && dayGroups.length > 0 && (
                    <p className="px-1 text-[12px] text-muted-foreground tabular-nums">
                      {periodLabel} {filterLabel} {listEntries.length}건 · 지출{" "}
                      <span className="font-medium text-foreground">
                        {formatWon(
                          listEntries
                            .filter((entry) => entry.kind === "expense")
                            .reduce((sum, entry) => sum + entry.amount, 0)
                        )}
                      </span>
                    </p>
                  )}

                  {!deferredSearch && topExpenses.length > 0 && (
                    <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 [&>*]:min-w-0">
                      {/* 내역 필터를 따른다: 분류를 고르면 소분류별, 소분류까지 고르면 사용처별. */}
                      {filterCategory ? (
                        <CategoryCard
                          key={filterLabel}
                          entries={listEntries}
                          groupBy={filterSub === "all" ? "subcategory" : "place"}
                          title={`${filterLabel} ${filterSub === "all" ? "소분류별" : "사용처별"} 지출`}
                        />
                      ) : filterAssetName ? (
                        <CategoryCard
                          key={filterLabel}
                          total={assetByCategory.expense}
                          byCategory={assetByCategory.rows}
                          entries={assetEntries}
                          title={`${filterAssetName} 분류별 지출`}
                        />
                      ) : isWeek ? (
                        <CategoryCard
                          total={assetByCategory.expense}
                          byCategory={assetByCategory.rows}
                          entries={periodEntries}
                        />
                      ) : (
                        <CategoryCard
                          total={ledger.summary.expense}
                          byCategory={ledger.byCategory}
                          entries={ledger.entries}
                        />
                      )}
                      {topExpenses.length > 0 && (
                        <section
                          aria-label="큰 지출"
                          className="rounded-xl bg-card p-4 ring-1 ring-foreground/10"
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <h3 className="text-[12px] font-medium text-muted-foreground">
                              큰 지출 TOP 8
                            </h3>
                            <span className="text-[11px] text-muted-foreground">
                              {periodLabel}
                              {filterLabel && ` · ${filterLabel}`}
                            </span>
                          </div>
                          <TopExpensesList items={topExpenses} className="mt-2" />
                        </section>
                      )}
                    </div>
                  )}

                  {deferredSearch ? (
                    <SearchResults query={deferredSearch} onEdit={openEdit} />
                  ) : filterLabel && !dayGroups.length ? (
                    <div className="rounded-xl bg-card px-6 py-10 text-center ring-1 ring-foreground/10">
                      <p className="text-[13px] text-muted-foreground">
                        {periodLabel}에는 {filterLabel} 내역이 없어요
                      </p>
                    </div>
                  ) : dayGroups.length ? (
                    dayGroups.map((group) => (
                      <section
                        key={group.date}
                        className="rounded-xl bg-card p-2 ring-1 ring-foreground/10 md:p-3"
                      >
                        <div className="flex items-baseline justify-between gap-2 px-2 pt-1 pb-1.5">
                          <h3 className="text-[13px] font-medium text-foreground">
                            {formatDayKo(group.date)}
                          </h3>
                          <span className="text-[11px] text-muted-foreground tabular-nums">
                            지출 {formatWon(group.expense)}
                            {group.income > 0 && ` · 입금 ${formatWon(group.income)}`}
                            {group.transfer > 0 && ` · 이체 ${formatWon(group.transfer)}`}
                          </span>
                        </div>
                        <LedgerEntryList entries={group.entries} onEdit={openEdit} />
                      </section>
                    ))
                  ) : (
                    <div className="rounded-xl bg-card px-6 py-12 text-center ring-1 ring-foreground/10">
                      <div className="mx-auto grid size-12 place-items-center rounded-full bg-muted text-primary">
                        <Wallet className="size-5" />
                      </div>
                      <p className="mt-3 text-sm font-medium text-foreground">
                        {isWeek ? "이 주에는 기록이 없어요" : "아직 기록이 없어요"}
                      </p>
                      <p className="mt-1 text-[13px] text-muted-foreground">
                        첫 지출을 남겨보세요
                      </p>
                      <Button className="mt-4" size="sm" onClick={openAdd}>
                        <Plus /> 내역 추가
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {tab === "calendar" && (
                <CalendarView
                  ledger={ledger}
                  weekStart={isWeek ? weekStart : null}
                  entries={periodEntries}
                  calendar={periodCalendar}
                  activeDay={activeDay}
                  onSelectDay={setSelectedDay}
                  onEdit={openEdit}
                />
              )}

              {tab === "savings" && <SavingsView ledger={ledger} />}

              {tab === "recurring" && <RecurringTab ledger={ledger} />}

              {tab === "trips" && <TripsTab ledger={ledger} />}

              {tab === "stats" && (
                <StatsView
                  categories={ledger.categories}
                  subcategories={ledger.subcategories}
                  month={month}
                  onMonthChange={changeMonth}
                  initialPeriod={period}
                  weekStart={weekStart}
                  onWeekChange={goWeek}
                  trips={ledger.trips}
                  expenseReference={ledger.expenseReference}
                  totalBudget={ledger.budget.totalBudget}
                  onEdit={openEdit}
                />
              )}
            </>
          ) : null}
        </div>
      </main>

      {ledger && (
        <>
          <EntryDialog
            open={entryOpen}
            onOpenChange={setEntryOpen}
            ledger={ledger}
            defaultDate={defaultEntryDate}
            entry={editingEntry}
          />
          <SettingsDialog
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            ledger={ledger}
            initialTab={settingsTab}
          />
          <PasteDialog open={pasteOpen} onOpenChange={setPasteOpen} />
        </>
      )}
    </AppShell>
  );
};
