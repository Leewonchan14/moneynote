import type { BrowserContext } from "@playwright/test";

import { withFakeNaverPlaces } from "../fake-naver-place";
import { addEntry, getCategories, openLedger, today } from "../helpers";
import { pause, scrollToTarget, showTaps, startRecording } from "./recorder";

/*
 * 그날의 동선 데모. 장소·사진·내역은 모두 가짜다.
 * 네이버 플레이스는 가짜 서버로, 사진 주소는 가로채서 색 그림(SVG)으로 돌려준다.
 * 배경 지도만 실제 OpenFreeMap 타일을 쓴다.
 */

const SCENES = {
  bakery: { hue: 36, label: "빵집" },
  books: { hue: 200, label: "서점" },
  noodle: { hue: 12, label: "국수" },
  cafe: { hue: 28, label: "카페" },
  pub: { hue: 280, label: "펍" },
} as const;
type Scene = keyof typeof SCENES;

const photos = (scene: Scene) =>
  [1, 2].map((n) => `https://pup-review-phinf.pstatic.net/sample/${scene}-${n}.jpg`);

const place = (
  title: string,
  scene: Scene,
  lat: string,
  lng: string,
  category: string
) => ({
  title: `${title} : 네이버`,
  photos: photos(scene),
  detail: { lat, lng, roadAddress: "서울 샘플구 샘플길 1", category },
});

const test = withFakeNaverPlaces({
  "5001": place("샘플 베이커리", "bakery", "37.5796", "126.9700", "베이커리"),
  "5002": place("샘플 서점", "books", "37.5759", "126.9850", "서점"),
  "5003": place("샘플 국숫집", "noodle", "37.5705", "126.9996", "국수"),
  "5004": place("샘플 카페", "cafe", "37.5446", "127.0557", "카페,디저트"),
  "5005": place("샘플 펍", "pub", "37.5340", "126.9946", "술집"),
});

/** 사진 주소의 src에서 장면과 번호를 읽어 색 그림을 만든다. */
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
    <circle cx="190" cy="150" r="90" fill="hsl(${h} 80% 92% / .55)"/>
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

test("그날의 동선: 달력에서 하루 다닌 곳을 시간 순서로 다시 보기", async ({
  page,
  request,
  token,
}) => {
  test.setTimeout(240_000);
  // 샘플 데이터만 쓴다. 저장소가 public이라 실제 내역은 화면에 나오면 안 된다.
  const category = await getCategories(request, token);
  const seed: [string | null, number, string, string, string | null][] = [
    ["08:40", 6_500, "소금빵", "식비", "5001"],
    ["10:30", 18_000, "책 한 권", "문화", "5002"],
    ["12:20", 9_000, "칼국수", "식비", "5003"],
    ["15:10", 6_000, "라테", "카페", "5004"],
    ["15:40", 7_500, "케이크", "카페", "5004"],
    ["19:30", 24_000, "저녁", "식비", "5005"],
    ["13:00", 1_400, "지하철", "교통", null],
  ];
  for (const [entryTime, amount, memo, name, id] of seed) {
    await addEntry(request, token, {
      entryDate: today(),
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
  await pause(page, 1000);

  // 1) 달력 탭에서 오늘을 보면, 지도에 찍힌 지출이 두 건 이상이라 "동선 보기"가 나온다.
  await page.getByRole("tab", { name: "달력" }).tap();
  await pause(page, 1500);
  const button = page.getByRole("button", { name: "동선 보기" });
  await scrollToTarget(button, { offset: 200, duration: 1000 });
  await pause(page, 1200);
  await button.tap();

  // 2) 열면 저절로 재생한다. 한 곳씩 선을 긋고 지도가 따라가며, 아래 카드가 바뀐다.
  const dialog = page.getByRole("dialog", { name: /동선$/ });
  await dialog.locator("[data-map-ready]").waitFor();
  const controls = dialog.getByRole("group", { name: "동선 재생" });
  await controls
    .getByRole("button", { name: "처음부터 다시 보기" })
    .waitFor({ timeout: 60_000 });
  await pause(page, 2000);

  // 3) 앞뒤로 넘겨 보고, 목록에서 골라 바로 간다.
  await controls.getByRole("button", { name: "이전 곳" }).tap();
  await pause(page, 1800);
  await controls.getByRole("button", { name: "이전 곳" }).tap();
  await pause(page, 1800);
  const list = dialog.getByRole("list", { name: "들른 곳" });
  await scrollToTarget(list, { offset: 260, duration: 900 });
  await pause(page, 800);
  await list.getByRole("button", { name: /샘플 서점/ }).tap();
  await pause(page, 2200);

  // 4) 거기서부터 다시 재생한다.
  await scrollToTarget(controls, { offset: 420, duration: 900 });
  await controls.getByRole("button", { name: "재생" }).tap();
  await pause(page, 8000);

  console.log(await recording.stop("day-route"));
});
