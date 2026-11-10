"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

import { CATEGORY_COLOR_HEX } from "@/components/ledger/category-icon";
import type { LedgerEntryView } from "@/components/ledger/entry-list";
import { LedgerEntryList } from "@/components/ledger/entry-list";
import type { CityDay, CityTrip } from "@/components/ledger/three/spend-city";
import { ViewToggle } from "@/components/ledger/view-toggle";
import type { LedgerMonthPayload } from "@/lib/db/ledger";
import { kst } from "@/lib/kst";
import { formatCompactWon, formatDayKo, formatWon, todayKst } from "@/lib/ledger/format";
import { categoryColorOption } from "@/lib/ledger/icons";
import { topExpenseCategoryBy } from "@/lib/ledger/top-category";
import { weekDays } from "@/lib/ledger/week";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

// three.js는 3D 보기를 열 때만 받는다.
const SpendCity = dynamic(() => import("@/components/ledger/three/spend-city"), {
  ssr: false,
  loading: () => (
    <div className="h-[340px] animate-pulse rounded-lg bg-muted md:h-[440px]" />
  ),
});

const VIEWS = [
  { id: "grid", label: "달력" },
  { id: "city", label: "3D 도시" },
] as const;

type CalendarMode = (typeof VIEWS)[number]["id"];

/** 여행 깃발 색. 여행 id로 고르니 달을 넘겨도 같은 여행은 같은 색이다. */
const TRIP_COLORS = ["blue", "teal", "lavender", "pink", "clay", "sage"] as const;

const tripColors = (id: number) => {
  const option = categoryColorOption(TRIP_COLORS[id % TRIP_COLORS.length]);
  return { color: option.fg, tint: option.bg };
};

interface Props {
  ledger: LedgerMonthPayload;
  /** 주 단위로 볼 때 그 주의 월요일. null이면 달 단위. */
  weekStart: string | null;
  /** 지금 보는 기간(달 또는 주)의 내역과 날짜별 합계. 주는 두 달에 걸칠 수 있다. */
  entries: LedgerEntryView[];
  calendar: LedgerMonthPayload["calendar"];
  activeDay: string;
  onSelectDay: (date: string) => void;
  onEdit: (entry: LedgerEntryView) => void;
}

