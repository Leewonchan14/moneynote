import type { LedgerEntryView } from "@/lib/db/ledger";
import { categoryColorOption } from "@/lib/ledger/icons";

export type TopCategory = { name: string; color: string };

/**
 * 묶음(날짜, 달 등)마다 지출이 가장 많은 분류를 고른다.
 * 3D 장면에서 건물·막대 색을 정할 때 쓴다. color는 분류 색의 진한 hex다.
 */
export const topExpenseCategoryBy = (
  entries: LedgerEntryView[],
  keyOf: (entry: LedgerEntryView) => string
): Map<string, TopCategory> => {
  const sums = new Map<string, Map<string, { amount: number } & TopCategory>>();
  for (const entry of entries) {
    if (entry.kind !== "expense") continue;
    const key = keyOf(entry);
    const byCategory = sums.get(key) ?? new Map();
    sums.set(key, byCategory);
    const categoryKey = String(entry.categoryId ?? "none");
    const current = byCategory.get(categoryKey) ?? {
      amount: 0,
      name: entry.categoryName ?? "미분류",
      color: categoryColorOption(entry.categoryColor).fg,
    };
    current.amount += entry.amount;
    byCategory.set(categoryKey, current);
  }

  const result = new Map<string, TopCategory>();
  for (const [key, byCategory] of sums) {
    let top: ({ amount: number } & TopCategory) | null = null;
    for (const item of byCategory.values())
      if (!top || item.amount > top.amount) top = item;
    if (top) result.set(key, { name: top.name, color: top.color });
  }
  return result;
};
