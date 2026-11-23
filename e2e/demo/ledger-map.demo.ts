import { devices, type BrowserContext } from "@playwright/test";
import path from "node:path";

import { kst } from "../../src/lib/kst";
import { withFakeNaverPlaces } from "../fake-naver-place";
import { addEntry, daysAgo, getCategories, openLedger } from "../helpers";
import {
  DEMO_OUTPUT_DIR,
  pause,
  scrollToTarget,
  showTaps,
  startRecording,
} from "./recorder";

/*
 * 지도 탭(내역 지도) 데모. 장소·사진·내역은 모두 가짜다.
 * 네이버 플레이스는 가짜 서버로, 사진 주소는 가로채서 색 그림(SVG)으로 돌려준다.
 * 배경 지도만 실제 OpenFreeMap 타일을 쓴다.
 */

const SCENES = {
  pasta: { hue: 18, label: "파스타" },
  cafe: { hue: 30, label: "카페" },
  park: { hue: 140, label: "공원" },
  gallery: { hue: 260, label: "전시" },
  bakery: { hue: 42, label: "빵집" },
} as const;
type Scene = keyof typeof SCENES;

const originals = (scene: Scene, count: number) =>
  Array.from(
    { length: count },
    (_, i) => `https://pup-review-phinf.pstatic.net/sample/${scene}-${i + 1}.jpg`
  );

const detail = (lat: string, lng: string, roadAddress: string, category: string) => ({
  lat,
  lng,
  roadAddress,
  category,
});

const test = withFakeNaverPlaces({
  "2001": {
    title: "샘플 파스타 : 네이버",
    photos: originals("pasta", 4),
    detail: detail("37.5446", "127.0557", "서울 성동구 샘플길 1", "이탈리아음식"),
  },
  "2002": {
    title: "샘플 카페 : 네이버",
    photos: originals("cafe", 5),
    detail: detail("37.5559", "126.9019", "서울 마포구 샘플로 2", "카페,디저트"),
  },
  "2003": {
    title: "샘플 공원 : 네이버",
    photos: originals("park", 3),
    detail: detail("37.5284", "126.9326", "서울 영등포구 샘플로 3", "공원"),
  },
  "2004": {
    title: "샘플 전시관 : 네이버",
    photos: originals("gallery", 4),
    detail: detail("37.5796", "126.9770", "서울 종로구 샘플길 4", "전시관"),
  },
  "2005": {
    title: "샘플 베이커리 : 네이버",
    photos: originals("bakery", 3),
    detail: detail("37.5634", "126.9239", "서울 마포구 샘플길 5", "베이커리"),
  },
});

/** 사진 주소의 src에서 장면과 번호를 읽어 색 그림을 만든다. */
const sampleSvg = (url: string) => {
  const src = decodeURIComponent(new URL(url).searchParams.get("src") ?? "");
  const [, scene = "pasta", n = "1"] = src.match(/\/(\w+)-(\d+)\.jpg$/) ?? [];
  const { hue, label } = SCENES[scene as Scene] ?? SCENES.pasta;
  const h = hue + Number(n) * 9;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="380" viewBox="0 0 640 380">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${h} 70% 78%)"/><stop offset="1" stop-color="hsl(${h + 30} 60% 52%)"/>
    </linearGradient></defs>
    <rect width="640" height="380" fill="url(#g)"/>
    <circle cx="${160 + Number(n) * 60}" cy="150" r="90" fill="hsl(${h} 80% 92% / .55)"/>
    <rect x="0" y="270" width="640" height="110" fill="hsl(${h + 20} 45% 38% / .45)"/>
    <text x="32" y="345" font-family="Noto Sans CJK KR, sans-serif" font-size="40" font-weight="700" fill="white">샘플 ${label} ${n}</text>
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

