import {
  addEntry,
  createItem,
  getCategories,
  openLedger,
  test,
  thisMonth,
} from "../helpers";
import { pause, showTaps, startRecording } from "./recorder";

test("여행별 보기: 이름과 기간이 긴 여행도 체크 표시와 겹치지 않는다", async ({
  page,
  request,
  token,
}) => {
  // 샘플 데이터만 쓴다. 저장소가 public이라 실제 내역은 화면에 나오면 안 된다.
  const category = await getCategories(request, token);
  const month = thisMonth();
  for (const [name, start, end] of [
    ["2026 겨울 바다", "03", "06"],
    ["주말 캠핑", "14", "15"],
  ] as const) {
    const tripId = await createItem(request, token, "/api/ledger/trips", {
      name,
      startDate: `${month}-${start}`,
      endDate: `${month}-${end}`,
    });
    await addEntry(request, token, {
      entryDate: `${month}-${start}`,
      amount: 42_000,
      memo: "숙소",
      categoryId: category("숙박"),
      tripId,
    });
  }

  await showTaps(page);
  await openLedger(page, token);
  const recording = await startRecording(page);
  await pause(page, 1000);

  const picker = page.getByRole("combobox", { name: "여행별 보기" });
  await picker.click();
  await pause(page, 1800);
  await page.getByRole("option", { name: /2026 겨울 바다/ }).click();
  await pause(page, 1500);
  await picker.click();
  await pause(page, 2200);

  console.log(await recording.stop("trip-picker"));
});
