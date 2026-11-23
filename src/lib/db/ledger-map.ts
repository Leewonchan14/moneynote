import { and, asc, eq, gte, isNotNull, isNull, lte, ne } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/db";
import {
  activeEntry,
  getTripRows,
  LedgerError,
  normalizeDate,
  readMapPlace,
} from "@/lib/db/ledger";
import { kst } from "@/lib/kst";
import {
  toMapRange,
  type LedgerMapPayload,
  type LedgerMapPayment,
  type LedgerMapPlace,
  type LedgerMapQuery,
  type LedgerMapRange,
  type LedgerMapTrip,
  type LedgerMapVisit,
} from "@/lib/ledger/map-types";
import { isNaverMapUrl } from "@/lib/ledger/map-url";

type ResolvedRange = {
  range: LedgerMapRange;
  from: string | null;
  to: string;
  trip: LedgerMapTrip | null;
};

/** 고른 기간을 실제 날짜 범위(또는 여행)로 바꾼다. 잘못된 값이면 400으로 알린다. */
const resolveRange = (query: LedgerMapQuery, trips: LedgerMapTrip[]): ResolvedRange => {
  const range = toMapRange(query.range);
  const today = kst().format("YYYY-MM-DD");
  if (range === "year" || range === "month") {
    return {
      range,
      from: kst().startOf(range).format("YYYY-MM-DD"),
      to: today,
      trip: null,
    };
  }
  if (range === "custom") {
    if (!query.from) throw new LedgerError("시작 날짜를 골라 주세요.");
    const from = normalizeDate(query.from);
    const to = query.to ? normalizeDate(query.to) : from;
    // 거꾸로 고르면 앞뒤를 바꿔 준다.
    return from <= to
      ? { range, from, to, trip: null }
      : { range, from: to, to: from, trip: null };
  }
  if (range === "trip") {
    const trip = trips.find((item) => item.id === query.trip);
    if (!trip) throw new LedgerError("여행을 찾을 수 없어요.");
    return { range, from: trip.startDate, to: trip.endDate, trip };
  }
  return { range, from: null, to: today, trip: null };
};

const ledgerExpense = and(activeEntry, eq(schema.ledgerEntries.kind, "expense"));

/** 좌표를 아직 못 읽은 지도 링크 지출 */
const listUnresolvedRows = () =>
  getDb()
    .select({ id: schema.ledgerEntries.id, mapUrl: schema.ledgerEntries.mapUrl })
    .from(schema.ledgerEntries)
    .where(
      and(
        ledgerExpense,
        ne(schema.ledgerEntries.mapUrl, ""),
        isNull(schema.ledgerEntries.mapLat)
      )
    )
    .orderBy(asc(schema.ledgerEntries.id));

/** 네이버 지도 링크가 아닌 링크(카카오·구글 등)는 좌표를 읽을 수 없으니 세지 않는다. */
const countUnresolved = async () =>
  (await listUnresolvedRows()).filter((row) => isNaverMapUrl(row.mapUrl)).length;

/** 고른 분류(소분류) 조건. 분류를 안 골랐으면 조건이 없다. */
const categoryCondition = (query: LedgerMapQuery) => {
  const entries = schema.ledgerEntries;
  if (query.category == null) return undefined;
  return and(
    eq(entries.categoryId, query.category),
    query.sub === "none"
      ? isNull(entries.subcategoryId)
      : typeof query.sub === "number"
        ? eq(entries.subcategoryId, query.sub)
        : undefined
  );
};

