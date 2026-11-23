import { and, eq, isNotNull } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/db";
import { activeEntry, normalizeDate } from "@/lib/db/ledger";
import { buildDayRoute, type DayRoutePayload } from "@/lib/ledger/day-route";

/**
 * 그날 지출 중 지도 링크에서 좌표를 읽은 것을 시간 순서의 정거장으로 돌려준다.
 * 분류 필터·여행 보기와 상관없이 그날 다닌 곳을 모두 잇는다.
 */
export const getDayRoute = async (date: unknown): Promise<DayRoutePayload> => {
  const day = normalizeDate(date);
  const entries = schema.ledgerEntries;
  const rows = await getDb()
    .select({
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
        eq(entries.entryDate, day),
        isNotNull(entries.mapLat),
        isNotNull(entries.mapLng)
      )
    );
  return buildDayRoute(day, rows);
};
