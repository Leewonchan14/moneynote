import { kst } from "../../src/lib/kst";
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

test("통계 인사이트: 평소와 다른 지출, 저축·고정비", async ({ page, request, token }) => {
  // 샘플 데이터만 쓴다. 저장소가 public이라 실제 내역은 화면에 나오면 안 된다.
  const category = await getCategories(request, token);
  const savingsId = await createItem(request, token, "/api/ledger/savings", {
    name: "샘플 적금",
  });
  const monthsAgo = (n: number) => kst().subtract(n, "month").format("YYYY-MM");
  for (let n = 6; n >= 1; n -= 1) {
    const m = monthsAgo(n);
    for (const [day, amount, memo] of [
      ["01", 12_000, "점심"],
      ["01", 9_000, "점심"],
      ["01", 15_000, "저녁"],
    ] as const) {
      await addEntry(request, token, {
        entryDate: `${m}-${day}`,
        amount,
        memo,
        categoryId: category("식비"),
      });
    }
    // 쇼핑은 달마다 들쭉날쭉해야 고정비로 잡히지 않는다.
    const shopping = { 6: 120_000, 5: 40_000, 3: 150_000, 2: 60_000 }[n];
    if (shopping) {
      await addEntry(request, token, {
        entryDate: `${m}-01`,
        amount: shopping,
        memo: "옷",
        categoryId: category("쇼핑"),
      });
    }
    await addEntry(request, token, {
      entryDate: `${m}-01`,
      amount: 55_000,
      memo: "통신비",
      categoryId: category("생활"),
    });
    await addEntry(request, token, {
      entryDate: `${m}-01`,
      amount: 13_500,
      memo: "영상 구독",
      categoryId: category("문화"),
    });
    await addEntry(request, token, {
      entryDate: `${m}-01`,
      kind: "transfer",
      amount: 300_000,
      savingsId,
    });
  }
  const month = thisMonth();
  for (const [amount, memo, name] of [
    [180_000, "팀 회식", "식비"],
    [11_000, "점심", "식비"],
    [10_000, "옷", "쇼핑"],
    [55_000, "통신비", "생활"],
    [13_500, "영상 구독", "문화"],
  ] as const) {
    await addEntry(request, token, {
      entryDate: `${month}-01`,
      amount,
      memo,
      categoryId: category(name),
    });
  }
  await addEntry(request, token, {
    entryDate: `${month}-01`,
    kind: "transfer",
    amount: 300_000,
    savingsId,
  });

  await showTaps(page);
  await openLedger(page, token);
  const recording = await startRecording(page);
  await pause(page, 800);

  await openStats(page);
  await pause(page);
  const unusual = page.getByTestId("unusual-spend-card");
  await scrollToTarget(unusual);
  await pause(page, 2500);

  await unusual.getByRole("button", { name: /팀 회식/ }).click();
  await pause(page, 1500);
  await page.keyboard.press("Escape");
  await pause(page, 800);

  await scrollToTarget(page.getByTestId("savings-card"));
  await pause(page, 3000);

  console.log(await recording.stop("insights"));
});
