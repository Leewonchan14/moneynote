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

test("분류 필터: 탭 아래에서 고른 분류를 내역·달력·통계가 함께 쓴다", async ({
  page,
  request,
  token,
}) => {
  // 샘플 데이터만 쓴다. 저장소가 public이라 실제 내역은 화면에 나오면 안 된다.
  const category = await getCategories(request, token);
  const deliveryId = await createItem(request, token, "/api/ledger/subcategories", {
    categoryId: category("식비"),
    name: "배달",
  });
  const month = thisMonth();
  for (const [day, amount, memo, name, sub] of [
    ["02", 9_000, "김밥 가게", "식비", null],
    ["03", 5_500, "동네 카페", "카페", null],
    ["04", 32_000, "마트 장보기", "생활", null],
    ["05", 21_000, "치킨 배달", "식비", deliveryId],
    ["07", 4_500, "지하철", "교통", null],
    ["08", 18_000, "피자 배달", "식비", deliveryId],
    ["10", 24_000, "저녁 파스타", "식비", null],
    ["11", 6_000, "라떼", "카페", null],
  ] as const) {
    await addEntry(request, token, {
      entryDate: `${month}-${day}`,
      amount,
      memo,
      categoryId: category(name),
      subcategoryId: sub,
    });
  }

  await showTaps(page);
  await openLedger(page, token);
  const recording = await startRecording(page);
  await pause(page, 1200);

  const chips = page.getByRole("group", { name: "분류 필터" });
  await chips.getByRole("button", { name: "식비", exact: true }).click();
  await pause(page, 1500);
  await page
    .getByRole("group", { name: "소분류 필터" })
    .getByRole("button", { name: "배달", exact: true })
    .click();
  await pause(page, 1500);
  await scrollToTarget(page.getByRole("button", { name: /^피자 배달 식비/ }));
  await pause(page, 1800);

  await scrollToTarget(page.getByRole("tablist", { name: "가계부 보기" }));
  await page
    .getByRole("tablist", { name: "가계부 보기" })
    .getByRole("tab", { name: "달력" })
    .click();
  await pause(page, 1000);
  await scrollToTarget(page.getByLabel("달력 보기 방식"));
  await pause(page, 2000);

  await scrollToTarget(page.getByRole("tablist", { name: "가계부 보기" }));
  await openStats(page);
  await pause(page, 2000);
  await scrollToTarget(page.getByRole("list", { name: "큰 지출 목록" }));
  await pause(page, 2200);

  console.log(await recording.stop("category-filter"));
});
