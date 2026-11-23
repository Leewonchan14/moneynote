/**
 * 네이버 지도 링크에서 장소 이름과 사진들을 읽는다.
 *
 * 앱의 공유 링크(`https://naver.me/...`)는 `map.naver.com?...&pinId=<장소 id>`를 거쳐
 * `map.naver.com/p/entry/place/<장소 id>`로 넘어간다. 장소 id를 찾으면 모바일 플레이스 페이지
 * (`m.place.naver.com/place/<id>/home`)를 읽는다.
 * - 이름: og:title
 * - 사진: 페이지에 들어 있는 데이터(`__APOLLO_STATE__`)의 상단 사진 목록(`topPhotos`).
 *   업체·방문자 사진만 쓰고 영상은 뺀다. 목록이 없으면 og:image 한 장을 쓴다.
 *
 * 사진 파일은 저장하지 않고 주소만 저장한다. 화면은 네이버 이미지 서버에서 바로 받는다.
 * 읽지 못하면 null을 돌려주고, 내역 저장은 그대로 진행한다.
 */

import { isNaverHost, isNaverMapUrl } from "@/lib/ledger/map-url";

const FETCH_TIMEOUT_MS = 4_000;
const MAX_REDIRECTS = 5;
const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const placeOrigin = () =>
  (process.env.NAVER_PLACE_ORIGIN || "https://m.place.naver.com").replace(/\/+$/, "");

/** 한 장소에서 저장할 최대 사진 수 */
export const MAX_PLACE_PHOTOS = 10;

export interface NaverPlacePreview {
  placeId: string;
  placeName: string;
  /** 앞의 것이 대표 사진 */
  imageUrls: string[];
}

const toUrl = (value: string): URL | null =>
  URL.canParse(value) ? new URL(value) : null;

/**
 * 주소에서 장소 id를 꺼낸다.
 * - map.naver.com/p/entry/place/123, map.naver.com/p/search/카페/place/123
 * - map.naver.com?pinId=123 (단축 링크가 처음 넘기는 주소)
 * - m.place.naver.com/restaurant/123/home, pcmap.place.naver.com/place/123
 */
export const extractNaverPlaceId = (value: string): string | null => {
  const url = toUrl(value);
  if (!url || !isNaverHost(url.hostname) || url.hostname === "naver.me") return null;
  const fromPath = url.hostname.endsWith("place.naver.com")
    ? url.pathname.match(/^\/[a-z]+\/(\d+)(?:\/|$)/)
    : url.pathname.match(/\/place\/(\d+)(?:\/|$)/);
  if (fromPath) return fromPath[1];
  const pinId = url.searchParams.get("pinId");
  return pinId && /^\d+$/.test(pinId) ? pinId : null;
};

const fetchWithTimeout = (url: string, init: RequestInit = {}) =>
  fetch(url, {
    ...init,
    headers: { "User-Agent": MOBILE_UA, ...init.headers },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

/** 단축 링크는 네이버 주소 안에서만 넘겨 가며 장소 id를 찾는다. */
export const resolveNaverPlaceId = async (value: string): Promise<string | null> => {
  let current = value;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const placeId = extractNaverPlaceId(current);
    if (placeId) return placeId;
    const url = toUrl(current);
    if (!url || !isNaverHost(url.hostname) || hop === MAX_REDIRECTS) return null;
    const res = await fetchWithTimeout(url.href, { redirect: "manual" });
    const location = res.headers.get("location");
    if (res.status < 300 || res.status >= 400 || !location) return null;
    current = new URL(location, url).href;
  }
  return null;
};

const decodeEntities = (value: string) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x2F;|&#47;/g, "/")
    .replace(/&amp;/g, "&");

const metaContent = (html: string, property: string): string | null => {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (!new RegExp(`\\sproperty="${property}"`).test(tag)) continue;
    const content = tag.match(/\scontent="([^"]*)"/)?.[1];
    if (content) return decodeEntities(content).trim();
  }
  return null;
};

/** og:title은 "장소 이름 : 네이버" 꼴이다. */
const toPlaceName = (title: string | null) =>
  (title ?? "")
    // 네이버가 제목 끝에 제어 문자(\x1C)를 붙여 보내는 경우가 있다.
    .replace(/\p{Cc}/gu, "")
    .replace(/\s*:\s*네이버\s*$/, "")
    .trim();

const isHttps = (url: unknown): url is string =>
  typeof url === "string" && /^https:\/\//.test(url);

/** `window.__APOLLO_STATE__ = {...}`의 객체를 문자열 안의 괄호까지 따져 잘라 읽는다. */
const readApolloState = (html: string): Record<string, unknown> | null => {
  const marker = html.indexOf("__APOLLO_STATE__");
  const start = marker < 0 ? -1 : html.indexOf("{", marker);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < html.length; i += 1) {
    const ch = html[i];
    if (inString) {
      if (ch === "\\") i += 1;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1)) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
};

interface TopPhotoItem {
  mediaFormat?: unknown;
  video?: unknown;
  originalUrl?: unknown;
}

/**
 * 원본은 수 MB짜리도 있어, 네이버 이미지 서버가 640×380으로 줄여 준 주소를 쓴다.
 * (og:image도 같은 꼴이다.)
 */
export const toPlacePhotoUrl = (originalUrl: string) =>
  `https://search.pstatic.net/common/?autoRotate=true&quality=95&type=f640_380&src=${encodeURIComponent(originalUrl)}`;

/** 상단 사진 목록의 사진 원본 주소들. 화면에 보이는 순서대로 */
const readTopPhotos = (state: Record<string, unknown>): string[] =>
  Object.entries(state)
    .filter(([key]) => key.startsWith("PlaceDetailTopPhotoItem:"))
    .map(([, value]) => value as TopPhotoItem)
    .filter((item) => item.mediaFormat === "image" && !item.video)
    .map((item) => item.originalUrl)
    .filter(isHttps);

export const parseNaverPlaceHtml = (html: string) => {
  const state = readApolloState(html);
  const photos = state ? readTopPhotos(state).map(toPlacePhotoUrl) : [];
  const ogImage = metaContent(html, "og:image");
  const imageUrls = photos.length ? photos : isHttps(ogImage) ? [ogImage] : [];
  return {
    placeName: toPlaceName(metaContent(html, "og:title")),
    imageUrls: [...new Set(imageUrls)].slice(0, MAX_PLACE_PHOTOS),
  };
};

/** 네이버 지도 링크의 장소 이름·사진. 네이버 링크가 아니거나 읽지 못하면 null */
export const fetchNaverPlacePreview = async (
  mapUrl: string
): Promise<NaverPlacePreview | null> => {
  if (!isNaverMapUrl(mapUrl)) return null;
  try {
    const placeId = await resolveNaverPlaceId(mapUrl);
    if (!placeId) return null;
    const res = await fetchWithTimeout(`${placeOrigin()}/place/${placeId}/home`);
    if (!res.ok) return null;
    const parsed = parseNaverPlaceHtml(await res.text());
    if (!parsed.placeName && !parsed.imageUrls.length) return null;
    return { placeId, ...parsed };
  } catch (error) {
    console.warn("[ledger] 네이버 장소 사진을 읽지 못했어요.", error);
    return null;
  }
};
