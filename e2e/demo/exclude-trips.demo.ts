import {
  addEntry,
  createItem,
  getCategories,
  openLedger,
  openStats,
  test,
  thisMonth,
} from "../helpers";
import { pause, scrollToTarget, showTaps, startRecording } from "./recorder";

test("여행 제외: 내역·달력·통계 탭이 같은 토글을 쓴다", async ({
  page,
  request,
  token,
}) => {
  // 샘플 데이터만 쓴다. 저장소가 public이라 실제 내역은 화면에 나오면 안 된다.
  const category = await getCategories(request, token);
  const month = thisMonth();
  for (const [day, amount, memo, name] of [
    ["02", 9_000, "김밥 가게", "식비"],
    ["03", 5_500, "동네 카페", "카페"],
    ["04", 32_000, "마트 장보기", "생활"],
    ["10", 24_000, "저녁 파스타", "식비"],
    ["11", 4_500, "지하철", "교통"],
  ] as const) {
    await addEntry(request, token, {
      entryDate: `${month}-${day}`,
      amount,
      memo,
      categoryId: category(name),
      tripId: null,
    });
  }
  const tripId = await createItem(request, token, "/api/ledger/trips", {
    name: "바다 여행",
    startDate: `${month}-06`,
    endDate: `${month}-08`,
  });
  for (const [day, amount, memo, name] of [
    ["06", 96_000, "고속버스 왕복", "교통"],
    ["06", 180_000, "바닷가 펜션", "숙박"],
    ["07", 68_000, "해산물 식당", "식비"],
    ["08", 12_000, "오션뷰 카페", "카페"],
  ] as const) {
    await addEntry(request, token, {
      entryDate: `${month}-${day}`,
      amount,
      memo,
      categoryId: category(name),
      tripId,
    });
  }

  await showTaps(page);
  await openLedger(page, token);
  const recording = await startRecording(page);
  await pause(page, 1200);

  const chip = page.getByRole("button", { name: "여행 제외" });
  await chip.click();
  await pause(page, 2000);
  await scrollToTarget(page.getByRole("button", { name: /저녁 파스타/ }));
  await pause(page, 2000);

  await scrollToTarget(page.getByRole("tablist", { name: "가계부 보기" }));
  await page.getByRole("tab", { name: "달력" }).click();
  await pause(page, 1000);
  await scrollToTarget(page.getByLabel("달력 보기 방식"));
  await pause(page, 2200);

  await scrollToTarget(page.getByRole("tablist", { name: "가계부 보기" }));
  await openStats(page);
  await pause(page, 2500);

  console.log(await recording.stop("exclude-trips"));
});
