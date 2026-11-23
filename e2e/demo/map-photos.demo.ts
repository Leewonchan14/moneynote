import { devices, type BrowserContext } from "@playwright/test";
import path from "node:path";

import { withFakeNaverPlaces } from "../fake-naver-place";
import { addEntry, daysAgo, getCategories, openLedger, today } from "../helpers";
import {
  DEMO_OUTPUT_DIR,
  pause,
  scrollToTarget,
  showTaps,
  startRecording,
} from "./recorder";

/*
 * 지도 링크·장소 사진·달력 사진 데모. 장소와 사진은 모두 가짜다.
 * 네이버 플레이스는 가짜 서버로, 사진 주소는 가로채서 색 그림(SVG)으로 돌려준다.
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

const test = withFakeNaverPlaces({
  "2001": { title: "샘플 파스타 : 네이버", photos: originals("pasta", 4) },
  "2002": { title: "샘플 카페 : 네이버", photos: originals("cafe", 6) },
  "2003": { title: "샘플 공원 : 네이버", photos: originals("park", 3) },
  "2004": { title: "샘플 전시관 : 네이버", photos: originals("gallery", 5) },
  "2005": { title: "샘플 베이커리 : 네이버", photos: originals("bakery", 4) },
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
  Promise.all([
    context.route("https://search.pstatic.net/**", (route) =>
      route.fulfill({
        contentType: "image/svg+xml",
        body: sampleSvg(route.request().url()),
      })
    ),
    context.route(/^https:\/\/map\.naver\.com\//, (route) =>
      route.fulfill({ contentType: "text/html", body: "<p>map</p>" })
    ),
  ]);

const placeUrl = (id: string) => `https://map.naver.com/p/entry/place/${id}`;

test("지도 링크 장소 사진과 달력 사진", async ({
  page,
  request,
  token,
  browser,
  appUrl,
}) => {
  test.setTimeout(240_000);
  // 샘플 데이터만 쓴다. 저장소가 public이라 실제 내역은 화면에 나오면 안 된다.
  const category = await getCategories(request, token);
  const seed: [string, number, string, string, string][] = [
    [daysAgo(6), 18_000, "전시회", "문화", "2004"],
    [daysAgo(3), 7_500, "공원 산책 간식", "식비", "2003"],
    [daysAgo(3), 12_000, "카페", "카페", "2002"],
    [today(), 32_000, "파스타 점심", "식비", "2001"],
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
  await addEntry(request, token, {
    entryDate: today(),
    amount: 1_450,
    memo: "버스",
    categoryId: category("교통"),
  });

  await routeSamples(page.context());
  await showTaps(page);
  await openLedger(page, token);
  const recording = await startRecording(page);
  await pause(page, 1500);

  // 1) 내역을 추가하면서 지도 앱 공유 문구를 붙인다. 링크만 남는다.
  await page.getByRole("button", { name: "내역 추가" }).first().tap();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#ledger-amount").fill("8500");
  await pause(page, 400);
  await dialog.locator("#ledger-memo").fill("베이커리");
  await dialog.getByRole("button", { name: "식비", exact: true }).tap();
  const mapInput = dialog.locator("#ledger-map-url");
  await scrollToTarget(mapInput, { offset: 160 });
  await pause(page, 600);
  await mapInput.fill(`[네이버 지도]\n샘플 베이커리\n서울 어딘가\n${placeUrl("2005")}`);
  await pause(page, 1200);
  await mapInput.blur();
  await pause(page, 1500);
  await dialog.getByRole("button", { name: "저장" }).tap();
  await dialog.waitFor({ state: "hidden" });
  await pause(page, 2000);

  // 2) 내역의 장소 사진을 눌러 크게 넘겨 본다.
  await page.getByRole("button", { name: "샘플 베이커리 사진 1 크게 보기" }).tap();
  const viewer = page.getByRole("dialog", { name: "샘플 베이커리 사진 크게 보기" });
  await viewer.waitFor();
  await pause(page, 1200);
  await viewer.getByRole("button", { name: "다음 사진" }).tap();
  await pause(page, 1000);
  await viewer.getByRole("button", { name: "다음 사진" }).tap();
  await pause(page, 1000);
  await viewer.getByRole("button", { name: "닫기" }).tap();
  await pause(page, 1000);

  // 3) 달력에서 그날 간 곳 사진을 폴라로이드로 본다.
  await page.getByRole("tab", { name: "달력" }).tap();
  await pause(page, 2500);
  const cafeDay = page.getByRole("button", { name: /간 곳 샘플 카페/ });
  await cafeDay.tap();
  await pause(page, 800);
  await scrollToTarget(page.getByRole("link", { name: "카페 지도 열기" }).first(), {
    offset: 220,
  });
  await pause(page, 2500);

  // 4) 사진을 크게 보여 줄 수도 있다.
  await page
    .getByRole("group", { name: "장소 사진 크기" })
    .getByRole("button", { name: "사진 크게" })
    .tap();
  await pause(page, 600);
  await scrollToTarget(page.getByRole("link", { name: "카페 지도 열기" }).first(), {
    offset: 220,
  });
  await pause(page, 2500);

  console.log(await recording.stop("map-photos"));

  // PC 달력: 마우스를 올리면 그날 간 곳 사진을 미리 본다(스크린샷).
  const desktop = await browser.newContext({
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 900 },
    baseURL: appUrl,
  });
  await routeSamples(desktop);
  const pc = await desktop.newPage();
  await openLedger(pc, token);
  await pc.getByRole("tab", { name: "달력" }).click();
  const todayCell = pc.getByRole("button", { name: /간 곳 샘플 파스타/ });
  await todayCell.hover();
  await pc.getByLabel(/ 간 곳$/).waitFor();
  await pause(pc, 800);
  const shot = path.join(DEMO_OUTPUT_DIR, "map-photos-desktop.png");
  await pc.screenshot({ path: shot });
  console.log(shot);
  await desktop.close();
});
