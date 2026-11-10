"use client";

import { format, isValid, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const toDate = (value: string): Date | undefined => {
  if (!value) return undefined;
  const date = parseISO(value);
  return isValid(date) ? date : undefined;
};

/**
 * shadcn 문서의 Popover + Calendar 구성. 값은 앱 전체에서 쓰는 YYYY-MM-DD 문자열이다.
 * 같은 날짜를 다시 누르면 비운다(만기일처럼 선택 사항인 칸).
 */
export const DatePicker = ({
  value,
  onChange,
  id,
  "aria-label": ariaLabel,
  placeholder = "날짜 선택",
  invalid = false,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  "aria-label"?: string;
  placeholder?: string;
  invalid?: boolean;
  className?: string;
}) => {
  const [open, setOpen] = useState(false);
  const date = toDate(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            id={id}
            aria-label={ariaLabel}
            aria-invalid={invalid || undefined}
            data-empty={!date}
            data-value={value}
            className={cn(
              "w-full justify-start text-left font-normal tabular-nums data-[empty=true]:text-muted-foreground",
              className
            )}
          />
        }
      >
        <CalendarIcon />
        {date ? (
          format(date, "yyyy. M. d. (EEE)", { locale: ko })
        ) : (
          <span>{placeholder}</span>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={ko}
          selected={date}
          defaultMonth={date}
          onSelect={(next) => {
            onChange(next ? format(next, "yyyy-MM-dd") : "");
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
};
