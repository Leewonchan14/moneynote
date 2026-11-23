import type { APIRequestContext, Page } from "@playwright/test";

import { kst } from "../src/lib/kst";
import {
  buildDayRoute,
  formatDistance,
  haversineKm,
  partialRoute,
  routeDistanceKm,
  type DayRouteRow,
} from "../src/lib/ledger/day-route";
import { withFakeNaverPlaces, type FakePlace } from "./fake-naver-place";
import { addEntry, authHeaders, expect, today } from "./helpers";

/**
 * 그날의 동선. 달력에서 하루를 고르면 그날 지도에 찍힌 지출을 시간 순서로 잇는 재생 창을 연다.
 * 장소는 가짜 네이버 플레이스 서버가 돌려주고, 지도 타일은 빈 스타일로 바꿔 바깥 네트워크 없이 돈다.
 */

const SPOTS = {
  "4001": { name: "동선 베이글", lat: 37.5446, lng: 127.0557 },
  "4002": { name: "동선 서점", lat: 37.5563, lng: 126.922 },
  "4003": { name: "동선 공원", lat: 37.5284, lng: 126.9326 },
  "4004": { name: "동선 국밥", lat: 37.5704, lng: 126.9921 },
  "4005": { name: "동선 편의점", lat: 37.5665, lng: 126.978 },
} as const;
type SpotId = keyof typeof SPOTS;

const PLACES: Record<string, FakePlace> = Object.fromEntries(
  Object.entries(SPOTS).map(([id, spot]) => [
    id,
    {
      title: `${spot.name} : 네이버`,
      photos: [`https://pup-review-phinf.pstatic.net/route/${id}.jpg`],
      detail: {
        lat: String(spot.lat),
        lng: String(spot.lng),
        roadAddress: "서울 샘플구 샘플길 1",
        category: "샘플",
      },
    },
  ])
);

const placeUrl = (id: SpotId) => `https://map.naver.com/p/entry/place/${id}`;

// 1x1 PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

/** 글리프·타일 없이 배경만 있는 지도 스타일 */
const EMPTY_STYLE = {
  version: 8,
  sources: {},
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#f3f1ee" } },
  ],
};

const test = withFakeNaverPlaces(PLACES);

test.beforeEach(async ({ page }) => {
  await page
    .context()
    .route("https://search.pstatic.net/**", (route) =>
      route.fulfill({ contentType: "image/png", body: PNG })
    );
  await page.context().route("https://tiles.openfreemap.org/**", (route) =>
    route.request().url().includes("/styles/")
      ? route.fulfill({
          contentType: "application/json",
          body: JSON.stringify(EMPTY_STYLE),
        })
      : route.abort()
  );
});

const visit = (
  request: APIRequestContext,
  token: string,
  data: {
    id?: SpotId;
    time: string | null;
    amount: number;
    memo: string;
    entryDate?: string;
  }
) =>
  addEntry(request, token, {
    entryDate: data.entryDate ?? today(),
    entryTime: data.time,
    amount: data.amount,
    memo: data.memo,
    mapUrl: data.id ? placeUrl(data.id) : undefined,
  });

const dayLabel = (date: string) => kst(date).format("M월 D일 (ddd)");

/** 같은 달 안의 다른 날. 1일이면 다음 날을 쓴다. */
const otherDay = () =>
  today().endsWith("-01")
    ? kst().add(1, "day").format("YYYY-MM-DD")
    : kst().subtract(1, "day").format("YYYY-MM-DD");

const openCalendar = async (page: Page, token: string) => {
  await page.addInitScript((value) => {
    localStorage.setItem(
      "moneynote-auth",
      JSON.stringify({ state: { token: value }, version: 0 })
    );
  }, token);
  await page.goto("/");
  await page.getByRole("tab", { name: "달력" }).click();
};

const routeDialog = (page: Page, date = today()) =>
  page.getByRole("dialog", { name: `${dayLabel(date)} 동선` });

const openRoute = async (page: Page, date = today()) => {
  await page.getByRole("button", { name: "동선 보기" }).click();
  const dialog = routeDialog(page, date);
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("[data-map-ready]")).toBeAttached();
  return dialog;
};

