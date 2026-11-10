import { kst } from "@/lib/kst";

/** 12,000원 */
export const formatWon = (amount: number): string =>
  `${amount.toLocaleString("ko-KR")}원`;

/** 좁은 달력 칸용: 22,000 → 2.2만 / 3,200,000 → 320만 */
export const formatCompactWon = (amount: number): string => {
  if (amount >= 100_000_000) {
    const eok = amount / 100_000_000;
    return `${Number(eok.toFixed(eok >= 10 ? 0 : 1))}억`;
  }
  if (amount >= 10_000) {
    const man = amount / 10_000;
    return `${Number(man.toFixed(man >= 100 ? 0 : 1))}만`;
  }
  return amount.toLocaleString("ko-KR");
};

export const currentMonthKst = (): string => kst().format("YYYY-MM");

export const todayKst = (): string => kst().format("YYYY-MM-DD");

export const nowTimeKst = (): string => kst().format("HH:mm");

/** 2026-11 → 2026년 11월 */
export const formatMonthKo = (month: string): string =>
  kst(`${month}-01`).format("YYYY년 M월");

/** 2026-11-02 → 11월 2일 (월) */
export const formatDayKo = (date: string): string => kst(date).format("M월 D일 (ddd)");

export const shiftMonth = (month: string, delta: number): string =>
  kst(`${month}-01`).add(delta, "month").format("YYYY-MM");
