import {
  addEntry,
  createItem,
  getCategories,
  openLedger,
  test,
  thisMonth,
} from "../helpers";
import { pause, scrollToTarget, showTaps, startRecording } from "./recorder";

test("분류 요약: 분류를 고르면 위쪽 지출·리캡이 따라가고, 큰 지출·소분류를 눌러 날짜를 본다", async ({
  page,
  request,
  token,
}) => {
  // 샘플 데이터만 쓴다. 저장소가 public이라 실제 내역은 화면에 나오면 안 된다.
  const category = await getCategories(request, token);
  const soloId = await createItem(request, token, "/api/ledger/subcategories", {
    categoryId: category("식비"),
    name: "혼밥",
  });
  const deliveryId = await createItem(request, token, "/api/ledger/subcategories", {
    categoryId: category("식비"),
    name: "배달",
  });
  const month = thisMonth();
  for (const [day, amount, memo, name, sub] of [
    ["01", 4_500, "버거 가게", "식비", soloId],
    ["02", 32_000, "마트 장보기", "생활", null],
    ["03", 9_000, "김밥 가게", "식비", soloId],
    ["05", 21_000, "치킨 배달", "식비", deliveryId],
    ["06", 5_500, "동네 카페", "카페", null],
    ["08", 6_000, "버거 가게", "식비", soloId],
    ["10", 18_000, "피자 배달", "식비", deliveryId],
    ["12", 3_500, "버거 가게", "식비", soloId],
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

  // 식비를 고르면 지출 카드와 리캡이 식비만 센다.
  const chips = page.getByRole("group", { name: "분류 필터" });
  await chips.getByRole("button", { name: "식비", exact: true }).click();
  await pause(page, 1200);
  await scrollToTarget(page.getByTestId("summary-expense"));
  await pause(page, 2000);

  // 큰 지출에서 버거 가게를 누르면 언제 먹었는지 나온다.
  const top = page.getByRole("list", { name: "큰 지출 목록" });
  await scrollToTarget(top);
  await pause(page, 800);
  await top.getByText("버거 가게").click();
  await pause(page, 600);
  await scrollToTarget(page.getByRole("list", { name: "버거 가게 내역" }));
  await pause(page, 2200);

  // 소분류(혼밥)도 눌러서 날짜별 내역을 본다.
  const solo = page.getByRole("button", { name: /^혼밥 [\d,]+원/ });
  await scrollToTarget(solo);
  await solo.click();
  await pause(page, 600);
  await scrollToTarget(page.getByRole("list", { name: "내역", exact: true }));
  await pause(page, 2200);

  // 달력 탭에서도 이번 달 식비 합계가 위에 보인다.
  await scrollToTarget(page.getByRole("tablist", { name: "가계부 보기" }));
  await page
    .getByRole("tablist", { name: "가계부 보기" })
    .getByRole("tab", { name: "달력" })
    .click();
  await pause(page, 800);
  await scrollToTarget(page.getByTestId("summary-expense"));
  await pause(page, 2200);

  console.log(await recording.stop("category-summary"));
});
