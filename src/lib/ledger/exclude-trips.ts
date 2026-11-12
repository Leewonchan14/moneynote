import type { LedgerMonthPayload } from "@/lib/db/ledger";

/**
 * 여행에 묶인 내역을 뺀 달 데이터. 합계·분류별 지출·날짜별 합계·예산 사용량을 남은
 * 내역으로 다시 계산하고, 잔액·예산 설정·여행 목록처럼 내역 필터와 무관한 값은 그대로 둔다.
 */
export const withoutTrips = (ledger: LedgerMonthPayload): LedgerMonthPayload => {
  const entries = ledger.entries.filter((entry) => entry.tripId == null);
  if (entries.length === ledger.entries.length) return ledger;

  let income = 0;
  let expense = 0;
  let transfer = 0;
  const byCategoryAmount = new Map<number | null, number>();
  const byDate = new Map<string, { expense: number; income: number }>();

  for (const entry of entries) {
    if (entry.kind === "transfer") {
      transfer += entry.amount;
      continue;
    }
    const day = byDate.get(entry.entryDate) ?? { expense: 0, income: 0 };
    if (entry.kind === "income") {
      income += entry.amount;
      day.income += entry.amount;
    } else {
      expense += entry.amount;
      day.expense += entry.amount;
      byCategoryAmount.set(
        entry.categoryId,
        (byCategoryAmount.get(entry.categoryId) ?? 0) + entry.amount
      );
    }
    byDate.set(entry.entryDate, day);
  }

  const totalBudget = ledger.budget.totalBudget;
  return {
    ...ledger,
    entries,
    summary: {
      ...ledger.summary,
      income,
      expense,
      transfer,
      balance: income - expense,
      budgetRemaining: totalBudget == null ? null : totalBudget - expense,
      budgetUsedPct:
        totalBudget == null || totalBudget === 0
          ? null
          : Math.round((expense / totalBudget) * 100),
    },
    // 남은 지출의 분류는 모두 원래 목록에 있으니, 그 행의 이름·아이콘을 그대로 쓴다.
    byCategory: ledger.byCategory
      .map((row) => {
        const amount = byCategoryAmount.get(row.categoryId) ?? 0;
        return {
          ...row,
          amount,
          pct: expense === 0 ? 0 : Math.round((amount / expense) * 100),
        };
      })
      .filter((row) => row.amount > 0)
      .sort((a, b) => b.amount - a.amount),
    calendar: [...byDate.entries()]
      .map(([date, totals]) => ({ date, ...totals }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
};
