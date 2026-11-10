"use client";

import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatMonthKo, todayKst } from "@/lib/ledger/format";
import { formatWeekKo, weekEndOf, weekStartOf } from "@/lib/ledger/week";
import { cn } from "@/lib/utils";

const triggerClass =
  "h-8 min-w-24 gap-1 px-2 text-sm font-medium text-foreground tabular-nums";

/**
 * 기간 라벨을 누르면 열리는 고르기 창. 화살표로 하나씩 옮기는 대신 멀리 있는 주·달로
 * 바로 갈 때 쓴다. max를 주면 그 뒤로는 고를 수 없다(통계처럼 미래가 의미 없는 곳).
 */
export const WeekPicker = ({
  weekStart,
  onChange,
  max,
}: {
  /** 주의 월요일(YYYY-MM-DD) */
  weekStart: string;
  onChange: (weekStart: string) => void;
  /** 고를 수 있는 마지막 주의 월요일 */
  max?: string;
}) => {
  const [open, setOpen] = useState(false);
  const from = parseISO(weekStart);
  const to = parseISO(weekEndOf(weekStart));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button type="button" variant="ghost" className={triggerClass} />}
      >
        {formatWeekKo(weekStart, todayKst())}
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          locale={ko}
          weekStartsOn={1}
          selected={{ from, to }}
          defaultMonth={from}
          // shadcn 달력의 연·월 드롭다운으로 먼 주에도 바로 간다.
          captionLayout="dropdown"
          startMonth={new Date(2015, 0)}
          endMonth={
            max ? parseISO(weekEndOf(max)) : new Date(new Date().getFullYear() + 5, 11)
          }
          disabled={max ? { after: parseISO(weekEndOf(max)) } : undefined}
          // 누른 날이 든 주(월~일)를 통째로 고른다. 범위 선택 계산 결과는 쓰지 않는다.
          onSelect={(_, day) => {
            onChange(weekStartOf(format(day, "yyyy-MM-dd")));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
};

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);
const monthKey = (year: number, month: number) =>
  `${year}-${String(month).padStart(2, "0")}`;

export const MonthPicker = ({
  month,
  onChange,
  max,
}: {
  /** YYYY-MM */
  month: string;
  onChange: (month: string) => void;
  /** 고를 수 있는 마지막 달(YYYY-MM) */
  max?: string;
}) => {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(() => Number(month.slice(0, 4)));
  const maxYear = max ? Number(max.slice(0, 4)) : undefined;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // 열 때마다 보고 있는 달의 해부터 보여 준다.
        if (next) setYear(Number(month.slice(0, 4)));
        setOpen(next);
      }}
    >
      <PopoverTrigger
        render={<Button type="button" variant="ghost" className={triggerClass} />}
      >
        {formatMonthKo(month)}
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent className="w-64" align="start">
        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="이전 해"
            onClick={() => setYear((value) => value - 1)}
          >
            <ChevronLeft />
          </Button>
          <span className="text-sm font-medium tabular-nums">{year}년</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="다음 해"
            disabled={maxYear != null && year >= maxYear}
            onClick={() => setYear((value) => value + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
        <div className="grid grid-cols-4 gap-1">
          {MONTHS.map((value) => {
            const key = monthKey(year, value);
            const selected = key === month;
            return (
              <Button
                key={key}
                type="button"
                variant={selected ? "default" : "ghost"}
                size="sm"
                aria-label={formatMonthKo(key)}
                aria-pressed={selected}
                disabled={max != null && key > max}
                className={cn("tabular-nums", !selected && "font-normal")}
                onClick={() => {
                  onChange(key);
                  setOpen(false);
                }}
              >
                {value}월
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};
