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

/** 고른 달이나 주의 리캡. key는 달이면 YYYY-MM, 주면 그 주 월요일이다. */
export const getLedgerRecap = async (
  period: LedgerRecapPeriod,
  key: string
): Promise<LedgerRecap> => {
  const today = kst().format("YYYY-MM-DD");
  const range = recapRange(period, key, today);

  const [current, previous, ledger] = await Promise.all([
    getLedgerStats(range.from, range.to),
    getLedgerStats(range.previousFrom, range.previousTo),
    getLedgerMonth(range.month),
  ]);

  const expenses = current.entries.filter((entry) => entry.kind === "expense");
  const total = ledger.budget.totalBudget;
  const spent = ledger.summary.expense;
  const pace = getBudgetPace({ month: range.month, today, budget: total, spent });

  return {
    period,
    from: range.from,
    to: range.to,
    inProgress: range.inProgress,
    expense: current.summary.expense,
    expenseCount: current.summary.expenseCount,
    previousExpense: previous.summary.expense,
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
