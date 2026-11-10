import {
  compareLedgerEntries,
  getLedgerMonth,
  type LedgerEntryView,
} from "@/lib/db/ledger";
import { getLedgerStats } from "@/lib/db/ledger-stats";
import { kst } from "@/lib/kst";
import { getBudgetPace } from "@/lib/ledger/pace";
import { lastCompletedWeek, type LedgerWeeklyRecap } from "@/lib/ledger/recap";

const TOP_EXPENSES = 3;

const entryLabel = (entry: LedgerEntryView) =>
  entry.memo || entry.subcategoryName || entry.categoryName || "내역";

export const getLedgerWeeklyRecap = async (): Promise<LedgerWeeklyRecap> => {
  const today = kst().format("YYYY-MM-DD");
  const month = today.slice(0, 7);
  const week = lastCompletedWeek(today);

  const [current, previous, ledger] = await Promise.all([
    getLedgerStats(week.from, week.to),
    getLedgerStats(week.previousFrom, week.previousTo),
    getLedgerMonth(month),
  ]);

  const expenses = current.entries.filter((entry) => entry.kind === "expense");
  const total = ledger.budget.totalBudget;
  const spent = ledger.summary.expense;
  const pace = getBudgetPace({ month, today, budget: total, spent });

  return {
    from: week.from,
    to: week.to,
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
    budget: total != null && pace ? { total, spent, pace } : null,
  };
};
