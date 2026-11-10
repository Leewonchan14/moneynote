import { kst } from "@/lib/kst";

/**
 * 주는 월요일에 시작해 일요일에 끝난다(지난주 리캡과 같다).
 * 주는 그 주 월요일 날짜(YYYY-MM-DD)로 가리킨다.
 */
const DATE = "YYYY-MM-DD";

/** 날짜가 든 주의 월요일. */
export const weekStartOf = (date: string): string => {
  const day = kst(date);
  return day.subtract((day.day() + 6) % 7, "day").format(DATE);
};

export const weekEndOf = (start: string): string => kst(start).add(6, "day").format(DATE);

export const shiftWeek = (start: string, delta: number): string =>
  kst(start)
    .add(delta * 7, "day")
    .format(DATE);

export const isInWeek = (date: string, start: string): boolean =>
  date >= start && date <= weekEndOf(start);

/** 주의 7일. */
export const weekDays = (start: string): string[] =>
  Array.from({ length: 7 }, (_, index) => kst(start).add(index, "day").format(DATE));

/**
 * 주가 속한 달. 두 달에 걸친 주는 목요일이 든 달로 친다(ISO 주 번호와 같은 규칙).
 * 예산·잔액 같은 달 단위 정보는 이 달 것을 보여 준다.
 */
export const weekMonth = (start: string): string =>
  kst(start).add(3, "day").format("YYYY-MM");

/** 주에 걸친 달들(한 달 또는 두 달). */
export const weekMonths = (start: string): string[] => {
  const first = start.slice(0, 7);
  const last = weekEndOf(start).slice(0, 7);
  return first === last ? [first] : [first, last];
};

/** 11월 3일 ~ 9일 / 10월 27일 ~ 11월 2일 / 2025년 12월 29일 ~ 2026년 1월 4일 */
export const formatWeekKo = (start: string, today: string): string => {
  const from = kst(start);
  const to = kst(weekEndOf(start));
  const showYear = from.year() !== to.year() || from.year() !== kst(today).year();
  const fromText = from.format(showYear ? "YYYY년 M월 D일" : "M월 D일");
  const toText =
    from.year() !== to.year()
      ? to.format("YYYY년 M월 D일")
      : from.month() !== to.month()
        ? to.format("M월 D일")
        : to.format("D일");
  return `${fromText} ~ ${toText}`;
};

/** 통계에서 볼 주 기간. 이번 주는 오늘까지다. */
export const weekRange = (start: string, today: string): { from: string; to: string } => {
  const end = weekEndOf(start);
  return { from: start, to: isInWeek(today, start) ? today : end };
};

/** 비교할 지난주 기간. 진행 중인 주는 지난주의 같은 요일까지만 비교해야 공평하다. */
export const comparableWeekRange = (
  start: string,
  today: string
): { from: string; to: string } => {
  const previous = shiftWeek(start, -1);
  const days = isInWeek(today, start) ? kst(today).diff(kst(start), "day") : 6;
  return { from: previous, to: kst(previous).add(days, "day").format(DATE) };
};
