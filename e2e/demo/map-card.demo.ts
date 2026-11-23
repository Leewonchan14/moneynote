import { withFakeNaverPlaces } from "../fake-naver-place";
import { addEntry, daysAgo, getCategories, openLedger } from "../helpers";
import { pause, scrollToTarget, showTaps, startRecording } from "./recorder";

/*
 * 지도 탭 장소 카드 데모: 고른 장소가 주소(?place=)에 남아 새로고침해도 다시 열리고,
 * 간 날이 많으면 카드 안에서 스크롤한다. 장소·사진·내역은 모두 가짜다.
 */

const test = withFakeNaverPlaces({
  "2001": {
    title: "샘플 분식 : 네이버",
    photos: ["https://pup-review-phinf.pstatic.net/sample/logo-1.jpg"],
    detail: {
      lat: "37.5446",
      lng: "127.0557",
      roadAddress: "서울 성동구 샘플길 1",
      category: "분식",
    },
  },
  "2002": {
    title: "샘플 카페 : 네이버",
    photos: ["https://pup-review-phinf.pstatic.net/sample/logo-2.jpg"],
    detail: {
      lat: "37.5559",
      lng: "126.9019",
      roadAddress: "서울 마포구 샘플로 2",
      category: "카페,디저트",
    },
  },
});

/** 흰 바탕 로고 사진. 경계선이 없으면 카드 본문과 붙어 보인다. */
const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="380" viewBox="0 0 640 380">
  <rect width="640" height="380" fill="#ffffff"/>
  <circle cx="320" cy="210" r="160" fill="#ffffff" stroke="#333" stroke-width="3"/>
  <text x="320" y="225" text-anchor="middle" font-family="Noto Sans CJK KR, sans-serif" font-size="56" font-weight="700" fill="#d33">샘플 로고</text>
</svg>`;

const placeUrl = (id: string) => `https://map.naver.com/p/entry/place/${id}`;

test("지도 장소 카드: 주소에 남기기와 간 날 스크롤", async ({ page, request, token }) => {
  test.setTimeout(240_000);
  // 샘플 데이터만 쓴다. 저장소가 public이라 실제 내역은 화면에 나오면 안 된다.
  const category = await getCategories(request, token);
  for (let i = 1; i <= 14; i += 1) {
    await addEntry(request, token, {
      entryDate: daysAgo(i * 5),
      amount: 8_000 + i * 500,
      memo: i % 2 ? "떡볶이" : "김밥",
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

  await page
    .context()
    .route("https://search.pstatic.net/**", (route) =>
      route.fulfill({ contentType: "image/svg+xml", body: LOGO })
    );
  await showTaps(page);
  await openLedger(page, token);
  const recording = await startRecording(page);
  await pause(page, 1000);

  await page.getByRole("tab", { name: "지도" }).tap();
  await page.locator("[data-map-ready]").waitFor();
  await pause(page, 1500);

  // 1) 장소를 고르면 사진 아래 경계선과 간 날 목록이 보인다.
  const list = page.getByRole("list", { name: "다녀온 곳" });
  await scrollToTarget(list, { offset: 160, duration: 1000 });
  await list.getByRole("button", { name: /샘플 분식/ }).tap();
  await pause(page, 1500);
  const card = page.getByRole("region", { name: "샘플 분식 방문 기록" });
  await scrollToTarget(card, { offset: 40, duration: 1000 });
  await pause(page, 2000);

  // 2) 간 날이 많으면 카드 안의 목록만 스크롤한다.
  const days = card.getByRole("list", { name: "간 날" });
  for (let i = 0; i < 5; i += 1) {
    await days.evaluate((el) => el.scrollBy({ top: 80, behavior: "smooth" }));
    await pause(page, 600);
  }
  await pause(page, 1500);

  // 3) 새로고침해도 주소(?place=)로 지도 탭과 같은 장소가 다시 열린다.
  await page.reload();
  await card.waitFor();
  await page.locator("[data-map-ready]").waitFor();
  await pause(page, 1500);
  await scrollToTarget(card, { offset: 40, duration: 1000 });
  await pause(page, 2500);

  console.log(await recording.stop("map-card"));
});
