import { kst } from "@/lib/kst";
import { comparableMonthRange } from "@/lib/ledger/compare";
import type { LedgerBudgetPace } from "@/lib/ledger/pace";
import { comparableWeekRange, isInWeek, weekEndOf, weekMonth } from "@/lib/ledger/week";

/** 리캡은 내역 화면에서 고른 기간(달 또는 주)을 따라간다. */
export type LedgerRecapPeriod = "month" | "week";

export type LedgerRecap = {
  period: LedgerRecapPeriod;
  from: string;
  /** 진행 중인 기간은 오늘까지 */
  to: string;
  /** 오늘이 든 기간이면 true. 비교도 지난 기간의 같은 날까지만 한다. */
  inProgress: boolean;
  expense: number;
  expenseCount: number;
  previousExpense: number;
  topExpenses: { id: number; date: string; label: string; amount: number }[];
  /** 기간 지출 전부, 오래된 순. 영수증에 한 줄씩 찍는다. */
  items: {
    id: number;
    date: string;
    label: string;
    amount: number;
    categoryName: string | null;
  }[];
  /** 기간이 속한 달의 예산 상황. 예산을 정하지 않았으면 null */
  budget: {
    month: string;
    total: number;
    spent: number;
    pace: LedgerBudgetPace;
  } | null;
};

export type LedgerRecapRange = {
  from: string;
  to: string;
  inProgress: boolean;
  previousFrom: string;
  previousTo: string;
  /** 예산을 볼 달 */
  month: string;
};

const DATE = "YYYY-MM-DD";

/**
 * 리캡 기간과 비교할 지난 기간.
 * key는 달이면 YYYY-MM, 주면 그 주 월요일(YYYY-MM-DD)이다.
 */
export const recapRange = (
  period: LedgerRecapPeriod,
  key: string,
  today: string
): LedgerRecapRange => {
  if (period === "week") {
    const end = weekEndOf(key);
    const inProgress = isInWeek(today, key);
    const previous = comparableWeekRange(key, today);
    return {
      from: key,
      to: inProgress ? today : end,
      inProgress,
      previousFrom: previous.from,
      previousTo: previous.to,
      month: weekMonth(key),
    };
  }

  const first = kst(`${key}-01`);
  const inProgress = today.startsWith(`${key}-`);
  const previous = comparableMonthRange(key, today);
  return {
    from: first.format(DATE),
    to: inProgress ? today : first.endOf("month").format(DATE),
    inProgress,
    previousFrom: previous.from,
    previousTo: previous.to,
    month: key,
  };
};
