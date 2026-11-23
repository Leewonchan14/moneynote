import type { APIRequestContext, Page } from "@playwright/test";

import { kst } from "../src/lib/kst";
import { failingPlaces, type FakePlace, withFakeNaverPlaces } from "./fake-naver-place";
import {
  addEntry,
  authHeaders,
  createItem,
  daysAgo,
  expect,
  getCategories,
  openLedger,
  today,
} from "./helpers";

/**
 * 지도 탭(내역 지도). 앱의 NAVER_PLACE_ORIGIN을 가짜 플레이스 서버로 두고,
 * 장소 페이지의 `__APOLLO_STATE__`에 좌표·주소·업종(PlaceDetailBase)을 넣어 돌려준다.
 * 지도 타일은 바깥 네트워크 없이 돌도록 빈 스타일로 바꿔 준다.
 */

const PLACES: Record<string, FakePlace> = {
  "2001": {
    title: "성수 파스타집 : 네이버",
    photos: [
      "https://naverbooking-phinf.pstatic.net/pasta-1.jpg",
      "https://pup-review-phinf.pstatic.net/pasta-2.jpg",
    ],
    detail: {
      lat: "37.5446",
      lng: "127.0557",
      roadAddress: "서울 성동구 연무장길 1",
      category: "이탈리아음식",
    },
  },
  "2002": {
    title: "망원 카페 : 네이버",
    photos: [],
    detail: {
      lat: "37.5559",
      lng: "126.9019",
      roadAddress: "서울 마포구 포은로 2",
      category: "카페,디저트",
    },
  },
  "3001": {
    title: "신림 중식당 : 네이버",
    photos: [],
    detail: {
      lat: "37.4876",
      lng: "126.9283",
      roadAddress: "서울 관악구 신림동길 4",
      category: "중식당",
    },
  },
  // 좌표 없이 이름만 있는 장소. 좌표를 못 읽은 링크로 남는다.
  "3002": { title: "샤로수길 사진관 : 네이버", photos: [] },
};

const placeUrl = (id: string) => `https://map.naver.com/p/entry/place/${id}`;

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
  failingPlaces.clear();
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

const addPlace = (
  request: APIRequestContext,
  token: string,
  data: {
    memo: string;
    amount: number;
    mapUrl?: string;
    entryDate?: string;
    categoryId?: number;
    subcategoryId?: number;
  }
) => addEntry(request, token, { entryDate: today(), ...data });

const openMap = async (page: Page, token: string) => {
  await openLedger(page, token);
  await page.getByRole("tab", { name: "지도" }).click();
};

const placeList = (page: Page) => page.getByRole("list", { name: "다녀온 곳" });
const periodNav = (page: Page) => page.getByRole("navigation", { name: "지도 기간" });

