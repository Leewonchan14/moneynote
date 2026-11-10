import Papa from "papaparse";

import type { LedgerEntryView } from "@/lib/db/ledger";

const KIND_LABEL: Record<LedgerEntryView["kind"], string> = {
  expense: "지출",
  income: "입금",
  transfer: "이체",
};

/** Excel이 한글을 UTF-8로 읽도록 BOM을 붙이고, 수식으로 해석될 값은 이스케이프한다. */
export const ledgerEntriesToCsv = (entries: LedgerEntryView[]): string =>
  `﻿${Papa.unparse(
    entries.map((entry) => ({
      날짜: entry.entryDate,
      시각: entry.entryTime ?? "",
      구분: KIND_LABEL[entry.kind],
      금액: entry.amount,
      분류: entry.categoryName ?? "",
      소분류: entry.subcategoryName ?? "",
      결제수단: entry.assetName ?? "",
      저축상품: entry.savingsName ?? "",
      내용: entry.memo,
      메모: entry.note,
      태그: entry.tags,
      여행: entry.tripName ?? "",
    })),
    { escapeFormulae: true }
  )}`;
