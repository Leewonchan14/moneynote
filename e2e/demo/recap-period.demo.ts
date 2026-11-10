import { kst } from "../../src/lib/kst";
import { shiftWeek, weekStartOf } from "../../src/lib/ledger/week";
import { addEntry, getCategories, openLedger, test } from "../helpers";
import { pause, scrollToTarget, showTaps, startRecording } from "./recorder";

test("월별·주별 리캡: 내역에서 고른 기간을 따라간다", async ({
  page,
  request,
  token,
}) => {
  // 샘플 데이터만 쓴다. 저장소가 public이라 실제 내역은 화면에 나오면 안 된다.
  const category = await getCategories(request, token);
  const today = kst().format("YYYY-MM-DD");
  const thisWeek = weekStartOf(today);
  const day = (weeksAgo: number, offset: number) =>
    kst(shiftWeek(thisWeek, -weeksAgo)).add(offset, "day").format("YYYY-MM-DD");

  const samples: [string, number, string, string][] = [
    [day(1, 0), 12_000, "점심", "식비"],
    [day(1, 2), 48_000, "운동화", "쇼핑"],
    [day(1, 4), 32_000, "친구 저녁", "식비"],
    [day(1, 5), 6_500, "카페", "카페"],
    [day(2, 1), 9_000, "점심", "식비"],
    [day(2, 3), 85_000, "가습기", "생활"],
    [day(2, 6), 18_000, "영화", "문화"],
    [day(3, 2), 22_000, "장보기", "식비"],
    [day(3, 5), 4_500, "카페", "카페"],
  ];
  if (today !== thisWeek) samples.push([thisWeek, 11_000, "점심", "식비"]);
  samples.push([today, 5_500, "커피", "카페"]);
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
  const monthCard = page.getByRole("region", { name: "월별 리캡" });
  await monthCard.waitFor();
  await pause(page, 2000);

  await page.getByRole("button", { name: "이전 달" }).click();
  await pause(page, 2000);
  await page.getByRole("button", { name: "이번 달" }).click();
  await pause(page, 1200);

  await page
    .getByRole("group", { name: "기간 단위" })
    .getByRole("button", { name: "주" })
    .click();
  const weekCard = page.getByRole("region", { name: "주별 리캡" });
  await weekCard.waitFor();
  await scrollToTarget(weekCard);
  await pause(page, 1800);

  for (let step = 0; step < 3; step += 1) {
    await page.getByRole("button", { name: "이전 주" }).click();
    await pause(page, 1800);
  }

  console.log(await recording.stop("recap-period"));
});