test("네이버 지도 링크가 있는 지출을 장소별로 묶어 지도와 목록으로 본다", async ({
  page,
  request,
  token,
}) => {
  const lastYear = kst().subtract(1, "year").format("YYYY-MM-DD");
  await addPlace(request, token, {
    memo: "파스타 점심",
    amount: 12_000,
    mapUrl: placeUrl("2001"),
  });
  // 같은 장소의 다른 링크 모양도 같은 곳으로 묶는다. 같은 날 두 번 결제해도 한 번 간 것이다.
  await addPlace(request, token, {
    memo: "파스타 저녁",
    amount: 18_000,
    mapUrl: "https://m.place.naver.com/restaurant/2001/home",
  });
  await addPlace(request, token, {
    memo: "작년 파스타",
    amount: 7_000,
    mapUrl: placeUrl("2001"),
    entryDate: lastYear,
  });
  await addPlace(request, token, {
    memo: "작년 망원 카페",
    amount: 5_500,
    mapUrl: placeUrl("2002"),
    entryDate: lastYear,
  });
  // 지도 링크가 없는 지출은 지도에 찍지 않는다.
  await addPlace(request, token, { memo: "편의점", amount: 3_000 });

  await openMap(page, token);
  await expect(page.getByText("다녀온 곳 2곳 · 3번 · 42,500원")).toBeVisible();
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  // worker가 떠야 스타일을 다 읽는다. 번들 뒤 worker 주소가 틀리면 지도가 빈 채로 남는다.
  await expect(page.locator("[data-map-ready]")).toBeVisible();
  // 지도 탭은 기간을 따로 고르므로 위쪽 월 요약은 숨긴다.
  await expect(page.getByTestId("summary-expense")).toBeHidden();

  const items = placeList(page).getByRole("button");
  await expect(items).toHaveCount(2);
  // 많이 간 곳이 먼저
  await expect(items.first()).toContainText("성수 파스타집");
  await expect(items.first()).toContainText("2번");
  await expect(items.first()).toContainText("37,000원");
  await expect(items.nth(1)).toContainText("망원 카페");

  await items.first().click();
  const detail = page.getByRole("region", { name: "성수 파스타집 방문 기록" });
  await expect(detail).toBeVisible();
  await expect(detail.getByText("2번 방문 · 37,000원")).toBeVisible();
  await expect(detail.getByText("이탈리아음식 · 서울 성동구 연무장길 1")).toBeVisible();
  // 간 날마다 한 줄. 같은 날 결제는 합계를 보이고, 그 아래에 먼저 한 것부터 하나씩 보여 준다.
  const days = detail.getByRole("list", { name: "간 날" }).locator(":scope > li");
  await expect(days).toHaveCount(2);
  await expect(days.first()).toContainText("결제 2건");
  await expect(days.first()).toContainText("30,000원");
  const payments = days
    .first()
    .getByRole("list", { name: /결제$/ })
    .getByRole("listitem");
  await expect(payments).toHaveCount(2);
  await expect(payments.first()).toContainText("파스타 점심");
  await expect(payments.nth(1)).toContainText("파스타 저녁");
  await expect(days.nth(1)).toContainText("작년 파스타");
  await expect(days.nth(1).getByRole("list")).toHaveCount(0);
  // 장소 사진은 내역 수정 화면과 같은 캐러셀로 넘겨 본다.
  const photos = detail.getByRole("region", { name: "성수 파스타집 사진 2장" });
  await expect(photos.getByRole("img")).toHaveCount(2);
  await expect(
    detail.getByRole("link", { name: "네이버 지도에서 열기" })
  ).toHaveAttribute("href", placeUrl("2001"));
  // 고른 장소는 주소에 남아, 새로고침해도 지도 탭에서 같은 장소가 열린다.
  await expect(page).toHaveURL(/[?&]place=2001(&|$)/);
  await page.reload();
  await expect(page.getByRole("tab", { name: "지도" })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect(detail).toBeVisible();

  // 넓은 화면에서는 목록을 내려도 고른 장소가 위에 붙어 있다.
  if (test.info().project.name === "desktop") {
    const viewport = page.viewportSize();
    await page.setViewportSize({ width: 1280, height: 480 });
    await items.nth(1).scrollIntoViewIfNeeded();
    await items.nth(1).click({ trial: true });
    const stuck = await detail.boundingBox();
    expect(stuck!.y).toBeGreaterThanOrEqual(0);
    expect(stuck!.y).toBeLessThanOrEqual(24);
    if (viewport) await page.setViewportSize(viewport);
  }

  // 고른 장소는 닫기 버튼, 같은 장소 다시 누르기, Esc로 선택을 푼다.
  await detail.getByRole("button", { name: "선택 해제" }).click();
  await expect(detail).toBeHidden();
  await expect(page).not.toHaveURL(/place=/);
  await items.first().click();
  await expect(detail).toBeVisible();
  await items.first().click();
  await expect(detail).toBeHidden();
  await expect(items.first()).not.toHaveAttribute("aria-current");
  await items.first().click();
  await expect(detail).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(detail).toBeHidden();
  await expect(page).not.toHaveURL(/place=/);

  // 기간을 바꾸거나 다른 탭으로 가면 고른 장소를 주소에서도 지운다.
  await items.first().click();
  await expect(page).toHaveURL(/place=2001/);
  await periodNav(page).getByRole("button", { name: "이번 달" }).click();
  await expect(detail).toBeHidden();
  await expect(page).not.toHaveURL(/place=/);
  await periodNav(page).getByRole("button", { name: "전체" }).click();
  await items.first().click();
  await page.getByRole("tab", { name: "내역" }).click();
  await expect(page).not.toHaveURL(/place=/);
  await page.getByRole("tab", { name: "지도" }).click();
  await expect(detail).toBeHidden();

  // 올해만 보면 작년에 간 곳은 빠진다.
  await periodNav(page).getByRole("button", { name: "올해" }).click();
  await expect(items).toHaveCount(1);
  await expect(page.getByText("다녀온 곳 1곳 · 1번 · 30,000원")).toBeVisible();
  await periodNav(page).getByRole("button", { name: "전체" }).click();
  await expect(items).toHaveCount(2);
});

test("좌표를 못 읽은 네이버 지도 링크는 다시 찾기로 지도에 찍는다", async ({
  page,
  request,
  token,
}) => {
  failingPlaces.add("3001");
  await addPlace(request, token, {
    memo: "중식",
    amount: 32_000,
    mapUrl: placeUrl("3001"),
  });
  // 좌표 없이 이름만 읽힌 장소도 다시 찾기 대상이다.
  await addPlace(request, token, {
    memo: "사진관",
    amount: 20_000,
    mapUrl: placeUrl("3002"),
  });
  // 네이버가 아닌 지도 링크는 좌표를 읽을 수 없으니 세지 않는다.
  await addPlace(request, token, {
    memo: "카카오 링크",
    amount: 9_000,
    mapUrl: "https://kko.to/AbCdEf",
  });

  await openMap(page, token);
  await expect(page.getByText("아직 지도에 찍힌 곳이 없어요")).toBeVisible();
  const banner = page.getByRole("status").filter({ hasText: "지도에 못 찍은 곳" });
  await expect(banner).toContainText("지도에 못 찍은 곳 2건");

  failingPlaces.clear();
  await banner.getByRole("button", { name: "다시 찾기" }).click();
  await expect(page.getByText("1곳을 지도에 찍었어요.")).toBeVisible();
  await expect(page.getByText("아직 1건이 남았어요.")).toBeVisible();
  await expect(banner).toContainText("지도에 못 찍은 곳 1건");
  await expect(placeList(page).getByRole("button")).toHaveCount(1);
  await expect(placeList(page)).toContainText("신림 중식당");
});

const popup = (page: Page) => page.locator('[data-slot="popover-content"]');

/** 열린 달력에서 iso 날짜가 보일 때까지 달을 넘긴 뒤 누른다. */
const clickDay = async (page: Page, iso: string) => {
  for (let step = 0; step < 24; step += 1) {
    const cell = popup(page).locator(`td[data-day="${iso}"]:not([data-outside])`);
    if (await cell.count()) {
      await cell.getByRole("button").click();
      return;
    }
    const shown = await popup(page)
      .locator("td[data-day]:not([data-outside])")
      .first()
      .getAttribute("data-day");
    await popup(page)
      .locator(shown && shown > iso ? ".rdp-button_previous" : ".rdp-button_next")
      .click();
  }
  throw new Error(`달력에서 ${iso}를 찾지 못했어요`);
};

test("날짜를 직접 고르거나 여행을 골라 그때 간 곳만 지도에 본다", async ({
  page,
  request,
  token,
}) => {
  await createItem(request, token, "/api/ledger/trips", {
    name: "성수 나들이",
    startDate: daysAgo(10),
    endDate: daysAgo(8),
  });
  // 여행 기간의 지출은 저장할 때 그 여행에 묶인다.
  await addPlace(request, token, {
    memo: "여행 파스타",
    amount: 21_000,
    mapUrl: placeUrl("2001"),
    entryDate: daysAgo(9),
  });
  await addPlace(request, token, {
    memo: "한 달 전 카페",
    amount: 6_000,
    mapUrl: placeUrl("2002"),
    entryDate: daysAgo(30),
  });
  await addPlace(request, token, {
    memo: "오늘 중식",
    amount: 30_000,
    mapUrl: placeUrl("3001"),
  });

  await openMap(page, token);
  const items = placeList(page).getByRole("button");
  await expect(items).toHaveCount(3);

  // 달력에서 오늘 하루만 고른다. "적용"을 눌러야 바뀐다.
  await periodNav(page).getByRole("button", { name: "날짜" }).click();
  await clickDay(page, today());
  await clickDay(page, today());
  await popup(page).getByRole("button", { name: "적용" }).click();
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText("신림 중식당");
  await expect(
    periodNav(page).getByRole("button", { pressed: true, name: /\d/ })
  ).toBeVisible();

  // 여행을 고르면 그 여행에 묶인 지출만 본다.
  await periodNav(page).getByRole("button", { name: "여행" }).click();
  await popup(page)
    .getByRole("button", { name: /성수 나들이/ })
    .click();
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText("성수 파스타집");
  await expect(
    page.getByText(/^성수 나들이 · .* · 다녀온 곳 1곳 · 1번 · 21,000원$/)
  ).toBeVisible();
  await expect(
    periodNav(page).getByRole("button", { name: /성수 나들이/ })
  ).toHaveAttribute("aria-pressed", "true");

  await periodNav(page).getByRole("button", { name: "전체" }).click();
  await expect(items).toHaveCount(3);
});

test("기간 값이 잘못되면 400으로 알린다", async ({ request, token }) => {
  const get = (query: string) =>
    request.get(`/api/ledger/map?${query}`, { headers: authHeaders(token) });
  expect((await get("range=custom")).status()).toBe(400);
  expect((await get("range=custom&from=2026-02-30")).status()).toBe(400);
  expect((await get("range=trip&trip=999")).status()).toBe(400);
  // 거꾸로 고른 날짜는 앞뒤를 바꿔 준다.
  const swapped = await get(`range=custom&from=${today()}&to=${daysAgo(3)}`);
  expect(await swapped.json()).toMatchObject({ from: daysAgo(3), to: today() });
});

test("탭 위 분류·소분류 필터로 그 분류 지출로 간 곳만 본다", async ({
  page,
  request,
  token,
}) => {
  const categoryId = await getCategories(request, token);
  const food = categoryId("식비");
  const lunch = await createItem(request, token, "/api/ledger/subcategories", {
    categoryId: food,
    name: "점심",
  });
  await addPlace(request, token, {
    memo: "파스타",
    amount: 18_000,
    mapUrl: placeUrl("2001"),
    categoryId: food,
    subcategoryId: lunch,
  });
  await addPlace(request, token, {
    memo: "중식 저녁",
    amount: 30_000,
    mapUrl: placeUrl("3001"),
    categoryId: food,
  });
  await addPlace(request, token, {
    memo: "라테",
    amount: 5_500,
    mapUrl: placeUrl("2002"),
    categoryId: categoryId("카페"),
  });

  await openMap(page, token);
  const items = placeList(page).getByRole("button");
  await expect(items).toHaveCount(3);

  await page
    .getByRole("group", { name: "분류 필터" })
    .getByRole("button", { name: "식비" })
    .click();
  await expect(items).toHaveCount(2);
  await expect(placeList(page)).not.toContainText("망원 카페");
  await expect(page.getByText("식비 · 다녀온 곳 2곳 · 2번 · 48,000원")).toBeVisible();

  await page
    .getByRole("group", { name: "소분류 필터" })
    .getByRole("button", { name: "점심" })
    .click();
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText("성수 파스타집");

  // 소분류 없는 지출만
  await page
    .getByRole("group", { name: "소분류 필터" })
    .getByRole("button", { name: /없음/ })
    .click();
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText("신림 중식당");

  // 내역 탭으로 갔다 와도 분류 필터는 그대로다.
  await page.getByRole("tab", { name: "내역" }).click();
  await page.getByRole("tab", { name: "지도" }).click();
  await expect(items).toHaveCount(1);
});

test("간 날이 많으면 장소 카드 안의 간 날 목록만 스크롤한다", async ({
  page,
  request,
  token,
}) => {
  for (let day = 1; day <= 16; day += 1) {
    await addPlace(request, token, {
      memo: `파스타 ${day}`,
      amount: 10_000 + day,
      mapUrl: placeUrl("2001"),
      entryDate: daysAgo(day),
    });
  }

  await openMap(page, token);
  await placeList(page).getByRole("button").first().click();
  const detail = page.getByRole("region", { name: "성수 파스타집 방문 기록" });
  await expect(detail.getByText("16번 방문")).toBeVisible();
  // 흰 바탕 사진도 카드 본문과 구분되게 사진 아래에 경계선이 있다.
  const photoFrame = detail.getByRole("region", { name: /사진 \d+장/ }).locator("..");
  await expect(photoFrame).toHaveCSS("border-bottom-style", "solid");
  const days = detail.getByRole("list", { name: "간 날" });
  const { scrollHeight, clientHeight } = await days.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  expect(scrollHeight).toBeGreaterThan(clientHeight);
  // 목록을 끝까지 내리면 가장 오래된 날이 보이고, 지도 링크는 카드 안에 그대로 있다.
  await days.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
  await expect
    .poll(async () => {
      const box = await days.boundingBox();
      const last = await days.getByText("파스타 16").boundingBox();
      return Boolean(
        box && last && last.y >= box.y && last.y + last.height <= box.y + box.height + 1
      );
    })
    .toBe(true);
  await expect(detail.getByRole("link", { name: "네이버 지도에서 열기" })).toBeVisible();
});