/** 지도 링크에서 좌표를 읽은 지출을 장소별로 묶는다. 지도 링크는 지출에만 붙는다. */
export const getLedgerMapPlaces = async (
  query: LedgerMapQuery = { range: "all" }
): Promise<LedgerMapPayload> => {
  const trips: LedgerMapTrip[] = (await getTripRows()).map(
    ({ id, name, startDate, endDate }) => ({ id, name, startDate, endDate })
  );
  const { range, from, to, trip } = resolveRange(query, trips);
  const entries = schema.ledgerEntries;
  // 여행은 날짜가 아니라 가계부에서 그 여행에 묶은 지출로 고른다.
  const period = trip
    ? eq(entries.tripId, trip.id)
    : and(lte(entries.entryDate, to), from ? gte(entries.entryDate, from) : undefined);

  const [rows, unresolved] = await Promise.all([
    getDb()
      .select({
        id: entries.id,
        entryDate: entries.entryDate,
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
        categoryName: schema.ledgerCategories.name,
      })
      .from(entries)
      .leftJoin(
        schema.ledgerCategories,
        eq(entries.categoryId, schema.ledgerCategories.id)
      )
      .where(
        and(
          ledgerExpense,
          isNotNull(entries.mapLat),
          isNotNull(entries.mapLng),
          period,
          categoryCondition(query)
        )
      ),
    countUnresolved(),
  ]);

  // 최신 기록이 먼저 오게 정렬해 두면 장소의 이름·사진은 가장 최근에 읽은 값을 쓴다.
  rows.sort(
    (a, b) =>
      b.entryDate.localeCompare(a.entryDate) ||
      (b.entryTime ?? "").localeCompare(a.entryTime ?? "") ||
      b.id - a.id
  );

  const byKey = new Map<string, LedgerMapPlace>();
  for (const row of rows) {
    if (row.mapLat === null || row.mapLng === null) continue;
    const key = row.mapPlaceId || row.mapUrl;
    const payment: LedgerMapPayment = {
      id: row.id,
      time: row.entryTime,
      amount: row.amount,
      memo: row.memo,
      categoryName: row.categoryName,
    };
    const place = byKey.get(key);
    if (place) {
      place.total += row.amount;
      place.firstDate = row.entryDate;
      // 날짜순으로 읽으므로 같은 날 결제는 바로 앞 방문에 붙는다. 하루에 여러 번 결제해도 한 번 간 것이다.
      const last = place.entries.at(-1);
      if (last?.date === row.entryDate) {
        last.amount += row.amount;
        last.payments.unshift(payment);
        continue;
      }
      place.visits += 1;
      place.entries.push({
        date: row.entryDate,
        amount: row.amount,
        payments: [payment],
      });
      continue;
    }
    const visit: LedgerMapVisit = {
      date: row.entryDate,
      amount: row.amount,
      payments: [payment],
    };
    byKey.set(key, {
      key,
      name: row.mapPlaceName || row.memo || "이름 없는 장소",
      lat: row.mapLat,
      lng: row.mapLng,
      address: row.mapAddress,
      category: row.mapCategory,
      // 같은 장소를 여러 모양의 링크로 남겨도 네이버 지도 장소 페이지로 연다.
      mapUrl: row.mapPlaceId
        ? `https://map.naver.com/p/entry/place/${row.mapPlaceId}`
        : row.mapUrl,
      imageUrl: row.mapImageUrls[0] ?? null,
      imageUrls: row.mapImageUrls,
      visits: 1,
      total: row.amount,
      firstDate: row.entryDate,
      lastDate: row.entryDate,
      entries: [visit],
    });
  }

  const places = [...byKey.values()].sort(
    (a, b) => b.visits - a.visits || b.lastDate.localeCompare(a.lastDate)
  );
  return { range, from, to, trip, trips, places, unresolved };
};

/** 한 번에 다시 읽을 최대 지출 수. 네이버가 요청이 몰리면 막기 때문에 순서대로 읽는다. */
export const MAP_REFRESH_LIMIT = 10;

/**
 * 좌표를 아직 못 읽은 네이버 지도 링크를 다시 읽는다.
 * 좌표 열이 생기기 전에 저장한 링크를 채우고, 네이버가 잠깐 막았던 링크를 다시 시도한다.
 */
export const refreshLedgerMapPlaces = async (
  limit = MAP_REFRESH_LIMIT
): Promise<{ resolved: number; remaining: number }> => {
  const targets = (await listUnresolvedRows())
    .filter((row) => isNaverMapUrl(row.mapUrl))
    .slice(0, limit);
  let resolved = 0;
  for (const target of targets) {
    const place = await readMapPlace(target.mapUrl);
    // 못 읽으면 예전에 읽은 이름·사진을 지우지 않게 건너뛴다.
    if (place.mapLat === null) continue;
    await getDb()
      .update(schema.ledgerEntries)
      .set(place)
      .where(and(eq(schema.ledgerEntries.id, target.id), activeEntry));
    resolved += 1;
  }
  return { resolved, remaining: await countUnresolved() };
};