test("지도 탭: 다녀온 곳을 지도에 모아 보기", async ({
  page,
  request,
  token,
  browser,
  appUrl,
}) => {
  test.setTimeout(240_000);
  // 샘플 데이터만 쓴다. 저장소가 public이라 실제 내역은 화면에 나오면 안 된다.
  const category = await getCategories(request, token);
  const lastYear = (days: number) =>
    kst().subtract(1, "year").subtract(days, "day").format("YYYY-MM-DD");
  const seed: [string, number, string, string, string][] = [
    [daysAgo(1), 32_000, "파스타 점심", "식비", "2001"],
    [daysAgo(1), 9_000, "파스타 디저트", "식비", "2001"],
    [daysAgo(12), 28_000, "파스타 저녁", "식비", "2001"],
    [lastYear(20), 24_000, "파스타", "식비", "2001"],
    [daysAgo(3), 12_000, "라테 두 잔", "카페", "2002"],
    [daysAgo(20), 6_500, "아메리카노", "카페", "2002"],
    [daysAgo(5), 7_500, "공원 산책 간식", "식비", "2003"],
    [lastYear(40), 18_000, "전시회", "문화", "2004"],
    [daysAgo(8), 8_500, "빵", "식비", "2005"],
  ];
  for (const [entryDate, amount, memo, name, id] of seed) {
    await addEntry(request, token, {
      entryDate,
      amount,
      memo,
      categoryId: category(name),
      mapUrl: placeUrl(id),
    });
  }

  await routeSamples(page.context());
  await showTaps(page);
  await openLedger(page, token);
  const recording = await startRecording(page);
  await pause(page, 1200);

  // 1) 지도 탭: 지도 링크를 붙인 지출이 장소별 핀으로 모인다.
  await page.getByRole("tab", { name: "지도" }).tap();
  await page.locator("[data-map-ready]").waitFor();
  await pause(page, 3500);

  // 2) 목록에서 많이 간 곳을 누르면 사진·간 날·결제가 카드로 열린다.
  const list = page.getByRole("list", { name: "다녀온 곳" });
  await scrollToTarget(list, { offset: 120, duration: 1200 });
  await pause(page, 1500);
  await list.getByRole("button", { name: /샘플 파스타/ }).tap();
  await pause(page, 2000);
  const card = page.getByRole("region", { name: "샘플 파스타 방문 기록" });
  await scrollToTarget(card, { offset: 60, duration: 1200 });
  await pause(page, 1500);
  await card.getByRole("button", { name: "다음 사진" }).tap();
  await pause(page, 1200);
  await scrollToTarget(card.getByRole("list", { name: "간 날" }), {
    offset: 220,
    duration: 1200,
  });
  await pause(page, 3000);

  // 3) 기간 칩으로 올해만 본다.
  const period = page.getByRole("navigation", { name: "지도 기간" });
  await scrollToTarget(period, { offset: 120, duration: 1200 });
  await pause(page, 800);
  await period.getByRole("button", { name: "올해" }).tap();
  await pause(page, 3000);

  // 4) 탭 위 분류 필터로 카페만 본다.
  await page
    .getByRole("group", { name: "분류 필터" })
    .getByRole("button", { name: "카페" })
    .tap();
  await pause(page, 3000);

  console.log(await recording.stop("ledger-map"));

  // PC 화면: 지도 옆에 장소 카드와 목록(스크린샷).
  const desktop = await browser.newContext({
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 860 },
    baseURL: appUrl,
  });
  await routeSamples(desktop);
  const pc = await desktop.newPage();
  await openLedger(pc, token);
  await pc.getByRole("tab", { name: "지도" }).click();
  await pc.locator("[data-map-ready]").waitFor();
  await pc
    .getByRole("list", { name: "다녀온 곳" })
    .getByRole("button", { name: /샘플 파스타/ })
    .click();
  await pause(pc, 2500);
  const shot = path.join(DEMO_OUTPUT_DIR, "ledger-map-desktop.png");
  await pc.screenshot({ path: shot });
  console.log(shot);
  await desktop.close();
});
