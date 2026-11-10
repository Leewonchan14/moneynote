"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ReceiptText } from "lucide-react";
import { useState } from "react";

import { ReceiptDialog } from "@/components/ledger/receipt/receipt-dialog";
import { shortDate } from "@/components/ledger/trend-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuthStore } from "@/lib/auth-store";
import { kst } from "@/lib/kst";
import { LEDGER_LIVE_QUERY, ledgerKeys, ledgerRequest } from "@/lib/ledger/client";
import { currentMonthKst, formatWon } from "@/lib/ledger/format";
import type { LedgerRecap, LedgerRecapPeriod } from "@/lib/ledger/recap";
import { cn } from "@/lib/utils";

const RECAP_TITLE: Record<LedgerRecapPeriod, string> = {
  month: "월별 리캡",
  week: "주별 리캡",
};

/** 전주보다 / 지난달 같은 기간보다 */
const previousName = (recap: LedgerRecap): string => {
  const name = recap.period === "week" ? "전주" : "지난달";
  return recap.inProgress ? `${name} 같은 기간` : name;
};

const compareText = (recap: LedgerRecap): string => {
  const name = previousName(recap);
  if (recap.previousExpense === 0) return `${name}에는 지출 기록이 없어요`;
  const diff = recap.expense - recap.previousExpense;
  if (diff === 0) return `${name}${name === "전주" ? "와" : "과"} 같은 금액이에요`;
  return `${name}보다 ${formatWon(Math.abs(diff))} ${diff > 0 ? "더 썼어요" : "덜 썼어요"}`;
};

const monthName = (month: string): string => {
  const day = kst(`${month}-01`);
  return day.format(day.year() === kst().year() ? "M월" : "YYYY년 M월");
};

/** 기간이 속한 달의 예산. 지난달이면 결과를, 이번 달이면 속도를 알려 준다. */
const budgetText = (budget: NonNullable<LedgerRecap["budget"]>): string | null => {
  const { pace, total, spent, month } = budget;
  if (pace.state !== "current") {
    if (month >= currentMonthKst()) return null;
    return spent > total
      ? `${monthName(month)} 예산을 ${formatWon(spent - total)} 넘었어요`
      : `${monthName(month)} 예산 안에서 썼어요 · ${formatWon(total - spent)} 남김`;
  }
  if (pace.status === "over") {
    return `이번 달 예산을 ${formatWon(spent - total)} 넘었어요`;
  }
  if (pace.status === "risk") {
    return `이 속도면 이번 달 예산을 ${formatWon(pace.projectedOver)} 넘어요`;
  }
  return `이번 달은 예산 안이에요 · 월말 예상 ${formatWon(pace.projected)}`;
};

const isOverBudget = (budget: LedgerRecap["budget"]): boolean => {
  if (!budget) return false;
  if (budget.pace.state === "current") return budget.pace.status !== "ok";
  return budget.month < currentMonthKst() && budget.spent > budget.total;
};

/**
 * 내역 화면에서 고른 기간의 리캡. 달로 보면 월별, 주로 보면 주별 리캡이 된다.
 * periodKey는 달이면 YYYY-MM, 주면 그 주 월요일이다.
 */
export const RecapCard = ({
  period,
  periodKey,
}: {
  period: LedgerRecapPeriod;
  periodKey: string;
}) => {
  const token = useAuthStore((s) => s.token);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const { data: recap, isPlaceholderData } = useQuery({
    queryKey: ledgerKeys.recap(period, periodKey),
    queryFn: async () => {
      const param = period === "week" ? "week" : "month";
      const { recap } = await ledgerRequest<{ recap: LedgerRecap }>(
        token,
        `/api/ledger/recap?period=${period}&${param}=${periodKey}`
      );
      return recap;
    },
    enabled: Boolean(token),
    // 기간을 넘길 때 카드가 사라졌다 나타나며 화면이 튀지 않게 앞 기간 것을 잠깐 둔다.
    placeholderData: keepPreviousData,
    ...LEDGER_LIVE_QUERY,
  });

  if (!recap || recap.expense === 0) return null;
  // 단위를 바꾼 직후에는 다른 단위의 리캡을 잠깐이라도 보여 주지 않는다.
  if (recap.period !== period) return null;

  const title = RECAP_TITLE[recap.period];
  const budgetLine = recap.budget && budgetText(recap.budget);
  const isOverPace = isOverBudget(recap.budget);

  return (
    <section
      aria-label={title}
      aria-busy={isPlaceholderData}
      className={cn("mb-3 transition-opacity", isPlaceholderData && "opacity-60")}
    >
      <Card>
        <CardContent className="grid gap-3 px-4 md:grid-cols-2 md:gap-6">
          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[12px] font-medium text-muted-foreground">{title}</p>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {shortDate(recap.from)} ~ {shortDate(recap.to)}
              </span>
            </div>
            <p className="mt-1 text-lg font-semibold text-foreground tabular-nums md:text-xl">
              {formatWon(recap.expense)}
              <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                {recap.expenseCount}건
              </span>
            </p>
            <p className="mt-0.5 text-[12px] text-muted-foreground tabular-nums">
              {compareText(recap)}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2.5"
              onClick={() => setReceiptOpen(true)}
            >
              <ReceiptText />
              영수증 뽑기
            </Button>
          </div>

          <div className="min-w-0">
            <p className="text-[12px] font-medium text-muted-foreground">큰 지출</p>
            <ol className="mt-1.5 flex flex-col gap-1.5">
              {recap.topExpenses.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-baseline justify-between gap-3 text-[13px]"
                >
                  <span className="min-w-0 truncate text-foreground">{entry.label}</span>
                  <span className="shrink-0 text-foreground tabular-nums">
                    <span className="mr-1.5 text-[11px] text-muted-foreground">
                      {shortDate(entry.date)}
                    </span>
                    {formatWon(entry.amount)}
                  </span>
                </li>
              ))}
            </ol>
            {budgetLine && (
              <p
                className={cn(
                  "mt-2.5 text-[12px] tabular-nums",
                  isOverPace && "font-medium text-[color:var(--destructive)]",
                  !isOverPace && "text-muted-foreground"
                )}
              >
                {budgetLine}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
      <ReceiptDialog
        recap={recap}
        budgetLine={budgetLine || null}
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
      />
    </section>
  );
};
