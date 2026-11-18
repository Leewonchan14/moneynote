import type { LedgerMonthPayload } from "@/lib/db/ledger";

/**
 * 여행에 묶인 내역을 어떻게 볼지. 내역·달력 탭이 함께 쓴다.
 * - all: 전체
 * - exclude: 여행에 묶인 내역을 빼고
 * - 숫자: 그 여행(id)에 묶인 내역만
 */
export type TripScope = "all" | "exclude" | number;

export const matchesTripScope = (tripId: number | null, scope: TripScope) =>
  scope === "all" || (scope === "exclude" ? tripId == null : tripId === scope);

type LedgerEntry = LedgerMonthPayload["entries"][number];

/** 날짜별 지출·입금 합계. 달력이 쓰는 모양이다(이체는 넣지 않는다). */
export const calendarOf = (entries: LedgerEntry[]) => {
  const byDate = new Map<string, { expense: number; income: number }>();
  for (const entry of entries) {
    if (entry.kind === "transfer") continue;
    const day = byDate.get(entry.entryDate) ?? { expense: 0, income: 0 };
    if (entry.kind === "income") day.income += entry.amount;
    else day.expense += entry.amount;
    byDate.set(entry.entryDate, day);
  }
  return [...byDate.entries()]
    .map(([date, totals]) => ({ date, ...totals }))
    .sort((a, b) => a.date.localeCompare(b.date));
};

/**
 * 조건에 맞는 내역만 남긴 달 데이터. 합계·분류별 지출·날짜별 합계·예산 사용량을 남은
 * 내역으로 다시 계산하고, 잔액·예산 설정·여행 목록처럼 내역 필터와 무관한 값은 그대로 둔다.
 */
export const scopeLedgerEntries = (
  ledger: LedgerMonthPayload,
  keep: (entry: LedgerEntry) => boolean
): LedgerMonthPayload => {
  const entries = ledger.entries.filter(keep);
  if (entries.length === ledger.entries.length) return ledger;

  let income = 0;
  let expense = 0;
  let transfer = 0;
  const byCategoryAmount = new Map<number | null, number>();

  for (const entry of entries) {
    if (entry.kind === "transfer") {
      transfer += entry.amount;
    } else if (entry.kind === "income") {
      income += entry.amount;
    } else {
      expense += entry.amount;
      byCategoryAmount.set(
        entry.categoryId,
        (byCategoryAmount.get(entry.categoryId) ?? 0) + entry.amount
      );
    }
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
    calendar: calendarOf(entries),
  };
};

/** 여행 범위에 맞는 내역만 남긴 달 데이터. */
export const scopeLedgerToTrips = (
  ledger: LedgerMonthPayload,
  scope: TripScope
): LedgerMonthPayload =>
  scope === "all"
    ? ledger
    : scopeLedgerEntries(ledger, (entry) => matchesTripScope(entry.tripId, scope));
