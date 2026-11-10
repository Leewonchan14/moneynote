import { kst } from "../../src/lib/kst";
import { formatMonthKo } from "../../src/lib/ledger/format";
import { formatWeekKo, shiftWeek, weekStartOf } from "../../src/lib/ledger/week";
import { addEntry, getCategories, openLedger, test } from "../helpers";
import { pause, showTaps, startRecording } from "./recorder";

test("기간 picker: 라벨을 눌러 달·주를 바로 고른다", async ({ page, request, token }) => {
  // 샘플 데이터만 쓴다. 저장소가 public이라 실제 내역은 화면에 나오면 안 된다.
  const category = await getCategories(request, token);
  const today = kst().format("YYYY-MM-DD");
  const thisMonth = today.slice(0, 7);
  const target = kst().subtract(4, "month").format("YYYY-MM");
  const thisWeek = weekStartOf(today);
  const targetWeek = shiftWeek(thisWeek, -3);
  const weekDay = (offset: number) =>
    kst(targetWeek).add(offset, "day").format("YYYY-MM-DD");

  const samples: [string, number, string, string][] = [
    [`${target}-03`, 12_000, "점심", "식비"],
    [`${target}-11`, 64_000, "운동화", "쇼핑"],
    [`${target}-20`, 5_500, "카페", "카페"],
    [weekDay(1), 9_000, "점심", "식비"],
    [weekDay(3), 42_000, "장보기", "식비"],
    [weekDay(5), 18_000, "영화", "문화"],
    [today, 4_800, "커피", "카페"],
  ];
  for (const [entryDate, amount, memo, name] of samples) {
    await addEntry(request, token, {
      entryDate,
      amount,
      memo,
      categoryId: category(name),
    });
  }

  await showTaps(page);
  await openLedger(page, token);
  const recording = await startRecording(page);
  const popup = page.locator('[data-slot="popover-content"]');
  await pause(page, 1500);

  // 월: 라벨을 눌러 넉 달 전으로 바로 간다.
  await page.getByRole("button", { name: formatMonthKo(thisMonth), exact: true }).click();
  await pause(page, 1200);
  if (target.slice(0, 4) !== thisMonth.slice(0, 4)) {
    await popup.getByRole("button", { name: "이전 해" }).click();
    await pause(page, 800);
  }
  await popup.getByRole("button", { name: formatMonthKo(target), exact: true }).click();
  await pause(page, 2000);

  // 주: 주 단위로 바꾸고 달력에서 세 주 전 날짜를 누른다.
  await page
    .getByRole("group", { name: "기간 단위" })
    .getByRole("button", { name: "주" })
    .click();
  await pause(page, 1200);
  await page
    .getByRole("button", {
      name: formatWeekKo(weekStartOf(`${target}-01`), today),
      exact: true,
    })
    .click();
  await pause(page, 1000);
  for (let step = 0; step < 6; step += 1) {
    const cell = popup.locator(`td[data-day="${weekDay(3)}"]:not([data-outside])`);
    if (await cell.count()) {
      await cell.getByRole("button").click();
      break;
    }
    await popup.locator(".rdp-button_next").click();
    await pause(page, 500);
  }
  await pause(page, 2000);

  // 다시 열면 고른 주가 칠해져 있다.
  await page
    .getByRole("button", { name: formatWeekKo(targetWeek, today), exact: true })
    .click();
  await pause(page, 1800);
  await page.keyboard.press("Escape");
  await pause(page, 800);

  console.log(await recording.stop("period-picker"));
});
