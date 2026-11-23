"use client";

import { EntryIcon } from "@/components/ledger/category-icon";
import { PlacePhotoStrip } from "@/components/ledger/place-photos";
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

  // 줄 전체가 수정 버튼이라 링크·사진 버튼을 안에 넣을 수 없어, 장소 줄은 아래에 따로 둔다.
  return (
    <>
      <button
        type="button"
        onClick={() => onEdit(entry)}
        className="group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
      {entry.mapUrl && (
        // pl-14: 버튼 여백 + 아이콘 + 간격 = 제목 시작점
        <PlacePhotoStrip
          title={title}
          mapUrl={entry.mapUrl}
          placeName={entry.mapPlaceName}
          imageUrls={entry.mapImageUrls}
          className="pr-2 pb-3 pl-14"
        />
      )}
    </>
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
        // 줄에 마우스를 올리면 아래 장소 사진까지 내역 한 건 전체를 칠한다.
        <div
          key={entry.id}
          className="relative rounded-xl transition-colors not-last:after:absolute not-last:after:right-2 not-last:after:bottom-0 not-last:after:left-14 not-last:after:h-px not-last:after:bg-border has-[>button:active]:bg-muted [@media(hover:hover)]:has-[>button:hover]:bg-muted"
        >
          <LedgerEntryRow entry={entry} onEdit={onEdit} />
        </div>
      ))}
    </div>
  );
};
