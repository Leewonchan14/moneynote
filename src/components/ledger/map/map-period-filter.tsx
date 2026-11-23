"use client";

import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import { CalendarRange, ChevronDown, Plane } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { kst } from "@/lib/kst";
import {
  MAP_PRESET_RANGES,
  type LedgerMapRange,
  type LedgerMapTrip,
} from "@/lib/ledger/map-types";
import { cn } from "@/lib/utils";

const PRESET_LABEL: Record<(typeof MAP_PRESET_RANGES)[number], string> = {
  all: "전체",
  year: "올해",
  month: "이번 달",
};

const chipClass = (active: boolean) =>
  cn(
    "inline-flex h-7 max-w-56 shrink-0 items-center gap-1 rounded-full border px-3 text-[12px] font-medium whitespace-nowrap transition-colors",
    active
      ? "border-primary/30 bg-primary/10 text-primary"
      : "border-border bg-card text-muted-foreground hover:text-foreground"
  );

/** 올해면 "11.3", 다른 해면 "25.12.24" */
const shortDate = (date: string) => {
  const day = kst(date);
  return day.format(day.isSame(kst(), "year") ? "M.D" : "YY.M.D");
};

/** "11.1 ~ 11.22", 하루면 "11.3" */
export const formatPeriod = (from: string, to: string) =>
  from === to ? shortDate(from) : `${shortDate(from)} ~ ${shortDate(to)}`;

const toDay = (date: Date) => format(date, "yyyy-MM-dd");

/** 날짜를 직접 고른다. 시작·끝을 누른 뒤 "적용"을 눌러야 지도가 바뀐다. */
const DateRangeChip = ({
  active,
  from,
  to,
  onApply,
}: {
  active: boolean;
  from: string | null;
  to: string | null;
  onApply: (from: string, to: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>();
  /** 시작 날짜만 누르고 끝 날짜를 기다리는 중인지 */
  const [picking, setPicking] = useState(false);
  const today = kst().format("YYYY-MM-DD");

  /**
   * 두 번 눌러 기간을 고른다. 첫 번째 누름은 새 기간의 시작(하루짜리)이 되고,
   * 두 번째 누름이 끝이 된다. 앞 날짜를 누르면 앞뒤를 바꾼다.
   */
  const pickDay = (day: Date) => {
    if (!picking || !draft?.from) {
      setDraft({ from: day, to: day });
      setPicking(true);
      return;
    }
    const start = draft.from;
    setDraft(day < start ? { from: day, to: start } : { from: start, to: day });
    setPicking(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // 열 때마다 지금 보고 있는 기간을 보여 주고, 누르면 새로 고른다.
        if (next) {
          setDraft(
            active && from
              ? { from: parseISO(from), to: parseISO(to ?? from) }
              : undefined
          );
          setPicking(false);
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger
        render={
          <button type="button" aria-pressed={active} className={chipClass(active)} />
        }
      >
        <CalendarRange className="size-3.5 shrink-0" />
        <span className="truncate tabular-nums">
          {active && from ? formatPeriod(from, to ?? from) : "날짜"}
        </span>
        <ChevronDown className="size-3.5 shrink-0 opacity-60" />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          locale={ko}
          weekStartsOn={1}
          selected={draft}
          // 달력의 범위 계산 대신 누른 날짜로 직접 정한다(pickDay).
          onSelect={(_, day) => pickDay(day)}
          defaultMonth={draft?.from ?? parseISO(today)}
          captionLayout="dropdown"
          startMonth={new Date(2015, 0)}
          endMonth={parseISO(today)}
          disabled={{ after: parseISO(today) }}
        />
        <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
          <span className="text-[12px] text-muted-foreground tabular-nums">
            {draft?.from
              ? formatPeriod(toDay(draft.from), toDay(draft.to ?? draft.from))
              : "시작 날짜와 끝 날짜를 눌러 주세요"}
          </span>
          <Button
            type="button"
            size="sm"
            disabled={!draft?.from}
            onClick={() => {
              if (!draft?.from) return;
              onApply(toDay(draft.from), toDay(draft.to ?? draft.from));
              setOpen(false);
            }}
          >
            적용
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

/** 가계부 여행 하나를 고른다. */
const TripChip = ({
  trips,
  selected,
  onSelect,
}: {
  trips: LedgerMapTrip[];
  selected: LedgerMapTrip | null;
  onSelect: (tripId: number) => void;
}) => {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-pressed={Boolean(selected)}
            className={chipClass(Boolean(selected))}
          />
        }
      >
        <Plane className="size-3.5 shrink-0" />
        <span className="truncate">{selected ? selected.name : "여행"}</span>
        <ChevronDown className="size-3.5 shrink-0 opacity-60" />
      </PopoverTrigger>
      <PopoverContent className="w-72 p-1.5" align="start">
        {trips.length ? (
          <ul
            aria-label="여행"
            className="flex max-h-80 flex-col gap-0.5 overflow-y-auto"
          >
            {trips.map((trip) => (
              <li key={trip.id}>
                <button
                  type="button"
                  aria-pressed={trip.id === selected?.id}
                  onClick={() => {
                    onSelect(trip.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    trip.id === selected?.id && "bg-muted"
                  )}
                >
                  <span className="min-w-0 truncate font-medium text-foreground">
                    {trip.name}
                  </span>
                  <span className="shrink-0 text-[12px] text-muted-foreground tabular-nums">
                    {formatPeriod(trip.startDate, trip.endDate)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-2.5 py-3 text-[13px] text-muted-foreground">
            여행 탭에서 여행을 만들면 여기서 고를 수 있어요.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
};

export interface MapPeriodFilterProps {
  range: LedgerMapRange;
  from: string | null;
  to: string | null;
  trips: LedgerMapTrip[];
  selectedTrip: LedgerMapTrip | null;
  onPreset: (range: (typeof MAP_PRESET_RANGES)[number]) => void;
  onCustom: (from: string, to: string) => void;
  onTrip: (tripId: number) => void;
}

/** 전체·올해·이번 달 칩과 날짜 직접 고르기, 여행 고르기 */
export const MapPeriodFilter = ({
  range,
  from,
  to,
  trips,
  selectedTrip,
  onPreset,
  onCustom,
  onTrip,
}: MapPeriodFilterProps) => (
  <nav aria-label="지도 기간" className="flex flex-wrap gap-1.5">
    {MAP_PRESET_RANGES.map((option) => (
      <button
        key={option}
        type="button"
        aria-pressed={range === option}
        onClick={() => onPreset(option)}
        className={chipClass(range === option)}
      >
        {PRESET_LABEL[option]}
      </button>
    ))}
    <DateRangeChip active={range === "custom"} from={from} to={to} onApply={onCustom} />
    <TripChip
      trips={trips}
      selected={range === "trip" ? selectedTrip : null}
      onSelect={onTrip}
    />
  </nav>
);
