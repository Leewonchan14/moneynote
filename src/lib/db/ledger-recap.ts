import {
  compareLedgerEntries,
  getLedgerMonth,
  type LedgerEntryView,
} from "@/lib/db/ledger";
import { getLedgerStats } from "@/lib/db/ledger-stats";
import { kst } from "@/lib/kst";
import { getBudgetPace } from "@/lib/ledger/pace";
import { recapRange, type LedgerRecap, type LedgerRecapPeriod } from "@/lib/ledger/recap";

const TOP_EXPENSES = 3;

const entryLabel = (entry: LedgerEntryView) =>
  entry.memo || entry.subcategoryName || entry.categoryName || "내역";

/** 리캡을 좁힐 분류. subcategory는 소분류 id, "none"(소분류 없음), 또는 "all". */
export type LedgerRecapCategoryFilter = {
  categoryId: number;
  subcategory: number | "none" | "all";
};

/**
 * 고른 달이나 주의 리캡. key는 달이면 YYYY-MM, 주면 그 주 월요일이다.
 * category를 주면 그 분류(소분류)의 지출만 세고, 예산도 그 분류의 예산으로 본다.
 */
export const getLedgerRecap = async (
  period: LedgerRecapPeriod,
  key: string,
  options: { excludeTrips?: boolean; category?: LedgerRecapCategoryFilter | null } = {}
): Promise<LedgerRecap> => {
  const { excludeTrips = false, category = null } = options;
  const inCategory = (entry: LedgerEntryView) =>
    category == null ||
    (entry.categoryId === category.categoryId &&
      (category.subcategory === "all" ||
        (category.subcategory === "none"
          ? entry.subcategoryId == null
          : entry.subcategoryId === category.subcategory)));
  const today = kst().format("YYYY-MM-DD");
  const range = recapRange(period, key, today);

  const [current, previous, ledger] = await Promise.all([
    getLedgerStats(range.from, range.to, { excludeTrips }),
    getLedgerStats(range.previousFrom, range.previousTo, { excludeTrips }),
    getLedgerMonth(range.month),
  ]);

  const isExpense = (entry: LedgerEntryView) =>
    entry.kind === "expense" && inCategory(entry);
  const expenses = current.entries.filter(isExpense);
  const sumOf = (entries: LedgerEntryView[]) =>
    entries.reduce((sum, entry) => sum + entry.amount, 0);
  const expense = category ? sumOf(expenses) : current.summary.expense;
  const expenseCount = category ? expenses.length : current.summary.expenseCount;
  const previousExpense = category
    ? sumOf(previous.entries.filter(isExpense))
    : previous.summary.expense;

  // 분류를 고르면 그 분류의 예산을 본다. 소분류에는 예산이 없어 보여 주지 않는다.
  const total = category
    ? category.subcategory === "all"
      ? (ledger.budget.byCategory.find((row) => row.categoryId === category.categoryId)
          ?.amount ?? null)
      : null
    : ledger.budget.totalBudget;
  // 여행을 빼고 볼 때는 예산 사용량도 여행 지출을 뺀 금액으로 본다.
  const spent =
    excludeTrips || category
      ? sumOf(
          ledger.entries.filter(
            (entry) => isExpense(entry) && (!excludeTrips || entry.tripId == null)
          )
        )
      : ledger.summary.expense;
  const pace = getBudgetPace({ month: range.month, today, budget: total, spent });

  return {
    period,
    from: range.from,
    to: range.to,
    inProgress: range.inProgress,
    expense,
    expenseCount,
    previousExpense,
    topExpenses: [...expenses]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, TOP_EXPENSES)
      .map((entry) => ({
        id: entry.id,
        date: entry.entryDate,
        label: entryLabel(entry),
        amount: entry.amount,
      })),
    items: [...expenses]
      .sort((a, b) => compareLedgerEntries(b, a))
      .map((entry) => ({
        id: entry.id,
        date: entry.entryDate,
        label: entryLabel(entry),
        amount: entry.amount,
        categoryName: entry.categoryName,
      })),
    budget: total != null && pace ? { month: range.month, total, spent, pace } : null,
  };
};
