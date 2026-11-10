import type { LedgerBudgetPace } from "@/lib/ledger/pace";
import { shiftWeek, weekEndOf, weekStartOf } from "@/lib/ledger/week";

export type LedgerWeeklyRecap = {
  from: string;
  to: string;
  expense: number;
  expenseCount: number;
  previousExpense: number;
  topExpenses: { id: number; date: string; label: string; amount: number }[];
  /** 지난주 지출 전부, 오래된 순. 영수증에 한 줄씩 찍는다. */
  items: {
    id: number;
    date: string;
    label: string;
    amount: number;
    categoryName: string | null;
  }[];
  /** 이번 달 예산 상황. 예산을 정하지 않았으면 null */
  budget: { total: number; spent: number; pace: LedgerBudgetPace } | null;
};

/** 가장 최근에 끝난 월~일 주와 그 전 주. */
export const lastCompletedWeek = (today: string) => {
  const from = shiftWeek(weekStartOf(today), -1);
  const previousFrom = shiftWeek(from, -1);
  return {
    from,
    to: weekEndOf(from),
    previousFrom,
    previousTo: weekEndOf(previousFrom),
  };
};
