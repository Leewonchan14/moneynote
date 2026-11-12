"use client";

import { CornerDownRight, CreditCard } from "lucide-react";

import { CategoryIcon } from "@/components/ledger/category-icon";
import type { LedgerMonthPayload } from "@/lib/db/ledger";
import { cn } from "@/lib/utils";

export type CategoryFilter = number | "all";

/** "none"은 소분류를 정하지 않은 내역이다. */
export type SubcategoryFilter = number | "all" | "none";

export const matchesSubcategory = (
  entry: { subcategoryId: number | null },
  selected: SubcategoryFilter
) =>
  selected === "all" ||
  (selected === "none" ? entry.subcategoryId == null : entry.subcategoryId === selected);

export const subcategoryFilterName = (
  subcategories: LedgerMonthPayload["subcategories"],
  selected: SubcategoryFilter
): string | null =>
  selected === "all"
    ? null
    : selected === "none"
      ? "소분류 없음"
      : (subcategories.find((sub) => sub.id === selected)?.name ?? null);

export const categoryChipClass = (active: boolean) =>
  cn(
    "inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
    active && "border-primary/30 bg-primary/10 text-primary",
    !active && "border-border bg-card text-muted-foreground hover:text-foreground"
  );

/** 여행에 묶인 내역을 빼고 보는 토글. 내역·달력·통계 탭이 같은 값을 함께 쓴다. */
export const ExcludeTripsChip = ({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
}) => (
  <button
    type="button"
    aria-pressed={value}
    onClick={() => onChange(!value)}
    className={categoryChipClass(value)}
  >
    여행 제외
  </button>
);

export const ExpenseCategoryChips = ({
  label,
  categories,
  selected,
  onSelect,
  className,
}: {
  label: string;
  categories: LedgerMonthPayload["categories"];
  selected: CategoryFilter;
  onSelect: (value: CategoryFilter) => void;
  className?: string;
}) => (
  <div
    role="group"
    aria-label={label}
    className={cn("flex flex-wrap gap-1.5", className)}
  >
    <button
      type="button"
      aria-pressed={selected === "all"}
      onClick={() => onSelect("all")}
      className={categoryChipClass(selected === "all")}
    >
      <CategoryIcon icon="wallet" color="neutral" size={16} />
      <span className="truncate">전체</span>
    </button>
    {categories
      .filter((category) => category.kind === "expense")
      .map((category) => (
        <button
          key={category.id}
          type="button"
          aria-pressed={selected === category.id}
          onClick={() => onSelect(category.id)}
          className={categoryChipClass(selected === category.id)}
        >
          <CategoryIcon icon={category.icon} color={category.color} size={16} />
          <span className="min-w-0 truncate">{category.name}</span>
        </button>
      ))}
  </div>
);

/**
 * 고른 분류의 소분류 칩. 지금 보는 내역에 쓰인 소분류만 띄우고,
 * 소분류 없는 내역이 섞여 있으면 "소분류 없음"도 띄운다.
 */
export const SubcategoryChips = ({
  label,
  categoryId,
  subcategories,
  entries,
  selected,
  onSelect,
  className,
}: {
  label: string;
  categoryId: number;
  subcategories: LedgerMonthPayload["subcategories"];
  entries: { categoryId: number | null; subcategoryId: number | null }[];
  selected: SubcategoryFilter;
  onSelect: (value: SubcategoryFilter) => void;
  className?: string;
}) => {
  const used = new Set(
    entries
      .filter((entry) => entry.categoryId === categoryId)
      .map((entry) => entry.subcategoryId)
  );
  const options = subcategories
    .filter(
      (sub) => sub.categoryId === categoryId && (used.has(sub.id) || selected === sub.id)
    )
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const showNone = options.length > 0 && (used.has(null) || selected === "none");
  if (!options.length && selected === "all") return null;

  const chip = (value: SubcategoryFilter, text: string) => (
    <button
      key={String(value)}
      type="button"
      aria-pressed={selected === value}
      onClick={() => onSelect(value)}
      className={categoryChipClass(selected === value)}
    >
      <span className="min-w-0 truncate">{text}</span>
    </button>
  );

  return (
    <div
      role="group"
      aria-label={label}
      className={cn("flex flex-wrap items-center gap-1.5", className)}
    >
      <CornerDownRight aria-hidden className="size-3.5 text-muted-foreground" />
      {chip("all", "전체")}
      {options.map((sub) => chip(sub.id, sub.name))}
      {showNone && chip("none", "소분류 없음")}
    </div>
  );
};

/** "none"은 결제수단을 정하지 않은 내역이다. */
export type AssetFilter = number | "all" | "none";

export const matchesAsset = (entry: { assetId: number | null }, selected: AssetFilter) =>
  selected === "all" ||
  (selected === "none" ? entry.assetId == null : entry.assetId === selected);

export const assetFilterName = (
  assets: LedgerMonthPayload["assets"],
  selected: AssetFilter
): string | null =>
  selected === "all"
    ? null
    : selected === "none"
      ? "결제수단 없음"
      : (assets.find((asset) => asset.id === selected)?.name ?? null);

/**
 * 결제수단 칩. 지금 보는 내역에 쓰인 결제수단만 띄우고, 고를 것이 하나뿐이면 숨긴다.
 * 결제수단 없는 내역이 섞여 있으면 "결제수단 없음"도 띄운다.
 */
export const AssetChips = ({
  label,
  assets,
  entries,
  selected,
  onSelect,
  className,
}: {
  label: string;
  assets: LedgerMonthPayload["assets"];
  entries: { assetId: number | null }[];
  selected: AssetFilter;
  onSelect: (value: AssetFilter) => void;
  className?: string;
}) => {
  const used = new Set(entries.map((entry) => entry.assetId));
  const options = assets
    .filter((asset) => used.has(asset.id) || selected === asset.id)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const showNone = used.has(null) || selected === "none";
  if (options.length + (showNone ? 1 : 0) < 2 && selected === "all") return null;

  const chip = (value: AssetFilter, text: string) => (
    <button
      key={String(value)}
      type="button"
      aria-pressed={selected === value}
      onClick={() => onSelect(value)}
      className={categoryChipClass(selected === value)}
    >
      <span className="min-w-0 truncate">{text}</span>
    </button>
  );

  return (
    <div
      role="group"
      aria-label={label}
      className={cn("flex flex-wrap items-center gap-1.5", className)}
    >
      <CreditCard aria-hidden className="size-3.5 text-muted-foreground" />
      {chip("all", "모든 결제수단")}
      {options.map((asset) => chip(asset.id, asset.name))}
      {showNone && chip("none", "결제수단 없음")}
    </div>
  );
};
