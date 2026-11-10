"use client";

import { useQuery } from "@tanstack/react-query";
import { ReceiptText } from "lucide-react";
import { useState } from "react";

import { ReceiptDialog } from "@/components/ledger/receipt/receipt-dialog";
import { shortDate } from "@/components/ledger/trend-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuthStore } from "@/lib/auth-store";
import { ledgerKeys, ledgerRequest } from "@/lib/ledger/client";
import { formatWon } from "@/lib/ledger/format";
import type { LedgerWeeklyRecap } from "@/lib/ledger/recap";
import { cn } from "@/lib/utils";

/** 지난주 수치는 내역을 고칠 때만 바뀌므로 주기적으로 다시 읽지 않는다. */
const RECAP_STALE_MS = 5 * 60 * 1000;

const compareText = (expense: number, previous: number): string => {
  if (previous === 0) return "전주에는 지출 기록이 없어요";
  const diff = expense - previous;
  if (diff === 0) return "전주와 같은 금액이에요";
  return `전주보다 ${formatWon(Math.abs(diff))} ${diff > 0 ? "더 썼어요" : "덜 썼어요"}`;
};

const budgetText = (budget: NonNullable<LedgerWeeklyRecap["budget"]>): string | null => {
  const { pace, total, spent } = budget;
  if (pace.state !== "current") return null;
  if (pace.status === "over") {
    return `이번 달 예산을 ${formatWon(spent - total)} 넘었어요`;
  }
  if (pace.status === "risk") {
    return `이 속도면 이번 달 예산을 ${formatWon(pace.projectedOver)} 넘어요`;
  }
  return `이번 달은 예산 안이에요 · 월말 예상 ${formatWon(pace.projected)}`;
};

export const WeeklyRecapCard = () => {
  const token = useAuthStore((s) => s.token);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const { data: recap } = useQuery({
    queryKey: ledgerKeys.recap,
    queryFn: async () => {
      const { recap } = await ledgerRequest<{ recap: LedgerWeeklyRecap }>(
        token,
        "/api/ledger/recap"
      );
      return recap;
    },
    enabled: Boolean(token),
    staleTime: RECAP_STALE_MS,
  });

  if (!recap || recap.expense === 0) return null;

  const budgetLine = recap.budget && budgetText(recap.budget);
  const isOverPace =
    recap.budget?.pace.state === "current" && recap.budget.pace.status !== "ok";

  return (
    <section aria-label="지난주 리캡" className="mb-3">
      <Card>
        <CardContent className="grid gap-3 px-4 md:grid-cols-2 md:gap-6">
          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[12px] font-medium text-muted-foreground">지난주 리캡</p>
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
              {compareText(recap.expense, recap.previousExpense)}
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
