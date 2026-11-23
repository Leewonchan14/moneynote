import type { APIRequestContext } from "@playwright/test";

import { toPlacePhotoUrl } from "../src/lib/ledger/naver-place";
import { FAKE_OG_IMAGE, type FakePlace, withFakeNaverPlaces } from "./fake-naver-place";
import { addEntry, authHeaders, expect, getLedger, openLedger, today } from "./helpers";

/**
 * 지출의 지도 링크와 네이버 지도 장소 사진.
 * 앱의 NAVER_PLACE_ORIGIN을 가짜 플레이스 서버로 두어 실제 네이버에 접속하지 않는다.
 * 사진 주소는 https라야 저장되므로, 화면에서는 그 주소를 가로채 가짜 사진을 돌려준다.
 */

const PASTA_ORIGINALS = [
  "https://naverbooking-phinf.pstatic.net/pasta-1.jpg",
  "https://pup-review-phinf.pstatic.net/pasta-2.jpg",
  "https://blogfiles.pstatic.net/pasta-3.jpg",
];
const PASTA = PASTA_ORIGINALS.map(toPlacePhotoUrl);
const CAFE_ORIGINALS = Array.from(
  { length: 6 },
  (_, i) => `https://pup-review-phinf.pstatic.net/cafe-${i + 1}.jpg`
);
const CAFE = CAFE_ORIGINALS.map(toPlacePhotoUrl);

const PASTA_URL = "https://map.naver.com/p/entry/place/1001";
const OG_ONLY_URL = "https://m.place.naver.com/cafe/1002/home";
const CAFE_URL = "https://map.naver.com/p/entry/place/1003";
const MISSING_URL = "https://map.naver.com/p/entry/place/9999";
const KAKAO_URL = "https://kko.to/AbCdEf";

const PLACES: Record<string, FakePlace> = {
  "1001": { title: "성수 파스타집 : 네이버\x1c", photos: PASTA_ORIGINALS },
  // 상단 사진 목록이 없으면 og:image 한 장을 쓴다.
  "1002": { title: "망원 카페 : 네이버", photos: [] },
  "1003": { title: "연남 카페 : 네이버", photos: CAFE_ORIGINALS },
};

// 1x1 PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const test = withFakeNaverPlaces(PLACES);

test.beforeEach(async ({ page }) => {
  // 장소 사진과 지도 링크는 실제 서버에 접속하지 않도록 가로챈다.
  await page
    .context()
    .route("https://search.pstatic.net/**", (route) =>
      route.fulfill({ contentType: "image/png", body: PNG })
    );
  await page
    .context()
    .route(/^https:\/\/(kko\.to|map\.naver\.com)\//, (route) =>
      route.fulfill({ contentType: "text/html", body: "<p>map</p>" })
    );
});

const addPlace = (
  request: APIRequestContext,
  token: string,
  memo: string,
  mapUrl: string,
  amount = 12_000
) => addEntry(request, token, { entryDate: today(), amount, memo, mapUrl });

const entryOf = async (request: APIRequestContext, token: string, memo: string) => {
  const entry = (await getLedger(request, token)).entries.find((e) => e.memo === memo);
  if (!entry) throw new Error(`내역 없음: ${memo}`);
  return entry;
};

