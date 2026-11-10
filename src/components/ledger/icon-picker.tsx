"use client";

import { Check, Search } from "lucide-react";
import { useState } from "react";

import { CategoryIcon } from "@/components/ledger/category-icon";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  CATEGORY_COLOR_OPTIONS,
  CATEGORY_ICON_OPTIONS,
  type LedgerCategoryColorKey,
  type LedgerCategoryIconKey,
} from "@/lib/ledger/icons";

interface IconPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: LedgerCategoryIconKey;
  onSelect: (icon: LedgerCategoryIconKey) => void;
}

export const IconPickerDialog = ({
  open,
  onOpenChange,
  value,
  onSelect,
}: IconPickerDialogProps) => {
  const [query, setQuery] = useState("");

  const normalized = query.trim().toLowerCase();
  const options = normalized
    ? CATEGORY_ICON_OPTIONS.filter(
        (option) =>
          option.label.toLowerCase().includes(normalized) ||
          option.keywords.some((keyword) => keyword.toLowerCase().includes(normalized))
      )
    : CATEGORY_ICON_OPTIONS;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[82dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>아이콘 선택</DialogTitle>
          <DialogDescription>가계부에 어울리는 아이콘만 모았어요.</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="아이콘 검색 (산책, 병원, 구독)"
            aria-label="아이콘 검색"
            className="pl-9"
          />
        </div>

        {options.length ? (
          <div className="grid grid-cols-5 gap-2">
            {options.map((option) => {
              const selected = option.key === value;
              return (
                <button
                  key={option.key}
                  type="button"
                  aria-label={option.label}
                  aria-pressed={selected}
                  onClick={() => {
                    onSelect(option.key);
                    onOpenChange(false);
                    setQuery("");
                  }}
                  className={`flex min-w-0 flex-col items-center gap-1 rounded-xl p-1.5 transition-colors hover:bg-muted ${
                    selected ? "bg-muted ring-2 ring-primary" : ""
                  }`}
                >
                  <CategoryIcon icon={option.key} color={option.defaultColor} size={36} />
                  <span className="w-full truncate text-center text-[9px] text-muted-foreground">
                    {option.label}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="py-8 text-center text-[12px] text-muted-foreground">
            검색 결과가 없어요
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
};

interface ColorSwatchesProps {
  value: LedgerCategoryColorKey;
  onChange: (color: LedgerCategoryColorKey) => void;
}

export const CategoryColorSwatches = ({ value, onChange }: ColorSwatchesProps) => (
  <div className="flex flex-wrap gap-1.5">
    {CATEGORY_COLOR_OPTIONS.map((color) => {
      const selected = color.key === value;
      return (
        <button
          key={color.key}
          type="button"
          aria-label={`${color.label} 색상`}
          aria-pressed={selected}
          onClick={() => onChange(color.key)}
          className={`grid size-6 place-items-center rounded-full transition-transform ${
            selected
              ? "ring-offset-surface ring-2 ring-foreground ring-offset-1"
              : "hover:scale-110"
          }`}
          style={{ backgroundColor: color.bg, color: color.fg }}
        >
          {selected ? <Check size={12} strokeWidth={2.4} /> : null}
        </button>
      );
    })}
  </div>
);
