import { kst } from "@/lib/kst";

export type LedgerBudgetPace =
  | { state: "other-month" }
  | {
      state: "current";
      status: "ok" | "risk" | "over";
      /** 오늘을 포함해 남은 날짜 */
      daysLeft: number;
      /** 남은 예산을 남은 날짜로 나눈 금액. 초과했으면 0 */
      dailyAllowance: number;
      /** 지금 속도로 월말까지 쓸 때의 예상 지출 */
      projected: number;
      /** 예상 지출이 예산을 넘는 금액. 넘지 않으면 0 */
      projectedOver: number;
      elapsedPct: number;
    };

/** 진행 중인 달을 지금 속도로 끝까지 썼을 때의 예상 지출. 다른 달은 null. */
export const projectMonthExpense = (input: {
  month: string;
  today: string;
  spent: number;
}): { projected: number; day: number; daysInMonth: number } | null => {
  const { month, today, spent } = input;
  if (!today.startsWith(`${month}-`)) return null;
  const day = Number(today.slice(8, 10));
  const daysInMonth = kst(`${month}-01`).daysInMonth();
  return { projected: Math.round((spent / day) * daysInMonth), day, daysInMonth };
};

/** 이번 달의 예산 사용 속도. 지난달·다음 달은 속도를 계산하지 않는다. */
export const getBudgetPace = (input: {
  month: string;
  today: string;
  budget: number | null;
  spent: number;
}): LedgerBudgetPace | null => {
  const { month, today, budget, spent } = input;
  if (budget == null || budget <= 0) return null;
  if (!today.startsWith(`${month}-`)) return { state: "other-month" };

  const day = Number(today.slice(8, 10));
  const daysInMonth = kst(`${month}-01`).daysInMonth();
  const daysLeft = daysInMonth - day + 1;
  const remaining = budget - spent;
  const projected = Math.round((spent / day) * daysInMonth);
  const projectedOver = Math.max(0, projected - budget);

  return {
    state: "current",
    status: remaining < 0 ? "over" : projectedOver > 0 ? "risk" : "ok",
    daysLeft,
    dailyAllowance: Math.max(0, Math.floor(remaining / daysLeft)),
    projected,
    projectedOver,
    elapsedPct: Math.round((day / daysInMonth) * 100),
  };
};