test.describe("지도 링크", () => {
  test("공유 문구를 붙이면 링크만 남기고, 목록·통계에서 지도를 연다", async ({
    page,
    request,
    token,
  }) => {
    await openLedger(page, token);
    await page.getByRole("button", { name: "내역 추가" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#ledger-amount").fill("12000");
    await dialog.locator("#ledger-memo").fill("망원동 카페");

    const mapInput = dialog.locator("#ledger-map-url");
    await mapInput.fill(
      "[카카오맵] 망원 카페\n서울 마포구 망원로\nhttps://kko.to/AbCdEf"
    );
    await mapInput.blur();
    await expect(mapInput).toHaveValue(KAKAO_URL);
    await expect(dialog.getByRole("link", { name: "지도 열기" })).toHaveAttribute(
      "href",
      KAKAO_URL
    );
    // 네이버 지도가 아니면 사진 안내를 띄우지 않는다.
    await expect(dialog.getByText(/장소 사진/)).toHaveCount(0);
    await dialog.getByRole("button", { name: "저장" }).click();
    await expect(dialog).toBeHidden();

    expect(await entryOf(request, token, "망원동 카페")).toMatchObject({
      mapUrl: KAKAO_URL,
      mapPlaceName: "",
      mapImageUrls: [],
    });

    // 사진이 없으면 지도 칩만 붙고, 눌러도 수정 창은 열리지 않는다.
    const listLink = page.getByRole("link", { name: "망원동 카페 지도 열기" }).first();
    await expect(listLink).toHaveText("지도");
    await expect(listLink).toHaveAttribute("target", "_blank");
    const popupPromise = page.waitForEvent("popup");
    await listLink.click();
    const popup = await popupPromise;
    expect(popup.url()).toContain("kko.to/AbCdEf");
    await popup.close();
    await expect(dialog).toBeHidden();
    // 사진 크기 고르기는 사진이 있을 때만 보인다.
    await expect(page.getByRole("group", { name: "장소 사진 크기" })).toHaveCount(0);

    await page.getByRole("tab", { name: "통계" }).click();
    await expect(
      page.getByRole("link", { name: "망원동 카페 지도 열기" }).first()
    ).toHaveAttribute("href", KAKAO_URL);
  });

  test("입금·이체에는 지도 링크 칸이 없다", async ({ page, token }) => {
    await openLedger(page, token);
    await page.getByRole("button", { name: "내역 추가" }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator("#ledger-map-url")).toBeVisible();
    await dialog.getByRole("button", { name: "입금", exact: true }).click();
    await expect(dialog.locator("#ledger-map-url")).toBeHidden();
    await dialog.getByRole("button", { name: "이체", exact: true }).click();
    await expect(dialog.locator("#ledger-map-url")).toBeHidden();
  });

  test("검증하고, 보내지 않은 수정은 링크·사진을 그대로 둔다", async ({
    request,
    token,
  }) => {
    const bad = await request.post("/api/ledger/entries", {
      headers: authHeaders(token),
      data: {
        entryDate: today(),
        kind: "expense",
        amount: 5_000,
        memo: "이상한 링크",
        mapUrl: "javascript:alert(1)",
      },
    });
    expect(bad.status()).toBe(400);

    const id = await addPlace(request, token, "성수동 파스타", PASTA_URL);
    const patch = (data: Record<string, unknown>) =>
      request.patch("/api/ledger/entries", {
        headers: authHeaders(token),
        data: {
          id,
          entryDate: today(),
          kind: "expense",
          amount: 13_000,
          memo: "성수동 파스타",
          ...data,
        },
      });

    // 영상은 빼고 사진 3장을 줄인 크기 주소로 저장한다. 제목 끝 제어 문자도 지운다.
    expect(await entryOf(request, token, "성수동 파스타")).toMatchObject({
      mapUrl: PASTA_URL,
      mapPlaceName: "성수 파스타집",
      mapImageUrls: PASTA,
    });

    expect((await patch({})).ok()).toBe(true);
    expect(await entryOf(request, token, "성수동 파스타")).toMatchObject({
      mapUrl: PASTA_URL,
      mapImageUrls: PASTA,
    });

    // 입금으로 바꾸면 지도 링크도 지운다.
    expect((await patch({ kind: "income" })).ok()).toBe(true);
    expect(await entryOf(request, token, "성수동 파스타")).toMatchObject({
      mapUrl: "",
      mapPlaceName: "",
      mapImageUrls: [],
    });

    // 사진 목록이 없는 장소는 og:image 한 장, 못 찾은 장소는 사진 없이 둔다.
    await addPlace(request, token, "망원 카페", OG_ONLY_URL);
    await addPlace(request, token, "없는 장소", MISSING_URL);
    expect(await entryOf(request, token, "망원 카페")).toMatchObject({
      mapPlaceName: "망원 카페",
      mapImageUrls: [FAKE_OG_IMAGE],
    });
    expect(await entryOf(request, token, "없는 장소")).toMatchObject({
      mapUrl: MISSING_URL,
      mapPlaceName: "",
      mapImageUrls: [],
    });
  });
});

test.describe("장소 사진", () => {
  test("내역 추가 창에서 네이버 지도 링크를 넣으면 저장 전에 장소 사진을 미리 본다", async ({
    page,
    request,
    token,
  }) => {
    await openLedger(page, token);
    await page.getByRole("button", { name: "내역 추가" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#ledger-amount").fill("32000");
    await dialog.locator("#ledger-memo").fill("파스타 점심");
    const mapInput = dialog.locator("#ledger-map-url");

    // 못 찾는 장소는 안내만 한다.
    await mapInput.fill(MISSING_URL);
    await expect(
      dialog.getByText(
        "네이버 지도에서 장소 사진을 찾지 못했어요. 저장하면 한 번 더 불러와요."
      )
    ).toBeVisible();

    // 공유 문구를 붙이면 링크만 남기고, 그 장소 사진을 바로 넘겨 본다.
    await mapInput.fill(`[네이버 지도]\n성수 파스타집\n${PASTA_URL}`);
    await mapInput.blur();
    await expect(mapInput).toHaveValue(PASTA_URL);
    const carousel = dialog.getByRole("region", { name: "성수 파스타집 사진 3장" });
    await expect(carousel.getByRole("img")).toHaveCount(3);
    await expect(
      carousel.getByRole("img", { name: "성수 파스타집 사진 1" })
    ).toHaveAttribute("src", PASTA[0]);
    await carousel.getByRole("button", { name: "다음 사진" }).click();
    await expect(carousel.getByText("2 / 3")).toBeVisible();
    await expect(
      dialog.getByRole("link", { name: "성수 파스타집 지도 열기" })
    ).toHaveAttribute("href", PASTA_URL);

    await dialog.getByRole("button", { name: "저장" }).click();
    await expect(dialog).toBeHidden();
    expect(await entryOf(request, token, "파스타 점심")).toMatchObject({
      mapUrl: PASTA_URL,
      mapPlaceName: "성수 파스타집",
      mapImageUrls: PASTA,
    });
  });

  test("미리보기 API는 로그인과 네이버 지도 링크가 필요하다", async ({
    request,
    token,
  }) => {
    const preview = (url: string, headers = authHeaders(token)) =>
      request.get(`/api/ledger/map-place?url=${encodeURIComponent(url)}`, { headers });
    expect((await preview(PASTA_URL, {})).status()).toBe(401);
    expect((await preview("https://evil.example/place/1")).status()).toBe(400);
    expect(await (await preview(PASTA_URL)).json()).toEqual({
      place: { placeName: "성수 파스타집", imageUrls: PASTA },
    });
    expect(await (await preview(MISSING_URL)).json()).toEqual({ place: null });
  });

  test("내역에서 장소 사진을 보고, 크게 넘겨 보고, 수정 화면에서도 본다", async ({
    page,
    request,
    token,
  }) => {
    await addPlace(request, token, "성수동 파스타", PASTA_URL);
    await openLedger(page, token);

    const row = page.getByRole("button", { name: /성수동 파스타/ }).first();
    // 아이콘 자리에 대표 사진을 보여 준다.
    await expect(row.locator('[data-slot="entry-photo"] img')).toHaveAttribute(
      "src",
      PASTA[0]
    );
    const mapChip = page.getByRole("link", { name: "성수동 파스타 지도 열기" }).first();
    await expect(mapChip).toHaveText("성수 파스타집");
    await expect(mapChip).toHaveAttribute("href", PASTA_URL);
    const thumbs = page.getByRole("button", {
      name: /^성수 파스타집 사진 \d 크게 보기$/,
    });
    await expect(thumbs).toHaveCount(3);
    await expect
      .poll(() =>
        thumbs
          .first()
          .locator("img")
          .evaluate((img: HTMLImageElement) => img.naturalWidth)
      )
      .toBeGreaterThan(0);

    // 사진을 누르면 크게 보고 넘긴다. 크게 볼 때는 1200×800 주소를 쓴다.
    await page.getByRole("button", { name: "성수 파스타집 사진 2 크게 보기" }).click();
    const viewer = page.getByRole("dialog", { name: "성수 파스타집 사진 크게 보기" });
    await expect(viewer.getByText("2 / 3")).toBeVisible();
    await expect(
      viewer.getByRole("img", { name: "성수 파스타집 사진 2" })
    ).toHaveAttribute("src", PASTA[1].replace("f640_380", "f1200_800"));
    await viewer.getByRole("button", { name: "다음 사진" }).click();
    await expect(viewer.getByText("3 / 3")).toBeVisible();
    await page.keyboard.press("ArrowLeft");
    await expect(viewer.getByText("2 / 3")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(viewer).toBeHidden();

    // 수정 화면에서는 사진을 넘겨 본다.
    await row.click();
    const dialog = page.getByRole("dialog", { name: "내역 수정" });
    const carousel = dialog.getByRole("region", { name: "성수 파스타집 사진 3장" });
    await expect(carousel.getByRole("img")).toHaveCount(3);
    await carousel.getByRole("button", { name: "다음 사진" }).click();
    await expect(carousel.getByText("2 / 3")).toBeVisible();
    await expect(
      dialog.getByRole("link", { name: "성수 파스타집 지도 열기" })
    ).toHaveAttribute("href", PASTA_URL);

    // 링크를 다른 장소로 바꾸면 저장 전에 새 장소를 미리 보고, 저장하면 그 장소로 바뀐다.
    await dialog.locator("#ledger-map-url").fill(OG_ONLY_URL);
    await expect(carousel).toBeHidden();
    await expect(
      dialog.getByRole("link", { name: "망원 카페 지도 열기" })
    ).toHaveAttribute("href", OG_ONLY_URL);
    await expect(dialog.getByRole("img", { name: "망원 카페 사진" })).toHaveAttribute(
      "src",
      FAKE_OG_IMAGE
    );
    await dialog.getByRole("button", { name: "저장" }).click();
    await expect(dialog).toBeHidden();
    expect(await entryOf(request, token, "성수동 파스타")).toMatchObject({
      mapPlaceName: "망원 카페",
      mapImageUrls: [FAKE_OG_IMAGE],
    });
  });

  test("사진 작게·크게를 고르고 새로고침해도 기억한다", async ({
    page,
    request,
    token,
  }) => {
    await addPlace(request, token, "연남 카페", CAFE_URL);
    await openLedger(page, token);
    const photos = page.getByRole("button", { name: /^연남 카페 사진 \d 크게 보기$/ });

    // 기본은 작은 사진 4장 + "+2"
    await expect(photos).toHaveCount(4);
    expect(Math.round((await photos.first().boundingBox())!.height)).toBe(32);
    await expect(
      page.getByRole("button", { name: "연남 카페 사진 2장 더 보기" })
    ).toHaveText("+2");

    const sizes = page.getByRole("group", { name: "장소 사진 크기" });
    await sizes.getByRole("button", { name: "사진 크게" }).click();
    const wide = (page.viewportSize()?.width ?? 0) >= 640;
    if (wide) {
      // 큰 사진 3장 + 나머지를 묶은 "+3" 칸
      await expect(photos.filter({ visible: true })).toHaveCount(3);
      expect(Math.round((await photos.first().boundingBox())!.height)).toBe(96);
      await expect(
        page.getByRole("button", { name: "연남 카페 사진 3장 더 보기" })
      ).toHaveText("+3");
    } else {
      // 좁은 화면은 모든 사진을 가로로 밀어 본다.
      await expect(photos).toHaveCount(6);
    }

    await page.reload();
    await expect(
      page
        .getByRole("group", { name: "장소 사진 크기" })
        .getByRole("button", { name: "사진 크게" })
    ).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("달력 사진", () => {
  test("그날 간 곳 사진을 폴라로이드로 붙이고, 마우스를 올리면 미리 본다", async ({
    page,
    request,
    token,
    isMobile,
  }) => {
    // 금액이 큰 내역의 장소가 앞(대표 사진)에 온다. 사진 없는 장소는 세지 않는다.
    await addPlace(request, token, "성수동 파스타", PASTA_URL, 12_000);
    await addPlace(request, token, "연남 카페", CAFE_URL, 33_000);
    await addPlace(request, token, "카카오 카페", KAKAO_URL, 50_000);

    await openLedger(page, token);
    await page.getByRole("tab", { name: "달력" }).click();
    const cell = page.getByRole("button", { name: /, 간 곳 연남 카페, 성수 파스타집$/ });
    await expect(cell).toBeVisible();
    const polaroids = cell.locator("[data-slot=calendar-polaroid]");
    await expect(polaroids).toHaveCount(2);
    // 앞에 붙은(나중에 그린) 폴라로이드가 대표 사진이다.
    await expect(polaroids.last().locator("img")).toHaveAttribute("src", CAFE[0]);
    await expect(polaroids.first().locator("img")).toHaveAttribute("src", PASTA[0]);

    // 폴라로이드는 금액 글씨와 겹치지 않고 칸 밖으로 나가지 않는다.
    const amount = await cell.getByText(/^-\d/).evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const { x, y, width, height } = range.getBoundingClientRect();
      return { x, y, width, height };
    });
    const sticker = (await polaroids.last().boundingBox())!;
    const cellBox = (await cell.boundingBox())!;
    const overlaps =
      sticker.x < amount.x + amount.width &&
      amount.x < sticker.x + sticker.width &&
      sticker.y < amount.y + amount.height &&
      amount.y < sticker.y + sticker.height;
    expect(overlaps).toBe(false);
    expect(sticker.x + sticker.width).toBeLessThanOrEqual(cellBox.x + cellBox.width + 2);

    const preview = page.getByLabel(/ 간 곳$/);
    if (isMobile) {
      // 터치 화면은 미리보기 대신, 날짜를 누르면 아래 내역의 장소 사진으로 본다.
      await cell.tap();
      await expect(cell).toHaveAttribute("aria-pressed", "true");
      await expect(preview).toBeHidden();
      await expect(
        page.getByRole("link", { name: "연남 카페 지도 열기" }).first()
      ).toBeVisible();
    } else {
      await cell.hover();
      await expect(preview).toBeVisible();
      await expect(preview).toContainText("장소 2곳");
      // 장소마다 사진 3장까지
      await expect(preview.getByRole("img")).toHaveCount(6);
      await expect(
        preview.getByRole("img", { name: "연남 카페 사진 1" })
      ).toHaveAttribute("src", CAFE[0]);
      await page.mouse.move(0, 0);
      await expect(preview).toBeHidden();
    }
  });
});
