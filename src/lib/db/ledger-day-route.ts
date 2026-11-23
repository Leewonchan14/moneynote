import { and, eq, gte, isNotNull, lte, type SQL } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/db";
import { activeEntry, LedgerError, normalizeDate } from "@/lib/db/ledger";
import {
  buildDayRoute,
  DAY_ROUTE_MIN_LOCATED,
  summarizeDayRoute,
  type DayRouteDay,
  type DayRoutePayload,
  type DayRouteRow,
} from "@/lib/ledger/day-route";

/** 동선을 볼 수 있는 날을 한 번에 찾을 때 가장 긴 기간(일). 전체 기간 통계도 들어가게 넉넉히 */
const DAY_ROUTE_DAYS_MAX_SPAN = 366 * 20;

/** 지도에 찍힌 지출만 골라 동선 한 줄로 읽는다. */
const selectLocatedRows = (when: SQL) => {
  const entries = schema.ledgerEntries;
  return getDb()
    .select({
      entryDate: entries.entryDate,
      id: entries.id,
      entryTime: entries.entryTime,
      amount: entries.amount,
      memo: entries.memo,
      mapUrl: entries.mapUrl,
      mapPlaceId: entries.mapPlaceId,
      mapPlaceName: entries.mapPlaceName,
      mapImageUrls: entries.mapImageUrls,
      mapLat: entries.mapLat,
      mapLng: entries.mapLng,
      mapAddress: entries.mapAddress,
      mapCategory: entries.mapCategory,
    })
    .from(entries)
    .where(
      and(
        activeEntry,
        eq(entries.kind, "expense"),
        when,
        isNotNull(entries.mapLat),
        isNotNull(entries.mapLng)
      )
    );
};

/**
 * 그날 지출 중 지도 링크에서 좌표를 읽은 것을 시간 순서의 정거장으로 돌려준다.
 * 분류 필터·여행 보기와 상관없이 그날 다닌 곳을 모두 잇는다.
 */
export const getDayRoute = async (date: unknown): Promise<DayRoutePayload> => {
  const day = normalizeDate(date);
  const rows = await selectLocatedRows(eq(schema.ledgerEntries.entryDate, day));
  return buildDayRoute(day, rows);
};

/**
 * 기간 안에서 동선 보기를 띄울 수 있는 날(좌표 있는 지출이 두 건 이상)과 그날 요약.
 * 내역·통계 탭이 날마다 따로 묻지 않고 한 번에 버튼 자리를 정한다. 최근 날부터.
 */
export const getDayRouteDays = async (
  fromValue: unknown,
  toValue: unknown
): Promise<{ days: DayRouteDay[] }> => {
  const from = normalizeDate(fromValue);
  const to = normalizeDate(toValue);
  if (from > to) throw new LedgerError("시작일은 종료일보다 늦을 수 없어요.");
  const span = (Date.parse(to) - Date.parse(from)) / 86_400_000;
  if (span > DAY_ROUTE_DAYS_MAX_SPAN) throw new LedgerError("기간이 너무 길어요.");

  const entries = schema.ledgerEntries;
  const rows = await selectLocatedRows(
    and(gte(entries.entryDate, from), lte(entries.entryDate, to)) as SQL
  );

  const byDate = new Map<string, DayRouteRow[]>();
  for (const { entryDate, ...row } of rows) {
    const list = byDate.get(entryDate) ?? [];
    list.push(row);
    byDate.set(entryDate, list);
  }

  const days = [...byDate.entries()]
    .filter(([, list]) => list.length >= DAY_ROUTE_MIN_LOCATED)
    .map(([date, list]) => summarizeDayRoute(buildDayRoute(date, list)))
    .sort((a, b) => b.date.localeCompare(a.date));
  return { days };
};
