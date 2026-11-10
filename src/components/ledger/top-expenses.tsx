"use client";

import type { CategoryFilter } from "@/components/ledger/category-chips";
import type { LedgerEntryView } from "@/lib/db/ledger";
import { formatWon } from "@/lib/ledger/format";
import { cn } from "@/lib/utils";

export const TOP_EXPENSE_COUNT = 8;

/** 같은 내용(없으면 분류)끼리 묶어 금액이 큰 순서로 자른다. */
export const groupTopExpenses = (
  entries: LedgerEntryView[],
  selected: CategoryFilter
) => {
  const totals = new Map<string, { amount: number; count: number }>();

  for (const entry of entries) {
    if (entry.kind !== "expense") continue;
    if (selected !== "all" && entry.categoryId !== selected) continue;
    const name = entry.memo.trim() || entry.categoryName || "지출";
    const total = totals.get(name) ?? { amount: 0, count: 0 };
    total.amount += entry.amount;
    total.count += 1;
    totals.set(name, total);
  }

  return [...totals.entries()]
    .map(([name, total]) => ({ name, ...total }))
    .sort(
      (a, b) => b.amount - a.amount || b.count - a.count || a.name.localeCompare(b.name)
    )
    .slice(0, TOP_EXPENSE_COUNT);
};

export const TopExpensesList = ({
  items,
  className,
}: {
  items: ReturnType<typeof groupTopExpenses>;
  className?: string;
}) => {
  const max = Math.max(1, ...items.map((item) => item.amount));

  return (
    <ul aria-label="큰 지출 목록" className={cn("space-y-2.5", className)}>
      {items.map((item) => (
        <li key={item.name}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[12px] text-foreground">{item.name}</span>
            <span className="shrink-0 text-[12px] font-medium text-foreground tabular-nums">
              {formatWon(item.amount)}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${(item.amount / max) * 100}%` }}
              />
            </div>
            <span className="w-6 shrink-0 text-right text-[10px] text-muted-foreground tabular-nums">
              {item.count}건
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
};