const row = (
  id: number,
  entryTime: string | null,
  place: string,
  lat: number | null = 37.5,
  lng: number | null = 127
): DayRouteRow => ({
  id,
  entryTime,
  amount: id * 1000,
  memo: `메모 ${id}`,
  mapUrl: `https://map.naver.com/p/entry/place/${place}`,
  mapPlaceId: place,
  mapPlaceName: `장소 ${place}`,
  mapImageUrls: [],
  mapLat: lat,
  mapLng: lng,
  mapAddress: "",
  mapCategory: "",
});

test.describe("계산", () => {
  test.skip(({ isMobile }) => isMobile, "화면과 상관없는 계산은 한 번만 본다");

  test("시간 순서로 줄 세우고, 시간 없는 지출은 맨 뒤, 잇달아 같은 곳은 한 정거장", () => {
    const route = buildDayRoute("2026-11-02", [
      row(1, "18:00", "c"),
      row(2, null, "d"),
      row(3, "09:00", "a"),
      row(4, "12:30", "b"),
      row(5, "12:10", "b"),
      row(6, "15:00", "x", null, null),
      row(7, "20:00", "a"),
    ]);
    expect(route.stops.map((stop) => stop.name)).toEqual([
      "장소 a",
      "장소 b",
      "장소 c",
      "장소 a",
      "장소 d",
    ]);
    // 12:10과 12:30 결제가 한 정거장으로 묶인다. 정거장 시각은 먼저 한 결제다.
    expect(route.stops[1]).toMatchObject({ time: "12:10", amount: 9000 });
    expect(route.stops[1].payments.map((payment) => payment.id)).toEqual([5, 4]);
    expect(route.stops[4].time).toBeNull();
    expect(route.located).toBe(6);
    expect(route.untimed).toBe(1);
  });

  test("거리와 그리는 중인 선", () => {
    // 서울시청 → 강남역은 직선으로 약 8.8km
    const km = haversineKm(
      { lat: 37.5665, lng: 126.978 },
      { lat: 37.4979, lng: 127.0276 }
    );
    expect(km).toBeGreaterThan(8.6);
    expect(km).toBeLessThan(9);
    expect(formatDistance(0.234)).toBe("230m");
    expect(formatDistance(0.001)).toBe("10m");
    expect(formatDistance(3.14)).toBe("3.1km");
    expect(formatDistance(12.6)).toBe("13km");

    const stops = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 2 },
      { lat: 2, lng: 2 },
    ];
    expect(routeDistanceKm(stops.slice(0, 1))).toBe(0);
    expect(partialRoute(stops, 0, 0)).toEqual([[0, 0]]);
    expect(partialRoute(stops, 0, 0.5)).toEqual([
      [0, 0],
      [1, 0],
    ]);
    expect(partialRoute(stops, 1, 1)).toEqual([
      [0, 0],
      [2, 0],
      [2, 2],
    ]);
    // 마지막 정거장 뒤로는 더 긋지 않는다.
    expect(partialRoute(stops, 5, 0.5)).toHaveLength(3);
  });

  test("API는 날짜를 확인하고 로그인한 사람에게만 준다", async ({ request, token }) => {
    const bad = await request.get("/api/ledger/day-route?date=2026-13-01", {
      headers: authHeaders(token),
    });
    expect(bad.status()).toBe(400);
    const anonymous = await request.get(`/api/ledger/day-route?date=${today()}`);
    expect(anonymous.status()).toBe(401);
  });
});

