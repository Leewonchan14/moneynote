"use client";

import { EntryIcon } from "@/components/ledger/category-icon";
import type { LedgerEntryView } from "@/lib/db/ledger";
import { formatWon } from "@/lib/ledger/format";

export type { LedgerEntryView };

interface RowProps {
  entry: LedgerEntryView;
  onEdit: (entry: LedgerEntryView) => void;
}

export const LedgerEntryRow = ({ entry, onEdit }: RowProps) => {
  const isIncome = entry.kind === "income";
  const isTransfer = entry.kind === "transfer";
  const title =
    entry.memo ||
    (isTransfer
      ? (entry.savingsName ?? "이체")
      : isIncome
        ? "입금"
        : entry.subcategoryName || entry.categoryName || "지출");
  const categoryLabel = isTransfer
    ? `이체 → ${entry.savingsName ?? "저축"}`
    : !isIncome &&
      [entry.categoryName ?? "분류 없음", entry.subcategoryName]
        .filter(Boolean)
        .join(" › ");
  const meta = [
    entry.entryTime,
    categoryLabel,
    entry.assetName,
    entry.tripName,
    entry.tags,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      type="button"
      onClick={() => onEdit(entry)}
      className="group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:bg-muted"
    >
      <EntryIcon entry={entry} size={36} className="rounded-[10px]" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-foreground">
          {title}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
          {meta}
        </span>
        {entry.note && (
          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground/80">
            {entry.note}
          </span>
        )}
      </span>
      <span
        className={`shrink-0 text-[13px] font-medium tabular-nums ${
          isIncome
            ? "text-[color:var(--success)]"
            : isTransfer
              ? "text-muted-foreground"
              : "text-foreground"
        }`}
      >
        {isIncome ? "+" : isTransfer ? "" : "-"}
        {formatWon(entry.amount)}
      </span>
    </button>
  );
};

interface ListProps {
  entries: LedgerEntryView[];
  onEdit: (entry: LedgerEntryView) => void;
  emptyText?: string;
}

export const LedgerEntryList = ({ entries, onEdit, emptyText }: ListProps) => {
  if (!entries.length) {
    return (
      <p className="px-2 py-6 text-center text-[12px] text-muted-foreground">
        {emptyText ?? "기록이 없어요"}
      </p>
    );
  }

  return (
    <div>
      {entries.map((entry) => (
        // 둥근 버튼에 테두리를 주면 선 끝이 휘므로, 곧은 선은 바깥 칸에 그린다.
        // left-14는 버튼 여백 + 아이콘 + 간격을 더한 글자 시작점이다.
        <div
          key={entry.id}
          className="relative not-last:after:absolute not-last:after:right-2 not-last:after:bottom-0 not-last:after:left-14 not-last:after:h-px not-last:after:bg-border"
        >
          <LedgerEntryRow entry={entry} onEdit={onEdit} />
        </div>
      ))}
    </div>
  );
};
