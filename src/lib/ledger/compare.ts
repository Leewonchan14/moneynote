import { kst } from "@/lib/kst";
import type { LedgerCategoryColorKey, LedgerCategoryIconKey } from "@/lib/ledger/icons";

interface ComparablePeriod {
  summary: { income: number; expense: number };
  byCategory: {
    categoryId: number | null;
    name: string;
    icon: LedgerCategoryIconKey;
    color: LedgerCategoryColorKey;
    amount: number;
  }[];
}

/**
 * 비교할 지난달 기간. 진행 중인 달은 지난달의 같은 날까지만 비교해야 공평하다.
 */
export const comparableMonthRange = (
  month: string,
  today: string
): { from: string; to: string } => {
  const first = kst(`${month}-01`).subtract(1, "month");
  const lastDay = first.daysInMonth();
  const day = today.startsWith(`${month}-`)
    ? Math.min(Number(today.slice(8, 10)), lastDay)
    : lastDay;
  return {
    from: first.format("YYYY-MM-DD"),
    to: first.date(day).format("YYYY-MM-DD"),
  };
};

const delta = (current: number, previous: number) => ({
  current,
  previous,
  diff: current - previous,
  pct: previous === 0 ? null : Math.round(((current - previous) / previous) * 100),
});

const MAX_CATEGORY_CHANGES = 5;

export const compareLedgerPeriods = (
  current: ComparablePeriod,
  previous: ComparablePeriod
) => {
  const previousById = new Map(previous.byCategory.map((row) => [row.categoryId, row]));
  const currentIds = new Set(current.byCategory.map((row) => row.categoryId));

  const categories = [
    ...current.byCategory.map((row) => ({
      ...row,
      diff: row.amount - (previousById.get(row.categoryId)?.amount ?? 0),
    })),
    ...previous.byCategory
      .filter((row) => !currentIds.has(row.categoryId))
      .map((row) => ({ ...row, amount: 0, diff: -row.amount })),
  ]
    .filter((row) => row.diff !== 0)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
    .slice(0, MAX_CATEGORY_CHANGES);

  return {
    expense: delta(current.summary.expense, previous.summary.expense),
    income: delta(current.summary.income, previous.summary.income),
    categories,
    hasPrevious: previous.summary.expense !== 0 || previous.summary.income !== 0,
  };
};