export const CalendarView = ({
  ledger,
  weekStart,
  entries,
  calendar,
  activeDay,
  onSelectDay,
  onEdit,
}: Props) => {
  const today = todayKst();
  const firstDay = kst(`${ledger.month}-01`);
  const startWeekday = firstDay.day();
  const daysInMonth = firstDay.daysInMonth();

  const cells: (string | null)[] = [
    ...Array.from({ length: startWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => {
      const day = String(index + 1).padStart(2, "0");
      return `${ledger.month}-${day}`;
    }),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const [mode, setMode] = useState<CalendarMode>("grid");
  const totalsByDate = new Map(calendar.map((day) => [day.date, day]));
  const activeTotals = totalsByDate.get(activeDay) ?? { expense: 0, income: 0 };
  const dayEntries = entries.filter((entry) => entry.entryDate === activeDay);

  const cityDays = useMemo((): CityDay[] => {
    const topByDate = topExpenseCategoryBy(ledger.entries, (entry) => entry.entryDate);
    return ledger.calendar.map((day) => ({
      date: day.date,
      expense: day.expense,
      color: topByDate.get(day.date)?.color ?? null,
    }));
  }, [ledger.calendar, ledger.entries]);

  const monthTrips = useMemo(
    () =>
      ledger.trips
        .filter(
          (trip) =>
            trip.startDate <= `${ledger.month}-31` && trip.endDate >= `${ledger.month}-01`
        )
        .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [ledger.trips, ledger.month]
  );
  const cityTrips = useMemo(
    (): CityTrip[] =>
      monthTrips.map((trip) => ({
        id: trip.id,
        name: trip.name,
        startDate: trip.startDate,
        endDate: trip.endDate,
        ...tripColors(trip.id),
      })),
    [monthTrips]
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-card p-2 ring-1 ring-foreground/10 md:p-3">
        {weekStart ? (
          <WeekStrip
            weekStart={weekStart}
            totalsByDate={totalsByDate}
            activeDay={activeDay}
            today={today}
            onSelectDay={onSelectDay}
          />
        ) : (
          <>
            <div className="flex justify-end pb-2">
              <ViewToggle
                label="달력 보기 방식"
                options={VIEWS}
                value={mode}
                onChange={setMode}
              />
            </div>
            {mode === "city" ? (
              <>
                <SpendCity
                  month={ledger.month}
                  days={cityDays}
                  trips={cityTrips}
                  activeDay={activeDay}
                  today={today}
                  onSelectDay={onSelectDay}
                />
                <CityLegend byCategory={ledger.byCategory} trips={monthTrips} />
              </>
            ) : (
              <div className="grid grid-cols-7 gap-1">
                {WEEKDAYS.map((label, index) => (
                  <div
                    key={label}
                    className={`py-1 text-center text-[11px] font-medium ${
                      index === 0
                        ? "text-primary"
                        : index === 6
                          ? "text-muted-foreground"
                          : "text-muted-foreground"
                    }`}
                  >
                    {label}
                  </div>
                ))}

                {cells.map((date, index) => {
                  if (!date) return <div key={`empty-${index}`} />;

                  const totals = totalsByDate.get(date);
                  const isToday = date === today;
                  const isSelected = date === activeDay;
                  const weekday = index % 7;

                  return (
                    <button
                      key={date}
                      type="button"
                      aria-pressed={isSelected}
                      aria-label={`${formatDayKo(date)}${totals ? `, 지출 ${formatWon(totals.expense)}` : ""}`}
                      onClick={() => onSelectDay(date)}
                      className={`flex min-h-16 flex-col items-start rounded-lg border p-1 text-left transition-colors md:min-h-20 md:p-1.5 ${
                        isSelected
                          ? "border-border bg-muted"
                          : "border-transparent hover:bg-muted/70"
                      } ${isToday ? "ring-1 ring-primary/40" : ""}`}
                    >
                      <span
                        className={`text-[11px] font-medium tabular-nums ${
                          weekday === 0
                            ? "text-primary"
                            : weekday === 6
                              ? "text-muted-foreground"
                              : "text-foreground"
                        }`}
                      >
                        {Number(date.slice(-2))}
                      </span>
                      {totals && (
                        <span className="mt-0.5 w-full space-y-0.5 overflow-hidden text-[9px] leading-tight tabular-nums md:text-[11px]">
                          {totals.expense > 0 && (
                            <span className="block truncate text-primary">
                              -{formatCompactWon(totals.expense)}
                            </span>
                          )}
                          {totals.income > 0 && (
                            <span className="block truncate text-[color:var(--success)]">
                              +{formatCompactWon(totals.income)}
                            </span>
                          )}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      <section className="rounded-xl bg-card p-2 ring-1 ring-foreground/10 md:p-3">
        <div className="flex items-baseline justify-between gap-2 px-2 pt-1 pb-2">
          <h3 className="text-[13px] font-medium text-foreground">
            {formatDayKo(activeDay)}
          </h3>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            지출 {formatWon(activeTotals.expense)}
            {activeTotals.income > 0 && ` · 입금 ${formatWon(activeTotals.income)}`}
          </span>
        </div>
        <LedgerEntryList
          entries={dayEntries}
          onEdit={onEdit}
          emptyText="이 날은 기록이 없어요"
        />
      </section>
    </div>
  );
};

const CityLegend = ({
  byCategory,
  trips,
}: {
  byCategory: LedgerMonthPayload["byCategory"];
  trips: LedgerMonthPayload["trips"];
}) => (
  <div className="space-y-1.5 px-1 pt-2 text-[11px] text-muted-foreground">
    <p>
      높이는 그날 지출, 색은 가장 많이 쓴 분류예요. 나무는 무지출한 날이고, 깃발이 꽂힌
      띠는 여행 기간이에요. 끌어서 돌려 보고, 건물을 누르면 그날 내역이 아래에 나와요.
    </p>
    {byCategory.length > 0 && (
      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {byCategory.slice(0, 6).map((category) => (
          <li key={category.categoryId ?? "none"} className="flex items-center gap-1">
            <span
              className="size-2 rounded-[2px]"
              style={{ background: CATEGORY_COLOR_HEX(category.color) }}
            />
            {category.name}
          </li>
        ))}
      </ul>
    )}
    {trips.length > 0 && (
      <ul aria-label="이 달의 여행" className="space-y-1 pt-0.5">
        {trips.map((trip) => (
          <li key={trip.id} className="flex items-center gap-1.5 tabular-nums">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: tripColors(trip.id).color }}
            />
            <span className="min-w-0 truncate font-medium text-foreground">
              {trip.name}
            </span>
            <span className="shrink-0">
              {shortDot(trip.startDate)}~{shortDot(trip.endDate)} · 지출{" "}
              {formatWon(trip.expense)}
            </span>
          </li>
        ))}
      </ul>
    )}
  </div>
);

const shortDot = (date: string) => date.slice(5).replace("-", ".");

const WEEK_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

/** 주 단위 달력: 월~일 7칸에 그날 지출 막대와 금액을 크게 보여 준다. */
const WeekStrip = ({
  weekStart,
  totalsByDate,
  activeDay,
  today,
  onSelectDay,
}: {
  weekStart: string;
  totalsByDate: Map<string, { expense: number; income: number }>;
  activeDay: string;
  today: string;
  onSelectDay: (date: string) => void;
}) => {
  const days = weekDays(weekStart);
  const totals = days.map((date) => totalsByDate.get(date) ?? { expense: 0, income: 0 });
  const maxExpense = Math.max(1, ...totals.map((day) => day.expense));
  const weekExpense = totals.reduce((sum, day) => sum + day.expense, 0);
  const weekIncome = totals.reduce((sum, day) => sum + day.income, 0);
  const spendDays = totals.filter((day) => day.expense > 0).length;
  const pastDays = days.filter((date) => date <= today).length;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-1 pb-2 text-[11px] text-muted-foreground tabular-nums">
        <span>
          이 주 지출{" "}
          <span className="font-medium text-foreground">{formatWon(weekExpense)}</span>
          {weekIncome > 0 && ` · 입금 ${formatWon(weekIncome)}`}
        </span>
        {pastDays > 0 && <span>무지출 {Math.max(0, pastDays - spendDays)}일</span>}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((date, index) => {
          const day = totals[index];
          const isSelected = date === activeDay;
          const isToday = date === today;
          // 첫날과 달이 바뀌는 날에는 월도 적는다.
          const showMonth = index === 0 || date.endsWith("-01");
          const barPct =
            day.expense > 0 ? Math.max(6, (day.expense / maxExpense) * 100) : 0;
          return (
            <button
              key={date}
              type="button"
              aria-pressed={isSelected}
              aria-label={`${formatDayKo(date)}, 지출 ${formatWon(day.expense)}`}
              onClick={() => onSelectDay(date)}
              className={cn(
                "flex min-w-0 flex-col items-center rounded-lg border px-0.5 pt-1.5 pb-1 transition-colors",
                isSelected
                  ? "border-border bg-muted"
                  : "border-transparent hover:bg-muted/70",
                isToday && "ring-1 ring-primary/40"
              )}
            >
              <span
                className={cn(
                  "text-[11px] font-medium",
                  index === 5 ? "text-muted-foreground" : "text-foreground"
                )}
              >
                {WEEK_LABELS[index]}
              </span>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {showMonth
                  ? `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`
                  : Number(date.slice(8))}
              </span>
              <span className="mt-1 flex h-16 w-full items-end justify-center md:h-24">
                <span
                  aria-hidden="true"
                  className="w-3/5 max-w-6 rounded-t-[3px] bg-primary/80"
                  style={{ height: `${barPct}%` }}
                />
              </span>
              <span className="mt-1 h-3.5 w-full truncate text-center text-[10px] text-primary tabular-nums md:text-[11px]">
                {day.expense > 0 ? `-${formatCompactWon(day.expense)}` : ""}
              </span>
              <span className="h-3.5 w-full truncate text-center text-[10px] text-[color:var(--success)] tabular-nums md:text-[11px]">
                {day.income > 0 ? `+${formatCompactWon(day.income)}` : ""}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
