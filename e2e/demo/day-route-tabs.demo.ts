import type { BrowserContext } from "@playwright/test";

import { kst } from "../../src/lib/kst";
import { withFakeNaverPlaces } from "../fake-naver-place";
import { addEntry, getCategories, openLedger, today } from "../helpers";
import { pause, scrollToTarget, showTaps, startRecording } from "./recorder";

/*
 * 그날의 동선을 내역·통계 탭에서 여는 데모. 장소·사진·내역은 모두 가짜다.
 * 네이버 플레이스는 가짜 서버로, 사진 주소는 가로채서 색 그림(SVG)으로 돌려준다.
 */

const SCENES = {
  bakery: { hue: 36, label: "빵집" },
  books: { hue: 200, label: "서점" },
  noodle: { hue: 12, label: "국수" },
  cafe: { hue: 28, label: "카페" },
  pub: { hue: 280, label: "펍" },
} as const;
type Scene = keyof typeof SCENES;

const place = (
  title: string,
  scene: Scene,
  lat: string,
  lng: string,
  category: string
) => ({
  title: `${title} : 네이버`,
  photos: [1, 2].map(
    (n) => `https://pup-review-phinf.pstatic.net/sample/${scene}-${n}.jpg`
  ),
  detail: { lat, lng, roadAddress: "서울 샘플구 샘플길 1", category },
});

const test = withFakeNaverPlaces({
  "5001": place("샘플 베이커리", "bakery", "37.5796", "126.9700", "베이커리"),
  "5002": place("샘플 서점", "books", "37.5759", "126.9850", "서점"),
  "5003": place("샘플 국숫집", "noodle", "37.5705", "126.9996", "국수"),
  "5004": place("샘플 카페", "cafe", "37.5446", "127.0557", "카페,디저트"),
  "5005": place("샘플 펍", "pub", "37.5340", "126.9946", "술집"),
});

const sampleSvg = (url: string) => {
  const src = decodeURIComponent(new URL(url).searchParams.get("src") ?? "");
  const [, scene = "cafe", n = "1"] = src.match(/\/(\w+)-(\d+)\.jpg$/) ?? [];
  const { hue, label } = SCENES[scene as Scene] ?? SCENES.cafe;
  const h = hue + Number(n) * 9;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="380" height="380" viewBox="0 0 380 380">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${h} 70% 78%)"/><stop offset="1" stop-color="hsl(${h + 30} 60% 52%)"/>
    </linearGradient></defs>
    <rect width="380" height="380" fill="url(#g)"/>
    <text x="190" y="320" text-anchor="middle" font-family="Noto Sans CJK KR, sans-serif" font-size="56" font-weight="700" fill="white">${label}</text>
  </svg>`;
};

const routeSamples = (context: BrowserContext) =>
  context.route("https://search.pstatic.net/**", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: sampleSvg(route.request().url()),
    })
  );

const placeUrl = (id: string) => `https://map.naver.com/p/entry/place/${id}`;

test("그날의 동선: 내역·통계 탭에서도 연다", async ({ page, request, token }) => {
  test.setTimeout(240_000);
  // 샘플 데이터만 쓴다. 저장소가 public이라 실제 내역은 화면에 나오면 안 된다.
  const category = await getCategories(request, token);
  const yesterday = kst(today()).subtract(1, "day").format("YYYY-MM-DD");
  const seed: [string, string | null, number, string, string, string | null][] = [
    [today(), "08:40", 6_500, "소금빵", "식비", "5001"],
    [today(), "10:30", 18_000, "책 한 권", "문화", "5002"],
    [today(), "12:20", 9_000, "칼국수", "식비", "5003"],
    [today(), "15:10", 6_000, "라테", "카페", "5004"],
    [today(), "19:30", 24_000, "저녁", "식비", "5005"],
    [yesterday, "11:00", 5_500, "아메리카노", "카페", "5004"],
    [yesterday, "18:00", 12_000, "잔치국수", "식비", "5003"],
    [yesterday, "13:00", 1_400, "지하철", "교통", null],
  ];
  for (const [entryDate, entryTime, amount, memo, name, id] of seed) {
    await addEntry(request, token, {
      entryDate,
      entryTime,
      amount,
      memo,
      categoryId: category(name),
      mapUrl: id ? placeUrl(id) : undefined,
    });
  }

  await routeSamples(page.context());
  await showTaps(page);
  await openLedger(page, token);
  const recording = await startRecording(page);
  await pause(page, 1200);

  const dialog = page.getByRole("dialog", { name: /동선$/ });
  const closeDialog = async () => {
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await pause(page, 900);
  };

  // 1) 내역 탭: 동선을 볼 수 있는 날의 날짜 옆에 "동선 보기"가 붙는다.
  const yesterdayButton = page
    .locator("section")
    .filter({
      has: page.getByRole("heading", {
        name: kst(yesterday).format("M월 D일 (ddd)"),
        exact: true,
      }),
    })
    .getByRole("button", { name: "동선 보기" });
  await scrollToTarget(yesterdayButton, { offset: 220, duration: 1200 });
  await pause(page, 1500);
  await yesterdayButton.tap();
  await dialog.locator("[data-map-ready]").waitFor();
  await pause(page, 6000);
  await closeDialog();

  // 2) 통계 탭: 많이 돌아다닌 날 순서로 보여 주고 바로 연다.
  await page.evaluate(() => window.scrollTo({ top: 0 }));
  await page.getByRole("tab", { name: "통계" }).tap();
  await pause(page, 1500);
  const list = page.getByRole("list", { name: "많이 돌아다닌 날" });
  await scrollToTarget(list, { offset: 260, duration: 1600 });
  await pause(page, 2200);
  await list.getByRole("listitem").first().getByRole("button", { name: "동선 보기" }).tap();
  await dialog.locator("[data-map-ready]").waitFor();
  await dialog
    .getByRole("group", { name: "동선 재생" })
    .getByRole("button", { name: "처음부터 다시 보기" })
    .waitFor({ timeout: 60_000 });
  await pause(page, 2000);

  console.log(await recording.stop("day-route-tabs"));
});
