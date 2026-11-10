import { and, eq, lte } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/db";
import { activeEntry, LedgerError, normalizeMonth } from "@/lib/db/ledger";
import { kst } from "@/lib/kst";
import {
  buildSavingsInsight,
  findUnusualSpending,
  type SavingsInsight,
  type UnusualSpending,
} from "@/lib/ledger/insights";

export type LedgerInsights = {
  unusual: UnusualSpending;
  savings: SavingsInsight;
};

/** 달별 인사이트. 오늘까지의 전체 내역을 읽어 평소와 비교한다. */
export const getLedgerInsights = async (
  monthInput: unknown,
  options: { excludeTrips?: boolean } = {}
): Promise<LedgerInsights> => {
  const month = normalizeMonth(monthInput);
  const today = kst().format("YYYY-MM-DD");
  if (month > today.slice(0, 7)) {
    throw new LedgerError("아직 오지 않은 달은 볼 수 없어요.");
  }

  const db = getDb();
  const [rows, categories, subcategories, rules] = await Promise.all([
    db
      .select({
        id: schema.ledgerEntries.id,
        entryDate: schema.ledgerEntries.entryDate,
        kind: schema.ledgerEntries.kind,
        amount: schema.ledgerEntries.amount,
        categoryId: schema.ledgerEntries.categoryId,
        subcategoryId: schema.ledgerEntries.subcategoryId,
        savingsId: schema.ledgerEntries.savingsId,
        recurringId: schema.ledgerEntries.recurringId,
        tripId: schema.ledgerEntries.tripId,
        memo: schema.ledgerEntries.memo,
      })
      .from(schema.ledgerEntries)
      .where(and(activeEntry, lte(schema.ledgerEntries.entryDate, today))),
    db
      .select({ id: schema.ledgerCategories.id, name: schema.ledgerCategories.name })
      .from(schema.ledgerCategories),
    db
      .select({
        id: schema.ledgerSubcategories.id,
        name: schema.ledgerSubcategories.name,
      })
      .from(schema.ledgerSubcategories),
    db
      .select({ memo: schema.ledgerRecurring.memo })
      .from(schema.ledgerRecurring)
      .where(eq(schema.ledgerRecurring.kind, "expense")),
  ]);

  // 여행 제외는 평소 기준에서도 여행을 빼야 공평하다.
  const entries = options.excludeTrips ? rows.filter((row) => row.tripId == null) : rows;

  return {
    unusual: findUnusualSpending({ month, today, entries, categories, subcategories }),
    savings: buildSavingsInsight({
      month,
      entries,
      recurringMemos: rules.map((rule) => rule.memo),
    }),
  };
};
