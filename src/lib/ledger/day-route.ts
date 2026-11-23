/** 그날의 동선: 하루 지출 중 지도에 찍힌 곳을 시간 순서로 잇는다. 브라우저와 서버가 함께 쓴다. */

/** 한 곳에서 한 결제 */
export type DayRoutePayment = {
  id: number;
  time: string | null;
  amount: number;
  memo: string;
};

/** 동선의 한 정거장. 같은 곳에서 잇달아 결제했으면 한 정거장으로 묶는다. */
export type DayRouteStop = {
  /** 정거장의 첫 결제 id */
  id: number;
  /** 첫 결제 시각(HH:mm). 시간을 안 적었으면 null */
  time: string | null;
  name: string;
  category: string;
  address: string;
  lat: number;
  lng: number;
  /** 대표 사진. 없으면 null */
  imageUrl: string | null;
  /** 이 정거장에서 쓴 돈 */
  amount: number;
  /** 먼저 한 결제부터 */
  payments: DayRoutePayment[];
};

export type DayRoutePayload = {
  date: string;
  /** 시간 순서. 시간을 안 적은 곳은 맨 뒤에 남긴 순서대로 */
  stops: DayRouteStop[];
  /** 좌표가 있는 지출 건수. 정거장으로 묶기 전 */
  located: number;
  /** 시간을 안 적어 맨 뒤에 둔 결제 건수 */
  untimed: number;
};

/** 동선을 만드는 데 쓰는 지출 한 건 */
export type DayRouteRow = {
  id: number;
  entryTime: string | null;
  amount: number;
  memo: string;
  mapUrl: string;
  mapPlaceId: string;
  mapPlaceName: string;
  mapImageUrls: string[];
  mapLat: number | null;
  mapLng: number | null;
  mapAddress: string;
  mapCategory: string;
};

/** "동선 보기"를 띄우는 최소 지출 수 */
export const DAY_ROUTE_MIN_LOCATED = 2;

/**
 * 좌표가 있는 지출을 시각 순서로 줄 세우고, 바로 앞과 같은 곳이면 한 정거장으로 묶는다.
 * 시간을 안 적은 지출은 맨 뒤에 남긴 순서(id)대로 둔다.
 */
export const buildDayRoute = (date: string, rows: DayRouteRow[]): DayRoutePayload => {
  const located = rows.filter(
    (row): row is DayRouteRow & { mapLat: number; mapLng: number } =>
      row.mapLat !== null && row.mapLng !== null
  );
  const sorted = [...located].sort((a, b) => {
    if (a.entryTime === null || b.entryTime === null) {
      if (a.entryTime !== b.entryTime) return a.entryTime === null ? 1 : -1;
    } else if (a.entryTime !== b.entryTime) {
      return a.entryTime.localeCompare(b.entryTime);
    }
    return a.id - b.id;
  });

  const stops: DayRouteStop[] = [];
  let lastKey: string | null = null;
  for (const row of sorted) {
    const key = row.mapPlaceId || row.mapUrl || `${row.mapLat},${row.mapLng}`;
    const payment: DayRoutePayment = {
      id: row.id,
      time: row.entryTime,
      amount: row.amount,
      memo: row.memo,
    };
    const last = stops.at(-1);
    if (last && lastKey === key) {
      last.amount += row.amount;
      last.payments.push(payment);
      continue;
    }
    lastKey = key;
    stops.push({
      id: row.id,
      time: row.entryTime,
      name: row.mapPlaceName || row.memo || "이름 없는 장소",
      category: row.mapCategory,
      address: row.mapAddress,
      lat: row.mapLat,
      lng: row.mapLng,
      imageUrl: row.mapImageUrls[0] ?? null,
      amount: row.amount,
      payments: [payment],
    });
  }

  return {
    date,
    stops,
    located: located.length,
    untimed: located.filter((row) => row.entryTime === null).length,
  };
};

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** 두 좌표 사이의 직선(대권) 거리(km) */
export const haversineKm = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number => {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
};

/** 정거장을 차례로 이은 거리의 합(km). 실제 길이 아니라 직선 거리다. */
export const routeDistanceKm = (stops: { lat: number; lng: number }[]): number =>
  stops.reduce(
    (sum, stop, index) => (index === 0 ? 0 : sum + haversineKm(stops[index - 1], stop)),
    0
  );

/** 1 km 아래는 m(10 m 단위), 10 km 아래는 소수 한 자리, 그 위는 정수 km */
export const formatDistance = (km: number): string => {
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)}m`;
  if (km < 10) return `${km.toFixed(1)}km`;
  return `${Math.round(km)}km`;
};

/** 다음 정거장까지 선을 그을 때 천천히 출발해 천천히 닿게 하는 보간. 0~1 */
export const easeInOut = (t: number): number =>
  t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;

/**
 * step번째 정거장까지 다 그리고, 다음 정거장으로 가는 길을 travel(0~1)만큼 더 그린 선.
 * [lng, lat] 좌표 목록이다.
 */
export const partialRoute = (
  stops: { lat: number; lng: number }[],
  step: number,
  travel: number
): [number, number][] => {
  const last = Math.min(step, stops.length - 1);
  const coords = stops
    .slice(0, last + 1)
    .map((stop) => [stop.lng, stop.lat] as [number, number]);
  const from = stops[last];
  const to = stops[last + 1];
  if (from && to && travel > 0) {
    const t = Math.min(1, travel);
    coords.push([from.lng + (to.lng - from.lng) * t, from.lat + (to.lat - from.lat) * t]);
  }
  return coords;
};
