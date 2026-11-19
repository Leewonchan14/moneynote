"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";

import type { CategoryFilter } from "@/components/ledger/category-chips";
import type { LedgerEntryView } from "@/lib/db/ledger";
import { kst } from "@/lib/kst";
import { formatWon } from "@/lib/ledger/format";
import { cn } from "@/lib/utils";

export const TOP_EXPENSE_COUNT = 8;

/** 같은 내용(없으면 분류)끼리 묶어 금액이 큰 순서로 자른다. 묶인 내역도 함께 둔다. */
export const groupTopExpenses = (
  entries: LedgerEntryView[],
  selected: CategoryFilter
) => {
  const totals = new Map<
    string,
    { amount: number; count: number; entries: LedgerEntryView[] }
  >();

  for (const entry of entries) {
    if (entry.kind !== "expense") continue;
    if (selected !== "all" && entry.categoryId !== selected) continue;
    const name = entry.memo.trim() || entry.categoryName || "지출";
    const total = totals.get(name) ?? { amount: 0, count: 0, entries: [] };
    total.amount += entry.amount;
    total.count += 1;
    total.entries.push(entry);
    totals.set(name, total);
  }

  return [...totals.entries()]
    .map(([name, total]) => ({ name, ...total }))
    .sort(
      (a, b) => b.amount - a.amount || b.count - a.count || a.name.localeCompare(b.name)
    )
    .slice(0, TOP_EXPENSE_COUNT);
};

const ENTRY_PREVIEW_COUNT = 5;

const entryTitle = (entry: LedgerEntryView) =>
  entry.memo.trim() || entry.subcategoryName || entry.categoryName || "지출";

/**
 * 묶음 안의 실제 내역을 최근 날짜부터 보여 준다. 누르면 그 내역을 고칠 수 있다.
 * 큰 지출·분류별 지출을 펼쳤을 때 "언제 썼는지" 바로 찾게 해 준다.
 */
export const EntryDateList = ({
  entries,
  onEdit,
  label = "내역",
  className,
}: {
  entries: LedgerEntryView[];
  onEdit?: (entry: LedgerEntryView) => void;
  label?: string;
  className?: string;
}) => {
  const [showAll, setShowAll] = useState(false);
  const sorted = [...entries].sort(
    (a, b) =>
      b.entryDate.localeCompare(a.entryDate) ||
      (b.entryTime ?? "").localeCompare(a.entryTime ?? "") ||
      b.id - a.id
  );
  const visible = showAll ? sorted : sorted.slice(0, ENTRY_PREVIEW_COUNT);
  const hidden = sorted.length - visible.length;

  return (
    <div className={className}>
      <p className="text-[11px] font-medium text-muted-foreground">
        {label} {sorted.length}건
      </p>
      <ul aria-label={label} className="mt-1 space-y-0.5">
        {visible.map((entry) => {
          const meta = [entry.subcategoryName, entry.assetName]
            .filter(Boolean)
            .join(" · ");
          const body = (
            <>
              <span className="w-[4.5rem] shrink-0 text-[11px] text-muted-foreground tabular-nums">
                {kst(entry.entryDate).format("M.D (ddd)")}
              </span>
              <span className="min-w-0 flex-1 truncate text-foreground">
                {entryTitle(entry)}
                {meta && (
                  <span className="ml-1 text-[11px] text-muted-foreground">{meta}</span>
                )}
              </span>
              <span className="shrink-0 text-foreground tabular-nums">
                {formatWon(entry.amount)}
              </span>
            </>
          );
          return (
            <li key={entry.id}>
              {onEdit ? (
                <button
                  type="button"
                  onClick={() => onEdit(entry)}
                  className="flex w-full items-baseline gap-2 rounded-md px-1 py-1 text-left text-[12px] hover:bg-background/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {body}
                </button>
              ) : (
                <div className="flex items-baseline gap-2 px-1 py-1 text-[12px]">
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {sorted.length > ENTRY_PREVIEW_COUNT && (
        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          className="mt-1 px-1 text-[11px] text-muted-foreground underline-offset-2 hover:underline"
        >
          {showAll ? "접기" : `${hidden}건 더 보기`}
        </button>
      )}
    </div>
  );
};

export const TopExpensesList = ({
  items,
  onEdit,
  className,
}: {
  items: ReturnType<typeof groupTopExpenses>;
  onEdit?: (entry: LedgerEntryView) => void;
  className?: string;
}) => {
  // 같은 name을 가진 details는 하나만 열린다.
  const group = useId();
  const [openName, setOpenName] = useState<string | null>(null);
  const max = Math.max(1, ...items.map((item) => item.amount));

  return (
    <ul aria-label="큰 지출 목록" className={cn("space-y-2.5", className)}>
      {items.map((item) => (
        <li key={item.name}>
          {/* 누르면 그 묶음의 내역을 날짜별로 펼친다. */}
          <details
            name={group}
            className="group"
            onToggle={(event) => {
              const open = event.currentTarget.open;
              setOpenName((current) =>
                open ? item.name : current === item.name ? null : current
              );
            }}
          >
            <summary className="block cursor-pointer list-none rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-details-marker]:hidden">
              <div className="flex items-baseline justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1 text-[12px] text-foreground">
                  <span className="truncate">{item.name}</span>
                  <ChevronDown className="size-3 shrink-0 self-center text-muted-foreground transition-transform group-open:rotate-180" />
                </span>
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
            </summary>
            {openName === item.name && (
              <EntryDateList
                entries={item.entries}
                onEdit={onEdit}
                label={`${item.name} 내역`}
                className="mt-2 rounded-lg bg-muted/60 p-2.5"
              />
            )}
          </details>
        </li>
      ))}
    </ul>
  );
};
