import { withFakeNaverPlaces } from "../fake-naver-place";
import { addEntry, daysAgo, getCategories, openLedger } from "../helpers";
import { pause, scrollToTarget, showTaps, startRecording } from "./recorder";

/*
 * 좁은 폰(360px)에서 지도 탭이 좌우로 넘치지 않는 데모. 장소·내역은 모두 가짜다.
 * 탭 일곱 개가 한 줄에 들어가고, 메모가 긴 장소를 골라도 지도가 화면 너비에 맞는다.
 */

const test = withFakeNaverPlaces({
  "2001": {
    title: "샘플 분식 : 네이버",
    photos: [],
    detail: {
      lat: "37.5446",
      lng: "127.0557",
      roadAddress: "서울 성동구 샘플길 1",
      category: "분식",
    },
  },
  "2002": {
    title: "샘플 카페 : 네이버",
    photos: [],
    detail: {
      lat: "37.5559",
      lng: "126.9019",
      roadAddress: "서울 마포구 샘플로 2",
      category: "카페,디저트",
    },
  },
});

const placeUrl = (id: string) => `https://map.naver.com/p/entry/place/${id}`;

test("좁은 폰에서 지도 탭 너비", async ({ page, request, token }) => {
  test.setTimeout(180_000);
  // 샘플 데이터만 쓴다. 저장소가 public이라 실제 내역은 화면에 나오면 안 된다.
  const category = await getCategories(request, token);
  for (let day = 1; day <= 6; day += 1) {
    await addEntry(request, token, {
      entryDate: daysAgo(day * 3),
      amount: 9_000 + day * 700,
      memo: `친구랑 떡볶이·튀김·순대 세트 나눠 먹음 ${day}`,
      categoryId: category("식비"),
      mapUrl: placeUrl("2001"),
    });
  }
  await addEntry(request, token, {
    entryDate: daysAgo(2),
    amount: 5_500,
    memo: "라테",
    categoryId: category("카페"),
    mapUrl: placeUrl("2002"),
  });

  await page.setViewportSize({ width: 360, height: 760 });
  await showTaps(page);
  await openLedger(page, token);
  const recording = await startRecording(page);
  await pause(page, 1500);

  await page.getByRole("tab", { name: "지도" }).tap();
  await page.locator("[data-map-ready]").waitFor();
  await pause(page, 2000);

  const list = page.getByRole("list", { name: "다녀온 곳" });
  await scrollToTarget(list, { offset: 200, duration: 1000 });
  await list.getByRole("button", { name: /샘플 분식/ }).tap();
  await pause(page, 1500);
  const card = page.getByRole("region", { name: "샘플 분식 방문 기록" });
  await scrollToTarget(card, { offset: 40, duration: 1000 });
  await pause(page, 2000);

  // 옆으로 밀어도 화면이 움직이지 않는다.
  await page.mouse.wheel(300, 0);
  await pause(page, 1200);
  await scrollToTarget(page.getByRole("tab", { name: "지도" }), {
    offset: 20,
    duration: 1000,
  });
  await pause(page, 2000);

  console.log(await recording.stop("map-mobile-width"));
});