test("달력에서 동선 보기를 열어 시간 순서로 한 곳씩 넘겨 본다", async ({
  page,
  request,
  token,
}) => {
  // 저절로 재생하지 않게 해 한 곳씩 넘기는 것만 본다(재생은 아래 테스트).
  await page.emulateMedia({ reducedMotion: "reduce" });
  // 남긴 순서와 상관없이 시간 순서로 잇는다.
  await visit(request, token, {
    id: "4004",
    time: "19:20",
    amount: 11_000,
    memo: "국밥",
  });
  await visit(request, token, { id: "4005", time: null, amount: 2_000, memo: "물" });
  await visit(request, token, { id: "4002", time: "09:10", amount: 15_000, memo: "책" });
  await visit(request, token, {
    id: "4001",
    time: "12:30",
    amount: 9_000,
    memo: "베이글",
  });
  await visit(request, token, { id: "4001", time: "12:50", amount: 3_000, memo: "커피" });
  await visit(request, token, { id: "4003", time: "15:00", amount: 4_500, memo: "간식" });
  // 지도 링크가 없는 지출과 다른 날 지출은 동선에 안 들어간다.
  await visit(request, token, { time: "10:00", amount: 1_000, memo: "현금 간식" });
  await visit(request, token, {
    id: "4005",
    time: "08:00",
    amount: 7_000,
    memo: "다른 날",
    entryDate: otherDay(),
  });

  await openCalendar(page, token);
  const dialog = await openRoute(page);

  const order: SpotId[] = ["4002", "4001", "4003", "4004", "4005"];
  const distance = formatDistance(routeDistanceKm(order.map((id) => SPOTS[id])));
  await expect(dialog).toContainText(
    `오늘 5곳 · 총 이동 약 ${distance} · 총 지출 44,500원`
  );
  await expect(dialog).toContainText("시간을 안 적은 1건은 맨 뒤에 이었어요.");
  await expect(
    dialog.getByRole("list", { name: "들른 곳" }).getByRole("button")
  ).toHaveCount(5);

  const card = dialog.getByRole("region", { name: "지금 곳" });
  const controls = dialog.getByRole("group", { name: "동선 재생" });
  const marker = (n: number) =>
    dialog.getByRole("button", { name: `${n}번째 곳 ${SPOTS[order[n - 1]].name}` });

  await expect(card).toContainText("09:10");
  await expect(card).toContainText("동선 서점");
  await expect(card).toContainText("15,000원");
  await expect(card).toContainText("다음 동선 베이글까지");
  await expect(card.locator("img")).toHaveAttribute("src", /pstatic/);
  await expect(controls).toContainText("1 / 5");
  await expect(controls.getByRole("button", { name: "이전 곳" })).toBeDisabled();
  await expect(controls.getByRole("button", { name: "재생" })).toBeVisible();
  await expect(marker(1)).toHaveAttribute("data-state", "current");
  await expect(marker(2)).toHaveAttribute("data-state", "upcoming");

  // 다음 곳: 같은 곳에서 잇달아 한 결제는 한 정거장으로 묶는다.
  await controls.getByRole("button", { name: "다음 곳" }).click();
  await expect(controls).toContainText("2 / 5");
  await expect(card).toContainText("12:30");
  await expect(card).toContainText("동선 베이글");
  await expect(card).toContainText("12,000원");
  await expect(card).toContainText("결제 2건 · 베이글, 커피");
  await expect(marker(1)).toHaveAttribute("data-state", "visited");
  await expect(marker(2)).toHaveAttribute("data-state", "current");

  // 목록에서 골라 건너뛴다.
  await dialog
    .getByRole("list", { name: "들른 곳" })
    .getByRole("button", { name: /동선 국밥/ })
    .click();
  await expect(controls).toContainText("4 / 5");
  await expect(card).toContainText("19:20");
  await expect(marker(3)).toHaveAttribute("data-state", "visited");

  // 지도 번호를 눌러도 그곳으로 간다. 시간을 안 적은 곳은 맨 뒤다.
  await marker(5).click();
  await expect(controls).toContainText("5 / 5");
  await expect(card).toContainText("시간 없음");
  await expect(card).toContainText("동선 편의점");
  await expect(card).toContainText("마지막 곳이에요");
  await expect(controls.getByRole("button", { name: "다음 곳" })).toBeDisabled();
  await expect(
    controls.getByRole("button", { name: "처음부터 다시 보기" })
  ).toBeVisible();

  await controls.getByRole("button", { name: "이전 곳" }).click();
  await expect(controls).toContainText("4 / 5");
  await expect(marker(5)).toHaveAttribute("data-state", "upcoming");

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("재생하면 한 곳씩 끝까지 잇고, 일시정지하면 그 자리에 멈춘다", async ({
  page,
  request,
  token,
}) => {
  await visit(request, token, { id: "4002", time: "09:00", amount: 5_000, memo: "아침" });
  await visit(request, token, { id: "4004", time: "12:00", amount: 8_000, memo: "점심" });
  await visit(request, token, { id: "4001", time: "18:00", amount: 6_000, memo: "저녁" });

  await openCalendar(page, token);
  const dialog = await openRoute(page);
  const controls = dialog.getByRole("group", { name: "동선 재생" });
  const card = dialog.getByRole("region", { name: "지금 곳" });

  // 열면 저절로 재생한다. 시간은 흐른 시간으로 재므로 GPU 없이 느리게 그려도 끝까지 간다.
  await expect(controls.getByRole("button", { name: "일시정지" })).toBeVisible();
  await expect(controls).toContainText("3 / 3", { timeout: 30_000 });
  await expect(card).toContainText("동선 베이글");
  await expect(controls.getByRole("button", { name: "처음부터 다시 보기" })).toBeVisible({
    timeout: 10_000,
  });

  // 처음부터 다시 재생하다가 멈추면 그 정거장에 그대로 있다.
  await controls.getByRole("button", { name: "처음부터 다시 보기" }).click();
  await expect(controls).toContainText("1 / 3");
  await controls.getByRole("button", { name: "일시정지" }).click();
  await expect(controls.getByRole("button", { name: "재생" })).toBeVisible();
  const paused = await controls.locator("span").first().textContent();
  await page.waitForTimeout(4_000);
  await expect(controls.locator("span").first()).toHaveText(paused ?? "");

  // 다시 재생하면 이어서 끝까지 간다.
  await controls.getByRole("button", { name: "재생" }).click();
  await expect(controls).toContainText("3 / 3", { timeout: 30_000 });
});

test("지도에 찍힌 지출이 한 건이면 버튼이 없고, 같은 곳만 두 번이면 그 한 곳을 보여 준다", async ({
  page,
  request,
  token,
}) => {
  const other = otherDay();
  await visit(request, token, { id: "4003", time: "11:00", amount: 3_000, memo: "산책" });
  await visit(request, token, { time: "12:00", amount: 9_000, memo: "지도 없는 점심" });
  await visit(request, token, {
    id: "4002",
    time: "14:00",
    amount: 12_000,
    memo: "책",
    entryDate: other,
  });
  await visit(request, token, {
    id: "4002",
    time: "14:20",
    amount: 4_000,
    memo: "엽서",
    entryDate: other,
  });

  const todayRoute = page.waitForResponse(
    (res) => res.url().includes(`/api/ledger/day-route?date=${today()}`) && res.ok()
  );
  await openCalendar(page, token);
  await todayRoute;
  await expect(page.getByRole("heading", { name: dayLabel(today()) })).toBeVisible();
  await expect(page.getByRole("button", { name: "동선 보기" })).toHaveCount(0);

  await page
    .getByRole("button", {
      name: new RegExp(`^${dayLabel(other).replace(/[()]/g, "\\$&")}`),
    })
    .click();
  const dialog = await openRoute(page, other);
  await expect(dialog).toContainText("이날 1곳 · 총 지출 16,000원");
  await expect(dialog).not.toContainText("총 이동");
  await expect(dialog.getByRole("group", { name: "동선 재생" })).toHaveCount(0);
  const card = dialog.getByRole("region", { name: "지금 곳" });
  await expect(card).toContainText("동선 서점");
  await expect(card).toContainText("결제 2건 · 책, 엽서");
});

test("지도 탭에서 하루만 고르면 그날 동선을 연다", async ({ page, request, token }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await visit(request, token, { id: "4001", time: "10:00", amount: 5_000, memo: "아침" });
  await visit(request, token, { id: "4003", time: "13:00", amount: 7_000, memo: "점심" });

  await openCalendar(page, token);
  await page.getByRole("tab", { name: "지도" }).click();
  const period = page.getByRole("navigation", { name: "지도 기간" });
  await expect(period).toBeVisible();
  // 전체 기간에는 버튼이 없다.
  await expect(page.getByRole("list", { name: "다녀온 곳" })).toBeVisible();
  await expect(page.getByRole("button", { name: "동선 보기" })).toHaveCount(0);

  await period.getByRole("button", { name: "날짜" }).click();
  const popup = page.locator('[data-slot="popover-content"]');
  const day = popup.locator(`td[data-day="${today()}"]:not([data-outside])`);
  await day.getByRole("button").click();
  await day.getByRole("button").click();
  await popup.getByRole("button", { name: "적용" }).click();

  const dialog = await openRoute(page);
  await expect(dialog).toContainText("오늘 2곳");
  await expect(dialog.getByRole("region", { name: "지금 곳" })).toContainText(
    "동선 베이글"
  );
});
