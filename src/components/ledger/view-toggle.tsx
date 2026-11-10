"use client";

import { cn } from "@/lib/utils";

/** 카드 안에서 보기 방식을 고르는 작은 탭 버튼 묶음. */
export const ViewToggle = <T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) => (
  <div role="group" aria-label={label} className="inline-flex rounded-lg bg-muted p-0.5">
    {options.map((option) => (
      <button
        key={option.id}
        type="button"
        aria-pressed={value === option.id}
        onClick={() => onChange(option.id)}
        className={cn(
          "rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors",
          value === option.id
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        {option.label}
      </button>
    ))}
  </div>
);
