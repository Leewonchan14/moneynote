import { kst } from "../src/lib/kst";
import { shiftWeek, weekEndOf, weekMonth, weekStartOf } from "../src/lib/ledger/week";
import {
  addEntry,
  authHeaders,
  createItem,
  daysAgo,
  E2E_PASSWORD,
  expect,
  fillNewEntry,
  getCategories,
  getLedger,
  lastMonth,
  openLedger,
  openMainTab,
  openSettingsTab,
  openStats,
  pickDate,
  reportPeriod,
  shortDay,
  test,
  thisMonth,
  today,
} from "./helpers";

import type { APIRequestContext, Page } from "@playwright/test";

const tryLogin = (request: APIRequestContext, ip: string, password: string) =>
  request.post("/api/auth", {
    headers: { "x-real-ip": ip, "x-forwarded-for": ip },
    data: { password },
  });

const createSavings = (request: APIRequestContext, token: string, name: string) =>
  createItem(request, token, "/api/ledger/savings", { name });

const createTrip = (
  request: APIRequestContext,
  token: string,
  name: string,
  startDate: string,
  endDate: string
) => createItem(request, token, "/api/ledger/trips", { name, startDate, endDate });

test.describe("접속", () => {
  test("비밀번호가 맞아야 들어가고 로그아웃하면 다시 잠긴다", async ({ page }) => {
    await page.goto("/");
    const password = page.locator("#password");

    await password.fill("틀린 비밀번호");
    await page.keyboard.press("Enter");
    await expect(page.getByText("비밀번호가 틀렸습니다.")).toBeVisible();

    await password.fill(E2E_PASSWORD);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "내역 추가" }).first()).toBeVisible();

    await page.getByRole("button", { name: "로그아웃" }).click();
    await expect(page.locator("#password")).toBeVisible();
  });

  test("토큰 없는 API 요청은 모두 거부한다", async ({ request }) => {
    for (const path of [
      "/api/ledger",
      "/api/ledger/recap",
      "/api/ledger/stats",
      "/api/ledger/search?q=a",
      "/api/ledger/export",
      "/api/ledger/history",
      "/api/ledger/suggestions",
    ]) {
      expect((await request.get(path)).status(), path).toBe(401);
    }
    const write = await request.post("/api/ledger/entries", {
      data: { entryDate: today(), kind: "expense", amount: 1_000 },
    });
    expect(write.status()).toBe(401);
  });

  test("같은 IP에서 5번 틀리면 맞는 비밀번호도 막히고 다른 IP는 가능하다", async ({
    request,
  }) => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const res = await tryLogin(request, "203.0.113.1", "wrong");
      expect((await res.json()).error).toBe("비밀번호가 틀렸습니다.");
    }

    const blocked = await tryLogin(request, "203.0.113.1", E2E_PASSWORD);
    expect(blocked.status()).toBe(429);
    expect(blocked.headers()["retry-after"]).toBeTruthy();
    expect((await blocked.json()).token).toBeUndefined();

    const other = await tryLogin(request, "203.0.113.2", E2E_PASSWORD);
    expect((await other.json()).success).toBe(true);
  });

  test("성공하면 그 IP의 실패 기록을 지운다", async ({ request }) => {
    const failFourTimes = async () => {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        await tryLogin(request, "203.0.113.3", "wrong");
      }
    };
    await failFourTimes();
    expect(
      (await (await tryLogin(request, "203.0.113.3", E2E_PASSWORD)).json()).success
    ).toBe(true);
    await failFourTimes();
    expect(
      (await (await tryLogin(request, "203.0.113.3", E2E_PASSWORD)).json()).success
    ).toBe(true);
  });

  test("전체 실패가 30번이면 새 IP도 막힌다", async ({ request }) => {
    for (let group = 0; group < 6; group += 1) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await tryLogin(request, `198.51.100.${group}`, "wrong");
      }
    }
    const res = await tryLogin(request, "198.51.100.200", E2E_PASSWORD);
    expect(res.status()).toBe(429);
  });

  test("동시에 몰린 요청도 한도를 크게 넘지 못한다", async ({ request }) => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => tryLogin(request, "203.0.113.9", "wrong"))
    );
    expect(results.filter((res) => res.status() === 200).length).toBeLessThanOrEqual(5);
    expect(results.filter((res) => res.status() === 429).length).toBeGreaterThanOrEqual(
      15
    );
  });

  test("로그인 화면에 차단 안내가 나온다", async ({ page, request }) => {
    await page.setExtraHTTPHeaders({ "x-real-ip": "203.0.113.20" });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await tryLogin(request, "203.0.113.20", "wrong");
    }
    await page.goto("/");
    await page.locator("#password").fill("아무거나");
    await page.keyboard.press("Enter");
    await expect(page.getByText(/로그인 시도가 너무 많아요/)).toBeVisible();
  });
});

test.describe("내역 입력", () => {
  test("분류·소분류·결제수단·시각·메모를 저장하고 보여 준다", async ({
    page,
    request,
    token,
  }) => {
    const categoryId = await getCategories(request, token);
    await createItem(request, token, "/api/ledger/subcategories", {
      categoryId: categoryId("식비"),
      name: "점심",
    });
    await createItem(request, token, "/api/ledger/assets", { name: "체크카드" });

    await openLedger(page, token);
    const dialog = await fillNewEntry(page, {
      amount: "12000",
      memo: "회사 앞 식당",
      category: "식비",
      time: "12:30",
    });
    await dialog.getByRole("button", { name: "점심", exact: true }).click();
    await dialog.getByRole("button", { name: "체크카드", exact: true }).click();
    await dialog.locator("#ledger-note").fill("동료와 함께");
    await dialog.getByRole("button", { name: "저장" }).click();

    const row = page.getByRole("button", { name: /회사 앞 식당/ });
    await expect(row).toContainText("12:30");
    await expect(row).toContainText("식비 › 점심");
    await expect(row).toContainText("체크카드");
    await expect(row).toContainText("동료와 함께");
    await expect(row).toContainText("-12,000원");

    const ledger = await getLedger(request, token);
    expect(ledger.entries).toHaveLength(1);
    expect(ledger.entries[0]).toMatchObject({
      amount: 12_000,
      categoryName: "식비",
      subcategoryName: "점심",
      assetName: "체크카드",
    });
  });

  test("내용을 비우면 소분류를 제목으로 쓴다", async ({ page, request, token }) => {
    const categoryId = await getCategories(request, token);
    const subcategoryId = await createItem(request, token, "/api/ledger/subcategories", {
      categoryId: categoryId("교통"),
      name: "지하철",
    });
    await addEntry(request, token, {
      entryDate: today(),
      amount: 1_500,
      categoryId: categoryId("교통"),
      subcategoryId,
    });

    await openLedger(page, token);
    await expect(
      page.getByRole("button", { name: /지하철.*교통 › 지하철/ })
    ).toBeVisible();
  });

  test("수정한 내용이 저장된다", async ({ page, request, token }) => {
    await addEntry(request, token, {
      entryDate: today(),
      amount: 1_000,
      memo: "고칠 기록",
    });
    await openLedger(page, token);
    await page.getByRole("button", { name: /고칠 기록/ }).click();

    const dialog = page.getByRole("dialog");
    await dialog.locator("#ledger-memo").fill("고친 기록");
    await dialog.locator("#ledger-amount").fill("2500");
    await dialog.getByRole("button", { name: "저장" }).click();

    await expect(page.getByText("기록을 수정했어요.")).toBeVisible();
    await expect(page.getByRole("button", { name: /고친 기록/ })).toContainText(
      "-2,500원"
    );
  });

  test("금액이 없으면 저장하지 않는다", async ({ page, request, token }) => {
    await openLedger(page, token);
    const dialog = await fillNewEntry(page, { amount: "", memo: "금액 없음" });
    await dialog.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText(/금액을 1원 이상/)).toBeVisible();
    expect((await getLedger(request, token)).entries).toHaveLength(0);
  });

  test("입력한 적 있는 내용을 추천하고 고르면 값을 채운다", async ({
    page,
    request,
    token,
  }) => {
    const categoryId = await getCategories(request, token);
    await addEntry(request, token, {
      entryDate: daysAgo(3),
      amount: 8_000,
      memo: "구내식당",
      categoryId: categoryId("식비"),
    });

    await openLedger(page, token);
    await page.getByRole("button", { name: "내역 추가" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /구내식당/ }).click();
    await expect(dialog.locator("#ledger-memo")).toHaveValue("구내식당");
    await expect(dialog.locator("#ledger-amount")).toHaveValue("8,000");
    await dialog.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("기록을 저장했어요.")).toBeVisible();

    const ledger = await getLedger(request, token);
    const created = ledger.entries.filter((entry) => entry.memo === "구내식당");
    expect(created.map((entry) => entry.categoryName)).toContain("식비");
    expect(
      created.length +
        (await getLedger(request, token, daysAgo(3).slice(0, 7))).entries.length
    ).toBeGreaterThanOrEqual(2);
  });

  test("내역 추가 날짜는 달력에서 고른 날이나 보고 있는 달을 따른다", async ({
    page,
    token,
  }) => {
    await openLedger(page, token);

    await page.getByRole("button", { name: "이전 달" }).click();
    await page.getByRole("button", { name: "내역 추가" }).first().click();
    await expect(page.getByRole("dialog").locator("#ledger-date")).toHaveAttribute(
      "data-value",
      `${lastMonth()}-01`
    );
    await page.getByRole("dialog").getByRole("button", { name: "취소" }).click();

    await page.getByRole("tab", { name: "달력" }).click();
    await page.getByRole("button", { name: /15일/ }).click();
    await page.getByRole("button", { name: "내역 추가" }).first().click();
    await expect(page.getByRole("dialog").locator("#ledger-date")).toHaveAttribute(
      "data-value",
      `${lastMonth()}-15`
    );
  });

  test("내역 창의 버튼 줄은 맨 아래에 붙고 입력칸이 그 뒤로 비치지 않는다", async ({
    page,
    request,
    token,
  }) => {
    await addEntry(request, token, {
      entryDate: today(),
      amount: 1_000,
      memo: "긴 내역",
    });
    await page.setViewportSize({ width: 390, height: 600 });
    await openLedger(page, token);
    await page.getByRole("button", { name: /긴 내역/ }).click();

    const dialog = page.getByRole("dialog");
    const footer = dialog
      .getByRole("button", { name: "저장" })
      .locator("xpath=ancestor::div[contains(@class,'border-t')][1]");
    const tags = dialog.locator("#ledger-tags");
    await tags.waitFor();

    const box = async (locator: typeof dialog) => {
      const value = await locator.boundingBox();
      if (!value) throw new Error("요소를 찾을 수 없습니다.");
      return value;
    };
    const measureGap = async () => {
      const [outer, bar] = await Promise.all([box(dialog), box(footer)]);
      return outer.y + outer.height - (bar.y + bar.height);
    };

    expect(Math.abs(await measureGap())).toBeLessThanOrEqual(1);
    await tags.scrollIntoViewIfNeeded();
    const [field, bar] = await Promise.all([box(tags), box(footer)]);
    expect(field.y + field.height).toBeLessThanOrEqual(bar.y + 1);
    expect(Math.abs(await measureGap())).toBeLessThanOrEqual(1);
  });

  test("삭제 후 되돌리기와 변경 이력", async ({ page, request, token }) => {
    await addEntry(request, token, {
      entryDate: today(),
      amount: 9_000,
      memo: "지울 기록",
    });
    await openLedger(page, token);

    const remove = async () => {
      await page.getByRole("button", { name: /지울 기록/ }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: "삭제" }).click();
      await dialog.getByRole("button", { name: "지우기" }).click();
    };

    await remove();
    await expect(page.getByRole("button", { name: /지울 기록/ })).toHaveCount(0);
    await page.getByRole("button", { name: "되돌리기" }).click();
    await expect(page.getByRole("button", { name: /지울 기록/ })).toBeVisible();

    await remove();
    await expect(page.getByRole("button", { name: /지울 기록/ })).toHaveCount(0);
    const dialog = await openSettingsTab(page, "기록");
    await expect(dialog.getByText(/삭제 · 지울 기록/).first()).toBeVisible();
    await expect(dialog.getByText(/복구 · 지울 기록/)).toBeVisible();
    await expect(dialog.getByText(/추가 · 지울 기록/)).toBeVisible();
    await dialog.getByRole("button", { name: "되돌리기" }).click();

    await expect
      .poll(async () => (await getLedger(request, token)).entries.length)
      .toBe(1);
  });

  test("다른 기기에서 입력한 내역이 새로고침 없이 나타난다", async ({
    page,
    request,
    token,
  }) => {
    await openLedger(page, token);
    await addEntry(request, token, {
      entryDate: today(),
      amount: 7_000,
      memo: "다른 기기 기록",
    });
    await expect(page.getByRole("button", { name: /다른 기기 기록/ })).toBeVisible({
      timeout: 40_000,
    });
  });

  test("없는 날짜와 잘못된 달은 거부한다", async ({ request, token }) => {
    const entry = await request.post("/api/ledger/entries", {
      headers: authHeaders(token),
      data: { entryDate: "2026-02-31", kind: "expense", amount: 1_000 },
    });
    expect(entry.status()).toBe(400);

    const budget = await request.put("/api/ledger/budget", {
      headers: authHeaders(token),
      data: { month: "2026-13", totalBudget: 1_000 },
    });
    expect(budget.status()).toBe(400);
  });

  test("알림 붙여넣기: 미리보고 등록하며, 다시 붙이면 건너뛴다", async ({
    page,
    request,
    token,
  }) => {
    await openLedger(page, token);
    const text = `${today().slice(5).replace("-", "/")} 15:52 출금 4,500원 스타벅스\n\n입금 50,000원 홍길동`;

    const paste = async () => {
      await page.getByRole("button", { name: "알림 붙여넣기" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("textbox", { name: "은행 알림 내용" }).fill(text);
      await expect(dialog.getByText("2건을 찾았어요")).toBeVisible();
      await dialog.getByRole("button", { name: "2건 등록" }).click();
    };

    await paste();
    await expect(page.getByText("2건 등록했어요.")).toBeVisible();
    await expect(page.getByRole("button", { name: /스타벅스/ })).toContainText("카페");

    await paste();
    await expect(page.getByText(/0건 등록, 이미 있는 2건/)).toBeVisible();
    expect((await getLedger(request, token)).entries).toHaveLength(2);
  });
});

test.describe("내역 탭", () => {
  test("분류로 거르고 달을 옮겨도 유지된다", async ({ page, request, token }) => {
    const categoryId = await getCategories(request, token);
    const add = (entryDate: string, amount: number, memo: string, name: string) =>
      addEntry(request, token, {
        entryDate,
        amount,
        memo,
        categoryId: categoryId(name),
      });
    await add(today(), 9_000, "점심", "식비");
    await add(today(), 8_000, "저녁", "식비");
    await add(today(), 5_000, "커피", "카페");
    await add(`${lastMonth()}-15`, 7_000, "지난달 밥", "식비");
    await addEntry(request, token, {
      entryDate: today(),
      kind: "income",
      amount: 50_000,
      memo: "충전",
    });

    await openLedger(page, token);
    const chips = page.getByRole("group", { name: "내역 분류" });
    await expect(page.getByRole("button", { name: /커피/ })).toBeVisible();
    await expect(
      chips.getByRole("button", { name: "전체", exact: true })
    ).toHaveAttribute("aria-pressed", "true");

    await chips.getByRole("button", { name: "식비", exact: true }).click();
    await expect(page.getByRole("button", { name: /점심/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /저녁/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /커피/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /충전/ })).toHaveCount(0);
    await expect(page.getByText(/식비 2건 · 지출 17,000원/)).toBeVisible();

    await page.getByRole("button", { name: "이전 달" }).click();
    await expect(page.getByRole("button", { name: /지난달 밥/ })).toBeVisible();
    await expect(page.getByText(/식비 1건 · 지출 7,000원/)).toBeVisible();

    await chips.getByRole("button", { name: "카페", exact: true }).click();
    await expect(page.getByText(/에는 카페 내역이 없어요/)).toBeVisible();

    await page.getByRole("searchbox", { name: "내역 검색" }).fill("커피");
    await expect(chips).toHaveCount(0);
    await expect(page.getByRole("button", { name: /커피/ })).toBeVisible();
    await page.getByRole("searchbox", { name: "내역 검색" }).fill("");

    await chips.getByRole("button", { name: "전체", exact: true }).click();
    await page.getByRole("button", { name: "다음 달" }).click();
    await expect(page.getByRole("button", { name: /충전/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /커피/ })).toBeVisible();
  });

  test("분류 필터에 이체는 나오지 않는다", async ({ page, request, token }) => {
    const categoryId = await getCategories(request, token);
    const savingsId = await createSavings(request, token, "비상금");
    await addEntry(request, token, {
      entryDate: today(),
      amount: 9_000,
      memo: "밥",
      categoryId: categoryId("식비"),
    });
    await addEntry(request, token, {
      entryDate: today(),
      kind: "transfer",
      amount: 100_000,
      savingsId,
    });

    await openLedger(page, token);
    await expect(page.getByRole("button", { name: /비상금/ })).toBeVisible();
    await page
      .getByRole("group", { name: "내역 분류" })
      .getByRole("button", { name: "식비", exact: true })
      .click();
    await expect(page.getByRole("button", { name: /비상금/ })).toHaveCount(0);
    await expect(page.getByText(/식비 1건 · 지출 9,000원/)).toBeVisible();
  });

  test("행 구분선은 곧은 선이고 마지막 행에는 없다", async ({ page, request, token }) => {
    await addEntry(request, token, {
      entryDate: today(),
      amount: 1_000,
      memo: "첫 내역",
    });
    await addEntry(request, token, {
      entryDate: today(),
      amount: 2_000,
      memo: "둘째 내역",
    });

    await openLedger(page, token);
    const row = page.getByRole("button", { name: /첫 내역/ });
    await row.hover();

    const style = await row.evaluate((element) => {
      const computed = getComputedStyle(element);
      return { border: computed.borderBottomWidth, shadow: computed.boxShadow };
    });
    expect(style.border).toBe("0px");
    expect(style.shadow).toBe("none");

    const dividers = await row.evaluate((element) =>
      [...element.parentElement!.parentElement!.children].map((cell) => {
        const divider = getComputedStyle(cell, "::after");
        return { height: divider.height, left: divider.left };
      })
    );
    expect(dividers).toEqual([
      { height: "1px", left: "56px" },
      { height: "auto", left: "auto" },
    ]);
  });

  test("검색은 다른 달의 내용·태그·분류까지 찾는다", async ({ page, request, token }) => {
    const categoryId = await getCategories(request, token);
    await addEntry(request, token, {
      entryDate: daysAgo(90),
      amount: 8_000,
      memo: "강릉 물회",
      tags: "여행",
      categoryId: categoryId("식비"),
    });
    await addEntry(request, token, { entryDate: today(), amount: 1_000, memo: "버스" });

    await openLedger(page, token);
    const search = page.getByRole("searchbox", { name: "내역 검색" });

    await search.fill("물회");
    await expect(page.getByRole("button", { name: /강릉 물회/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /버스/ })).toHaveCount(0);
    await expect(page.getByText(/1건 · 지출 8,000원/)).toBeVisible();

    await search.fill("여행");
    await expect(page.getByRole("button", { name: /강릉 물회/ })).toBeVisible();

    await search.fill("없는말");
    await expect(page.getByText("일치하는 내역이 없어요")).toBeVisible();

    await search.fill("");
    await expect(page.getByRole("button", { name: /버스/ })).toBeVisible();
  });

  test("지난달을 볼 때 '이번 달' 문구를 쓰지 않는다", async ({ page, token }) => {
    await openLedger(page, token);
    await page.getByRole("button", { name: "이전 달" }).click();
    await expect(page.getByText("이번 달 지출")).toHaveCount(0);
    const [year, month] = lastMonth().split("-");
    await expect(page.getByText(`${year}년 ${Number(month)}월 지출`)).toBeVisible();
  });

  test("모바일 폭에서 가로 스크롤이 생기지 않는다", async ({ page, request, token }) => {
    await addEntry(request, token, {
      entryDate: daysAgo(8),
      amount: 1_000_000,
      memo: "지난주 큰 지출",
    });
    await addEntry(request, token, {
      entryDate: today(),
      amount: 1_000_000,
      memo: "큰 지출",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await openLedger(page, token);
    for (const name of ["내역", "달력", "통계", "저축"]) {
      await page.getByRole("tab", { name }).click();
      await page.waitForTimeout(300);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow, name).toBeLessThanOrEqual(0);
    }
  });
});

/** 지난 월~일 주와 그 전 주. */
const lastWeek = () => {
  const from = shiftWeek(weekStartOf(today()), -1);
  return { from, to: weekEndOf(from), previousFrom: shiftWeek(from, -1) };
};

/** 내역을 주 단위로 바꾸고 지난주로 간다. */
const showLastWeek = async (page: Page) => {
  await page
    .getByRole("group", { name: "기간 단위" })
    .getByRole("button", { name: "주" })
    .click();
  await page.getByRole("button", { name: "이전 주" }).click();
};

test.describe("기간 리캡", () => {
  test("주별 리캡: 합계·전주 대비·큰 지출·예산을 보여 주고 이체와 입금은 빼고 센다", async ({
    page,
    request,
    token,
  }) => {
    const week = lastWeek();
    const savingsId = await createSavings(request, token, "적금");
    await request.put("/api/ledger/budget", {
      headers: authHeaders(token),
      data: {
        month: weekMonth(week.from),
        totalBudget: 100_000_000,
        note: "",
        categories: [],
      },
    });
    for (const [amount, memo] of [
      [30_000, "제일 큰 지출"],
      [20_000, "두번째 지출"],
      [10_000, "세번째 지출"],
      [5_000, "작은 지출"],
    ] as const) {
      await addEntry(request, token, { entryDate: week.from, amount, memo });
    }
    await addEntry(request, token, {
      entryDate: week.to,
      kind: "income",
      amount: 99_000,
      memo: "입금",
    });
    await addEntry(request, token, {
      entryDate: week.to,
      kind: "transfer",
      amount: 500_000,
      savingsId,
      memo: "지난주 적금",
    });
    await addEntry(request, token, {
      entryDate: week.previousFrom,
      amount: 40_000,
      memo: "그 전 주",
    });

    await openLedger(page, token);
    await showLastWeek(page);
    const card = page.getByRole("region", { name: "주별 리캡" });
    await expect(page.getByRole("region", { name: "월별 리캡" })).toHaveCount(0);
    await expect(card.getByText("65,000원", { exact: false }).first()).toBeVisible();
    await expect(card.getByText("4건")).toBeVisible();
    await expect(card.getByText("전주보다 25,000원 더 썼어요")).toBeVisible();
    await expect(card.getByRole("listitem")).toHaveCount(3);
    await expect(card.getByRole("listitem").first()).toContainText("제일 큰 지출");
    await expect(card.getByText("작은 지출")).toHaveCount(0);
    await expect(card.getByText("지난주 적금")).toHaveCount(0);
    await expect(card.getByText(/예산 안/)).toBeVisible();
    await expect(
      card.getByText(`${shortDay(week.from)} ~ ${shortDay(week.to)}`)
    ).toBeVisible();

    await openStats(page);
    await expect(card).toBeHidden();
    await page.getByRole("tab", { name: "저축" }).click();
    await expect(card).toBeHidden();
    await page.getByRole("tab", { name: "달력" }).click();
    await expect(card).toBeVisible();
    await page.getByRole("tab", { name: "내역" }).click();

    // 주를 옮기면 리캡도 그 주 것으로 바뀐다.
    await page.getByRole("button", { name: "이전 주" }).click();
    await expect(card.getByText("40,000원", { exact: false }).first()).toBeVisible();
    await expect(card.getByText("전주에는 지출 기록이 없어요")).toBeVisible();
    await expect(card.getByRole("listitem").first()).toContainText("그 전 주");
    await page.getByRole("button", { name: "다음 주" }).click();
    await expect(card.getByText("전주보다 25,000원 더 썼어요")).toBeVisible();
    // 이번 주는 아직 지출이 없어 카드를 띄우지 않는다.
    await page.getByRole("button", { name: "이번 주" }).click();
    await expect(card).toHaveCount(0);

    await addEntry(request, token, {
      entryDate: week.to,
      amount: 1_000,
      memo: "뒤늦은 기록",
    });
    await page.reload();
    await showLastWeek(page);
    await expect(card.getByText("전주보다 26,000원 더 썼어요")).toBeVisible();
  });

  test("월별 리캡: 고른 달을 따라가고 진행 중인 달은 지난달 같은 기간과 비교한다", async ({
    page,
    request,
    token,
  }) => {
    const twoMonthsAgo = kst().subtract(2, "month").format("YYYY-MM");
    await addEntry(request, token, {
      entryDate: today(),
      amount: 5_000,
      memo: "이번 달",
    });
    await addEntry(request, token, {
      entryDate: `${lastMonth()}-01`,
      amount: 30_000,
      memo: "지난달 큰 지출",
    });
    await addEntry(request, token, {
      entryDate: `${twoMonthsAgo}-01`,
      amount: 10_000,
      memo: "지지난달",
    });

    await openLedger(page, token);
    const card = page.getByRole("region", { name: "월별 리캡" });
    await expect(card.getByText("5,000원", { exact: false }).first()).toBeVisible();
    await expect(card.getByText("지난달 같은 기간보다 25,000원 덜 썼어요")).toBeVisible();
    await expect(
      card.getByText(`${shortDay(`${thisMonth()}-01`)} ~ ${shortDay(today())}`)
    ).toBeVisible();

    await page.getByRole("button", { name: "이전 달" }).click();
    await expect(card.getByText("30,000원", { exact: false }).first()).toBeVisible();
    await expect(card.getByText("지난달보다 20,000원 더 썼어요")).toBeVisible();
    await expect(card.getByRole("listitem").first()).toContainText("지난달 큰 지출");
    await expect(
      card.getByText(
        `${shortDay(`${lastMonth()}-01`)} ~ ${shortDay(
          kst(`${lastMonth()}-01`).endOf("month").format("YYYY-MM-DD")
        )}`
      )
    ).toBeVisible();

    await page.getByRole("button", { name: "이번 달" }).click();
    await expect(card.getByText("지난달 같은 기간보다 25,000원 덜 썼어요")).toBeVisible();
    await page
      .getByRole("group", { name: "기간 단위" })
      .getByRole("button", { name: "주" })
      .click();
    await expect(card).toHaveCount(0);
    await expect(page.getByRole("region", { name: "주별 리캡" })).toBeVisible();
  });

  test("내용이 빈 내역은 소분류나 분류 이름으로 보여 준다", async ({
    page,
    request,
    token,
  }) => {
    const week = lastWeek();
    const categoryId = await getCategories(request, token);
    const subcategoryId = await createItem(request, token, "/api/ledger/subcategories", {
      categoryId: categoryId("교통"),
      name: "택시",
    });
    await addEntry(request, token, {
      entryDate: week.from,
      amount: 15_000,
      categoryId: categoryId("교통"),
      subcategoryId,
    });
    await addEntry(request, token, {
      entryDate: week.from,
      amount: 9_000,
      categoryId: categoryId("식비"),
    });

    await openLedger(page, token);
    await showLastWeek(page);
    const items = page.getByRole("region", { name: "주별 리캡" }).getByRole("listitem");
    await expect(items.first()).toContainText("택시");
    await expect(items.nth(1)).toContainText("식비");
  });

  test("전주 기록이 없으면 그렇게 안내한다", async ({ page, request, token }) => {
    const week = lastWeek();
    await addEntry(request, token, { entryDate: week.to, amount: 3_000, memo: "지난주" });
    await openLedger(page, token);
    await showLastWeek(page);
    await expect(
      page
        .getByRole("region", { name: "주별 리캡" })
        .getByText("전주에는 지출 기록이 없어요")
    ).toBeVisible();
  });

  test("기간에 지출이 없으면 카드를 띄우지 않는다", async ({ page, request, token }) => {
    await addEntry(request, token, {
      entryDate: today(),
      kind: "income",
      amount: 50_000,
      memo: "오늘 입금",
    });
    await openLedger(page, token);
    await expect(page.getByRole("button", { name: /오늘 입금/ }).first()).toBeVisible();
    await expect(page.getByRole("region", { name: "월별 리캡" })).toHaveCount(0);
    await page
      .getByRole("group", { name: "기간 단위" })
      .getByRole("button", { name: "주" })
      .click();
    await expect(page.getByRole("button", { name: /오늘 입금/ }).first()).toBeVisible();
    await expect(page.getByRole("region", { name: "주별 리캡" })).toHaveCount(0);
  });
});

test.describe("통계", () => {
  test("사용 금액 추이: 일별과 누적을 보고 지점을 고를 수 있다", async ({
    page,
    request,
    token,
  }) => {
    await addEntry(request, token, {
      entryDate: daysAgo(2),
      amount: 30_000,
      memo: "그저께",
    });
    await addEntry(request, token, {
      entryDate: daysAgo(1),
      amount: 10_000,
      memo: "어제",
    });
    await addEntry(request, token, {
      entryDate: daysAgo(1),
      kind: "income",
      amount: 99_000,
      memo: "입금",
    });

    await openLedger(page, token);
    await openStats(page);
    await reportPeriod(page)
      .getByRole("button", { name: "최근 7일", exact: true })
      .click();

    const peakReadout = page.locator("p", {
      hasText: `최고 ${shortDay(daysAgo(2))} · 30,000원`,
    });
    await expect(page.getByText("사용 금액 추이", { exact: true })).toBeVisible();
    await expect(peakReadout).toBeVisible();

    const chart = page.getByRole("img", { name: /^사용 금액 추이, 일별/ });
    await chart.scrollIntoViewIfNeeded();
    const box = await chart.boundingBox();
    if (!box) throw new Error("사용 금액 그래프를 찾지 못했어요.");
    await page.mouse.move(box.x + box.width - 11, box.y + box.height / 2);
    await expect(page.getByText(`${shortDay(today())} · 0원`)).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(peakReadout).toBeVisible();

    await page
      .getByRole("group", { name: "사용 금액 보기" })
      .getByRole("button", { name: "누적" })
      .click();
    await expect(page.getByText("합계 40,000원", { exact: true })).toBeVisible();
    await expect(page.getByRole("img", { name: /^사용 금액 추이, 누적/ })).toBeVisible();
  });

  test("사용 금액 추이에 저축 이체는 들어가지 않는다", async ({
    page,
    request,
    token,
  }) => {
    const savingsId = await createSavings(request, token, "적금");
    await addEntry(request, token, { entryDate: today(), amount: 12_000, memo: "지출" });
    await addEntry(request, token, {
      entryDate: today(),
      kind: "transfer",
      amount: 300_000,
      savingsId,
    });

    const res = await request.get(`/api/ledger/stats?from=${today()}&to=${today()}`, {
      headers: authHeaders(token),
    });
    const { stats } = await res.json();
    expect(stats.daily).toHaveLength(1);
    expect(stats.daily[0].spent).toBe(12_000);
    expect(stats.summary.expense).toBe(12_000);

    await openLedger(page, token);
    await openStats(page);
    await expect(page.getByRole("img", { name: /합계 12,000원/ })).toBeVisible();
  });

  test("사용 금액 추이: 지출이 없는 기간은 빈 안내를 보여 준다", async ({
    page,
    request,
    token,
  }) => {
    await addEntry(request, token, {
      entryDate: today(),
      kind: "income",
      amount: 5_000,
      memo: "입금만",
    });
    await openLedger(page, token);
    await openStats(page);
    await expect(page.getByText("이 기간에는 사용 금액이 없어요")).toBeVisible();
  });

  test("잔액 추이 그래프: 기준 잔액부터 입금·지출·이체를 반영해 그린다", async ({
    page,
    request,
    token,
  }) => {
    const savingsId = await createSavings(request, token, "적금");
    await request.put("/api/ledger/account", {
      headers: authHeaders(token),
      data: { openingBalance: 100_000 },
    });
    await addEntry(request, token, {
      entryDate: daysAgo(2),
      amount: 20_000,
      memo: "지출",
    });
    await addEntry(request, token, {
      entryDate: daysAgo(1),
      kind: "income",
      amount: 50_000,
      memo: "입금",
    });
    await addEntry(request, token, {
      entryDate: today(),
      kind: "transfer",
      amount: 30_000,
      savingsId,
    });

    await openLedger(page, token);
    await openStats(page);
    await reportPeriod(page)
      .getByRole("button", { name: "최근 7일", exact: true })
      .click();

    const chart = page.getByRole("img", { name: "기간 잔액 추이" });
    await chart.scrollIntoViewIfNeeded();
    await expect(page.getByText("시작 잔액부터 누적")).toBeVisible();
    await expect(chart.locator("circle")).toHaveCount(1);
    await expect(chart.locator("circle title")).toHaveText(
      /입금 50,000원 · 잔액 130,000원/
    );

    const box = await chart.boundingBox();
    if (!box) throw new Error("잔액 그래프를 찾지 못했어요.");
    await page.mouse.move(box.x + box.width - 11, box.y + box.height / 2);
    await expect(page.getByText(`${shortDay(today())} · 100,000원`)).toBeVisible();
  });

  test("잔액 추이: 기간을 잘라도 실제 잔액부터 이어진다", async ({ request, token }) => {
    await request.put("/api/ledger/account", {
      headers: authHeaders(token),
      data: { openingBalance: 100_000 },
    });
    await addEntry(request, token, {
      entryDate: daysAgo(30),
      amount: 20_000,
      memo: "예전",
    });
    await addEntry(request, token, {
      entryDate: daysAgo(2),
      amount: 5_000,
      memo: "최근",
    });

    const res = await request.get(`/api/ledger/stats?from=${daysAgo(6)}&to=${today()}`, {
      headers: authHeaders(token),
    });
    const { stats } = await res.json();
    expect(stats.daily[0].balance).toBe(80_000);
    expect(stats.daily.at(-1).balance).toBe(75_000);
  });

  test("내역을 추가하면 통계가 바로 갱신된다", async ({ page, request, token }) => {
    await addEntry(request, token, {
      entryDate: today(),
      amount: 10_000,
      memo: "첫 지출",
    });
    await openLedger(page, token);
    await openStats(page);
    await expect(page.getByText("총 지출 · 1건")).toBeVisible();

    const dialog = await fillNewEntry(page, { amount: "5000", memo: "두번째" });
    await dialog.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("총 지출 · 2건")).toBeVisible({ timeout: 5_000 });
  });

  test("기간 설정은 기간별 리포트 안에 하나만 있다", async ({ page, request, token }) => {
    await addEntry(request, token, { entryDate: today(), amount: 1_000, memo: "지출" });
    await openLedger(page, token);
    await expect(page.getByRole("button", { name: "이전 달" })).toBeVisible();

    await openStats(page);
    await expect(page.getByText("기간별 리포트")).toBeVisible();
    await expect(page.getByRole("button", { name: "이전 달" })).toHaveCount(1);

    await reportPeriod(page).getByRole("button", { name: "전체", exact: true }).click();
    await expect(page.getByRole("button", { name: "이전 달" })).toHaveCount(0);

    await page.getByRole("tab", { name: "내역" }).click();
    await expect(page.getByRole("button", { name: "이전 달" })).toBeVisible();
  });

  test("리포트는 월별이 기본이고 달을 넘겨 볼 수 있다", async ({
    page,
    request,
    token,
  }) => {
    await addEntry(request, token, {
      entryDate: today(),
      amount: 10_000,
      memo: "이번달 지출",
    });
    await addEntry(request, token, {
      entryDate: `${lastMonth()}-15`,
      amount: 3_000,
      memo: "지난달 지출",
    });

    await openLedger(page, token);
    await openStats(page);

    await expect(
      reportPeriod(page).getByRole("button", { name: "월별", exact: true })
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("총 지출 · 1건")).toBeVisible();
    await expect(page.getByRole("button", { name: /이번달 지출/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /지난달 지출/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "다음 달" })).toBeDisabled();

    await page.getByRole("button", { name: "이전 달" }).click();
    await expect(page.getByRole("button", { name: /지난달 지출/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /이번달 지출/ })).toHaveCount(0);
  });

  test("평소와 다른 지출과 저축·고정비 비중을 이번 달 리포트에 보여 준다", async ({
    page,
    request,
    token,
  }) => {
    const categoryId = await getCategories(request, token);
    const food = categoryId("식비");
    const savingsId = await createSavings(request, token, "인사이트 적금");
    const monthsAgo = (n: number) => kst().subtract(n, "month").format("YYYY-MM");

    for (const m of [monthsAgo(3), monthsAgo(2), monthsAgo(1)]) {
      await addEntry(request, token, {
        entryDate: `${m}-01`,
        amount: 20_000,
        categoryId: food,
      });
      await addEntry(request, token, {
        entryDate: `${m}-01`,
        amount: 20_000,
        categoryId: food,
      });
      await addEntry(request, token, {
        entryDate: `${m}-01`,
        amount: 55_000,
        memo: "통신비",
      });
    }
    const month = thisMonth();
    await addEntry(request, token, {
      entryDate: `${month}-01`,
      amount: 300_000,
      categoryId: food,
      memo: "팀 회식",
    });
    await addEntry(request, token, {
      entryDate: `${month}-01`,
      amount: 55_000,
      memo: "통신비",
    });
    await addEntry(request, token, {
      entryDate: `${month}-01`,
      kind: "transfer",
      amount: 300_000,
      savingsId,
    });

    await openLedger(page, token);
    await openStats(page);

    const unusual = page.getByTestId("unusual-spend-card");
    await expect(unusual.getByText("평소와 다른 지출")).toBeVisible();
    await expect(unusual.getByText("전체 지출이 평소보다")).toBeVisible();
    const categories = unusual.getByRole("list", { name: "평소와 다른 분류" });
    await expect(categories.getByText("식비")).toBeVisible();
    await expect(categories.getByText("+260,000원")).toBeVisible();
    await expect(categories.getByText("7.5배")).toBeVisible();

    const big = unusual.getByRole("list", { name: "유난히 큰 내역" });
    await expect(big.getByText("팀 회식")).toBeVisible();
    await expect(big.getByText("식비 평소 20,000원의 15배")).toBeVisible();
    await big.getByRole("button", { name: /팀 회식/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");

    const savings = page.getByTestId("savings-card");
    // 300,000 / (355,000 + 300,000), 55,000 / 355,000
    await expect(savings.getByText("45.8%")).toBeVisible();
    await expect(savings.getByText("15.5%")).toBeVisible();
    const fixed = savings.getByRole("list", { name: "이 달의 고정비" });
    await expect(fixed.getByText("통신비")).toBeVisible();
    await expect(fixed.getByText("매달 나감")).toBeVisible();
    await expect(
      savings.getByRole("img", { name: "월별 저축·고정비 비중" })
    ).toBeVisible();

    // 주별 리포트에서는 달 단위 인사이트를 띄우지 않는다.
    await reportPeriod(page).getByRole("button", { name: "주별", exact: true }).click();
    await expect(page.getByTestId("unusual-spend-card")).toHaveCount(0);
    await expect(page.getByTestId("savings-card")).toHaveCount(0);
  });

  test("이전 기록이 부족하면 평소와 비교하지 않는다고 안내한다", async ({
    page,
    request,
    token,
  }) => {
    await addEntry(request, token, {
      entryDate: today(),
      amount: 10_000,
      memo: "첫 기록",
    });
    const res = await request.get(`/api/ledger/insights?month=${thisMonth()}`, {
      headers: authHeaders(token),
    });
    expect(res.ok()).toBe(true);
    expect((await res.json()).insights.unusual.total).toBeNull();

    const bad = await request.get("/api/ledger/insights?month=2026-13", {
      headers: authHeaders(token),
    });
    expect(bad.status()).toBe(400);

    await openLedger(page, token);
    await openStats(page);
    await expect(
      page.getByText("이전 기록이 3개월 이상 쌓이면 평소와 비교해 드려요")
    ).toBeVisible();
  });

  test("입금은 분류로 나누지 않는다", async ({ page, request, token }) => {
    await addEntry(request, token, {
      entryDate: today(),
      kind: "income",
      amount: 50_000,
      memo: "월급",
    });
    await addEntry(request, token, { entryDate: today(), amount: 1_000, memo: "지출" });
    await openLedger(page, token);
    await expect(page.getByRole("button", { name: /월급/ })).not.toContainText(
      "분류 없음"
    );

    await page.getByRole("button", { name: "내역 추가" }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "식비", exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "입금", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "식비", exact: true })).toHaveCount(
      0
    );
    await expect(dialog.getByRole("button", { name: "급여", exact: true })).toHaveCount(
      0
    );
  });

  test("전체 탭과 큰 지출 TOP 8에서 분류로 거를 수 있다", async ({
    page,
    request,
    token,
  }) => {
    const categoryId = await getCategories(request, token);
    const add = (amount: number, memo: string, name: string) =>
      addEntry(request, token, {
        entryDate: today(),
        amount,
        memo,
        categoryId: categoryId(name),
      });
    await add(9_000, "점심", "식비");
    await add(8_000, "저녁", "식비");
    await add(5_000, "커피", "카페");
    await addEntry(request, token, {
      entryDate: today(),
      kind: "income",
      amount: 50_000,
      memo: "충전",
    });

    await openLedger(page, token);
    await openStats(page);

    const chips = page.getByRole("group", { name: "지출·입금 내역 분류" });
    await chips.getByRole("button", { name: "식비", exact: true }).click();
    await expect(page.getByRole("button", { name: /점심/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /커피/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /충전/ })).toHaveCount(0);
    await expect(page.getByText("2건 · 지출 17,000원 · 입금 0원")).toBeVisible();

    await chips.getByRole("button", { name: "전체", exact: true }).click();
    await expect(page.getByRole("button", { name: /충전/ })).toBeVisible();

    const top = page.getByRole("list", { name: "큰 지출 목록" });
    await expect(top).toContainText("점심");
    await expect(top).toContainText("커피");
    await page
      .getByRole("group", { name: "큰 지출 분류" })
      .getByRole("button", { name: "카페", exact: true })
      .click();
    await expect(top).toContainText("커피");
    await expect(top).not.toContainText("점심");
  });

  test("통계 내역은 10건만 먼저 보여 주고 더 보기로 펼친다", async ({
    page,
    request,
    token,
  }) => {
    for (let index = 0; index < 13; index += 1) {
      await addEntry(request, token, {
        entryDate: today(),
        amount: 1_000 + index,
        memo: `반복 지출 ${index}`,
      });
    }
    await openLedger(page, token);
    await openStats(page);

    const rows = page.getByRole("button", { name: /반복 지출/ });
    await expect(rows).toHaveCount(10);
    await page.getByRole("button", { name: /더 보기 · 3건 남음/ }).click();
    await expect(rows).toHaveCount(13);
    await page.getByRole("button", { name: "접기" }).click();
    await expect(rows).toHaveCount(10);
  });

  test("통계 내역은 날짜순이 기본이고 금액 기준으로 바꿔 정렬할 수 있다", async ({
    page,
    request,
    token,
  }) => {
    await addEntry(request, token, {
      entryDate: daysAgo(2),
      amount: 5_000,
      memo: "정렬 가",
    });
    await addEntry(request, token, {
      entryDate: daysAgo(1),
      amount: 1_000,
      memo: "정렬 나",
    });
    await addEntry(request, token, {
      entryDate: today(),
      amount: 3_000,
      memo: "정렬 다",
    });
    await openLedger(page, token);
    await openStats(page);

    const rows = page.getByRole("button", { name: /정렬 [가나다]/ });
    const memos = async () =>
      (await rows.allTextContents()).map((text) => text.match(/정렬 ./)?.[0]);
    await expect(rows).toHaveCount(3);
    expect(await memos()).toEqual(["정렬 다", "정렬 나", "정렬 가"]);

    await page.getByRole("button", { name: "정렬 방향: 최신순" }).click();
    await expect(page.getByRole("button", { name: "정렬 방향: 오래된순" })).toBeVisible();
    expect(await memos()).toEqual(["정렬 가", "정렬 나", "정렬 다"]);

    await page
      .getByRole("group", { name: "정렬 기준" })
      .getByRole("button", { name: "금액", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "정렬 방향: 큰 금액순" })
    ).toBeVisible();
    expect(await memos()).toEqual(["정렬 가", "정렬 다", "정렬 나"]);

    await page.getByRole("button", { name: "정렬 방향: 큰 금액순" }).click();
    await expect(
      page.getByRole("button", { name: "정렬 방향: 작은 금액순" })
    ).toBeVisible();
    expect(await memos()).toEqual(["정렬 나", "정렬 다", "정렬 가"]);
  });

  test("통계 내역은 위쪽 기간을 따르고 눌러서 수정할 수 있다", async ({
    page,
    request,
    token,
  }) => {
    await addEntry(request, token, {
      entryDate: daysAgo(40),
      amount: 1_000,
      memo: "옛 지출",
    });
    await addEntry(request, token, {
      entryDate: today(),
      amount: 2_000,
      memo: "오늘 지출",
    });

    await openLedger(page, token);
    await openStats(page);
    await expect(page.getByRole("button", { name: /옛 지출/ })).toHaveCount(0);
    await reportPeriod(page).getByRole("button", { name: "전체", exact: true }).click();
    await expect(page.getByRole("button", { name: /옛 지출/ })).toBeVisible();

    await reportPeriod(page).getByRole("button", { name: "최근 7일" }).click();
    await expect(page.getByRole("button", { name: /옛 지출/ })).toHaveCount(0);

    await page.getByRole("button", { name: /오늘 지출/ }).click();
    await expect(page.getByRole("dialog").getByText("내역 수정")).toBeVisible();
    await expect(page.getByRole("dialog").locator("#ledger-memo")).toHaveValue(
      "오늘 지출"
    );
  });

  test("전월 대비와 이번 달 예상 지출을 보여 준다", async ({ page, request, token }) => {
    const categoryId = await getCategories(request, token);
    await addEntry(request, token, {
      entryDate: today(),
      amount: 10_000,
      memo: "이번 달 식사",
      categoryId: categoryId("식비"),
    });
    await addEntry(request, token, {
      entryDate: `${lastMonth()}-01`,
      amount: 3_000,
      memo: "지난달 식사",
      categoryId: categoryId("식비"),
    });
    await request.put("/api/ledger/budget", {
      headers: authHeaders(token),
      data: { month: thisMonth(), totalBudget: 5_000, note: "", categories: [] },
    });

    await openLedger(page, token);
    await openStats(page);

    await expect(page.getByText("전월 대비")).toBeVisible();
    await expect(page.getByText("+7,000원").first()).toBeVisible();
    await expect(page.getByRole("list", { name: "분류별 증감" })).toContainText("식비");
    await expect(page.getByText("이번 달 예상 지출")).toBeVisible();
    await expect(page.getByText(/초과 예상/)).toBeVisible();

    await page.getByRole("button", { name: "이전 달" }).click();
    await expect(page.getByText("비교할 지난달 기록이 없어요")).toBeVisible();
    await expect(page.getByText("이번 달 예상 지출")).toHaveCount(0);
  });

  test("1년이 넘는 기록도 통계가 열리고, 실패하면 다시 시도할 수 있다", async ({
    page,
    request,
    token,
  }) => {
    await addEntry(request, token, {
      entryDate: daysAgo(800),
      amount: 1_000,
      memo: "오래됨",
    });
    const res = await request.get("/api/ledger/stats", { headers: authHeaders(token) });
    expect(res.status()).toBe(200);

    await page.route("**/api/ledger/stats*", (route) =>
      route.fulfill({ status: 500, json: { error: "통계 실패" } })
    );
    await openLedger(page, token);
    await openStats(page);
    await expect(page.getByText("통계 실패")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "다시 불러오기" })).toBeVisible();
  });
});

test.describe("잔액", () => {
  test("실제 통장 잔액에 맞춘다", async ({ page, request, token }) => {
    await addEntry(request, token, { entryDate: today(), amount: 30_000, memo: "지출" });
    await addEntry(request, token, {
      entryDate: today(),
      kind: "income",
      amount: 100_000,
      memo: "입금",
    });
    await openLedger(page, token);
    const balance = page.getByRole("button", { name: /^잔액/ });
    await expect(balance).toContainText("70,000원");

    await balance.click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#ledger-actual").fill("75000");
    await expect(dialog.getByText(/가계부보다 5,000원 많아요/)).toBeVisible();
    await dialog.getByRole("button", { name: "맞추기" }).click();
    await expect(page.getByText("잔액을 저장했어요.")).toBeVisible();
    await page.keyboard.press("Escape");

    await expect(balance).toContainText("75,000원");
    await expect(balance).toContainText("통장과 맞춤");
    expect((await getLedger(request, token)).account.currentBalance).toBe(75_000);
  });
});

test.describe("저축과 이체", () => {
  test("상품을 만들고 이체하면 저축이 쌓이고 지출에는 넣지 않는다", async ({
    page,
    request,
    token,
  }) => {
    await request.put("/api/ledger/account", {
      headers: authHeaders(token),
      data: { openingBalance: 1_000_000 },
    });
    await openLedger(page, token);

    await page.getByRole("tab", { name: "저축" }).click();
    await expect(page.getByText("저축 상품이 아직 없어요")).toBeVisible();
    await page.getByRole("button", { name: "상품 추가" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.locator("#savings-name").fill("청년적금");
    await dialog.getByRole("button", { name: "저장" }).click();
    await expect(page.getByRole("heading", { name: "청년적금" })).toBeVisible();

    await page.getByRole("tab", { name: "내역" }).click();
    await page.getByRole("button", { name: "내역 추가" }).first().click();
    dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "이체", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "식비", exact: true })).toHaveCount(
      0
    );
    await dialog.locator("#ledger-amount").fill("300000");

    await dialog.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("이체할 저축 상품을 선택해 주세요.")).toBeVisible();

    await dialog.getByRole("button", { name: "청년적금", exact: true }).click();
    await dialog.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("기록을 저장했어요.")).toBeVisible();

    await expect(page.getByRole("button", { name: /이체 → 청년적금/ })).toContainText(
      "300,000원"
    );
    await expect(page.getByText("지출 0원 · 이체 300,000원")).toBeVisible();

    const ledger = await getLedger(request, token);
    expect(ledger.summary.expense).toBe(0);
    expect(ledger.account.currentBalance).toBe(700_000);

    await page.getByRole("tab", { name: "저축" }).click();
    await expect(page.getByText("저축한 금액")).toBeVisible();
    await expect(page.getByText("납입 1회", { exact: false })).toBeVisible();
    await expect(page.getByText("300,000원").first()).toBeVisible();
  });

  test("납입 내역이 있는 상품은 지울 수 없다", async ({ request, token }) => {
    const id = await createSavings(request, token, "지울 수 없는 상품");
    await addEntry(request, token, {
      entryDate: today(),
      kind: "transfer",
      amount: 10_000,
      savingsId: id,
    });
    const res = await request.delete("/api/ledger/savings", {
      headers: authHeaders(token),
      data: { id },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain("납입 내역 1건");
  });
});

test.describe("반복 거래", () => {
  const dayOfMonth = () => Number(today().slice(8));

  test("도래한 반복 거래를 한 번만 만들고, 지운 내역은 되살리지 않는다", async ({
    page,
    request,
    token,
  }) => {
    await createItem(request, token, "/api/ledger/recurring", {
      kind: "expense",
      amount: 17_000,
      memo: "넷플릭스",
      dayOfMonth: dayOfMonth(),
      startDate: today(),
    });

    await getLedger(request, token);
    const { entries } = await getLedger(request, token);
    expect(entries.filter((entry) => entry.memo === "넷플릭스")).toHaveLength(1);

    await openLedger(page, token);
    await expect(page.getByRole("button", { name: /넷플릭스/ })).toBeVisible();
    const dialog = await openMainTab(page, "반복");
    await expect(
      dialog.getByRole("button", { name: "넷플릭스 반복 삭제" })
    ).toBeVisible();

    await request.delete("/api/ledger/entries", {
      headers: authHeaders(token),
      data: { id: entries[0].id },
    });
    expect((await getLedger(request, token)).entries).toHaveLength(0);
  });

  test("매달 같은 날 같은 금액이면 반복 등록을 추천한다", async ({ request, token }) => {
    for (const months of [1, 2, 3]) {
      await addEntry(request, token, {
        entryDate: kst().subtract(months, "month").date(5).format("YYYY-MM-DD"),
        amount: 55_000,
        memo: "통신비",
      });
    }
    const res = await request.get("/api/ledger/recurring/candidates", {
      headers: authHeaders(token),
    });
    expect(res.ok()).toBe(true);
    expect(JSON.stringify(await res.json())).toContain("통신비");
  });
});

test.describe("예산", () => {
  test("속도 안내, 분류별 진행률, 지난달 예산 불러오기", async ({
    page,
    request,
    token,
  }) => {
    const categoryId = await getCategories(request, token);
    await request.put("/api/ledger/budget", {
      headers: authHeaders(token),
      data: {
        month: lastMonth(),
        totalBudget: 500_000,
        note: "",
        categories: [{ categoryId: categoryId("식비"), amount: 200_000 }],
      },
    });
    await request.put("/api/ledger/budget", {
      headers: authHeaders(token),
      data: {
        month: thisMonth(),
        totalBudget: 300_000,
        note: "",
        categories: [{ categoryId: categoryId("카페"), amount: 10_000 }],
      },
    });
    await addEntry(request, token, {
      entryDate: today(),
      amount: 12_000,
      memo: "커피",
      categoryId: categoryId("카페"),
    });

    await openLedger(page, token);
    await expect(page.getByText(/하루 약 .*원까지/)).toBeVisible();
    const categoryBudgets = page.getByRole("region", { name: "분류별 예산" });
    await expect(categoryBudgets).toContainText("카페");
    await expect(categoryBudgets).toContainText("2,000원 초과");

    const dialog = await openSettingsTab(page, "예산");
    await dialog.getByRole("button", { name: "지난달 예산 불러오기" }).click();
    await expect(dialog.locator("#ledger-total-budget")).toHaveValue("500,000");
    await expect(dialog.getByRole("textbox", { name: "식비 예산" })).toHaveValue(
      "200,000"
    );
    await expect(dialog.getByRole("textbox", { name: "카페 예산" })).toHaveValue("");
    await dialog.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("예산을 저장했어요.")).toBeVisible();

    const { budget } = await getLedger(request, token);
    expect(budget.totalBudget).toBe(500_000);
    expect(budget.byCategory.map((row) => row.amount)).toEqual([200_000]);
  });

  test("최근 평균을 참고하고 채울 수 있다", async ({ page, request, token }) => {
    const categoryId = await getCategories(request, token);
    await addEntry(request, token, {
      entryDate: `${lastMonth()}-10`,
      amount: 12_345,
      memo: "지난달 지출",
      categoryId: categoryId("식비"),
    });
    await openLedger(page, token);
    const dialog = await openSettingsTab(page, "예산");
    await expect(dialog.getByText(/최근 1개월 평균 지출 12,345원/)).toBeVisible();
    await dialog.getByRole("button", { name: "평균으로 채우기" }).click();
    await expect(dialog.locator("#ledger-total-budget")).toHaveValue("12,000");
    await expect(dialog.getByRole("textbox", { name: "식비 예산" })).toHaveValue(
      "12,000"
    );
  });

  test("저장하면 분류 예산을 통째로 교체한다", async ({ request, token }) => {
    const categoryId = await getCategories(request, token);
    const save = (categories: { categoryId: number; amount: number }[]) =>
      request.put("/api/ledger/budget", {
        headers: authHeaders(token),
        data: { month: thisMonth(), totalBudget: 1_000, note: "", categories },
      });

    expect((await save([{ categoryId: categoryId("식비"), amount: 100 }])).ok()).toBe(
      true
    );
    expect((await save([{ categoryId: categoryId("교통"), amount: 400 }])).ok()).toBe(
      true
    );

    const { budget } = await getLedger(request, token);
    expect(budget.byCategory.map((row) => row.amount)).toEqual([400]);
  });
});

test.describe("여행", () => {
  test("등록하고 기간 내역을 골라 연결한다", async ({ page, request, token }) => {
    const categoryId = await getCategories(request, token);
    await addEntry(request, token, {
      entryDate: today(),
      amount: 20_000,
      memo: "여행 저녁",
      categoryId: categoryId("식비"),
    });
    await addEntry(request, token, {
      entryDate: today(),
      amount: 5_000,
      memo: "일상 커피",
      categoryId: categoryId("카페"),
    });

    await openLedger(page, token);
    const dialog = await openMainTab(page, "여행");
    await dialog.getByRole("textbox", { name: "여행 이름" }).fill("춘천 여행");
    await pickDate(page, dialog.getByLabel("여행 시작일"), today());
    await pickDate(page, dialog.getByLabel("여행 종료일"), today());
    await dialog.getByRole("button", { name: "여행 추가" }).click();
    await expect(dialog.getByText("춘천 여행", { exact: true })).toBeVisible();

    await dialog.getByRole("button", { name: "기간 내역 연결" }).click();
    const candidates = dialog.getByRole("list", { name: "춘천 여행 연결 후보" });
    await candidates.getByRole("checkbox", { name: /일상 커피/ }).uncheck();
    await dialog.getByRole("button", { name: "1건 연결" }).click();
    await expect(dialog.getByText(/1건 · 20,000원/)).toBeVisible();

    const { entries } = await getLedger(request, token);
    const tripOf = (memo: string) => entries.find((e) => e.memo === memo)?.tripName;
    expect(tripOf("여행 저녁")).toBe("춘천 여행");
    expect(tripOf("일상 커피")).toBeNull();
  });

  test("리포트는 미리 결제한 내역까지 분류별로 보여 준다", async ({
    page,
    request,
    token,
  }) => {
    const categoryId = await getCategories(request, token);
    const tripId = await createTrip(request, token, "제주 여행", today(), today());
    await addEntry(request, token, {
      entryDate: daysAgo(40),
      amount: 150_000,
      memo: "제주 항공권",
      categoryId: categoryId("항공"),
      tripId,
    });
    await addEntry(request, token, {
      entryDate: today(),
      amount: 30_000,
      memo: "흑돼지",
      categoryId: categoryId("식비"),
    });
    await addEntry(request, token, {
      entryDate: daysAgo(40),
      amount: 9_000,
      memo: "관계없는 지출",
      categoryId: categoryId("식비"),
    });

    await openLedger(page, token);
    await openStats(page);
    await reportPeriod(page).getByRole("button", { name: "여행", exact: true }).click();

    await expect(page.getByText("제주 여행 총 지출")).toBeVisible();
    await expect(page.getByText("180,000원").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /제주 항공권/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /흑돼지/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /관계없는 지출/ })).toHaveCount(0);
    await expect(page.getByText("잔액 추이", { exact: true })).toHaveCount(0);
    await expect(page.getByText("사용 금액 추이", { exact: true })).toHaveCount(0);
    await expect(page.getByText("전월 대비")).toHaveCount(0);
  });

  test("내역 입력에서 날짜로 여행을 추천하고 해제할 수 있다", async ({
    page,
    request,
    token,
  }) => {
    await createTrip(request, token, "제주 여행", today(), today());
    await openLedger(page, token);

    const dialog = await fillNewEntry(page, { amount: "1000", memo: "여행 중 지출" });
    const chip = dialog.getByRole("button", { name: "제주 여행", exact: true });
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await pickDate(page, dialog.locator("#ledger-date"), daysAgo(40));
    await expect(chip).toHaveAttribute("aria-pressed", "false");
    await pickDate(page, dialog.locator("#ledger-date"), today());
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "false");
    await dialog.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("기록을 저장했어요.")).toBeVisible();

    const { entries } = await getLedger(request, token);
    expect(entries[0].tripId).toBeNull();
  });

  test("여행 제외는 리포트 합계만 줄이고 잔액은 그대로 둔다", async ({
    page,
    request,
    token,
  }) => {
    const tripId = await createTrip(request, token, "제주 여행", today(), today());
    await addEntry(request, token, {
      entryDate: today(),
      amount: 70_000,
      memo: "여행 지출",
      tripId,
    });
    await addEntry(request, token, {
      entryDate: today(),
      amount: 5_000,
      memo: "일상 지출",
      tripId: null,
    });

    const stats = async (query: string) => {
      const res = await request.get(`/api/ledger/stats?${query}`, {
        headers: authHeaders(token),
      });
      return (await res.json()).stats;
    };
    const range = `from=${today()}&to=${today()}`;
    const all = await stats(range);
    const without = await stats(`${range}&excludeTrips=1`);
    expect(all.summary.expense).toBe(75_000);
    expect(without.summary.expense).toBe(5_000);
    expect(without.daily.at(-1).balance).toBe(all.daily.at(-1).balance);
    expect(all.daily.at(-1).spent).toBe(75_000);
    expect(without.daily.at(-1).spent).toBe(5_000);

    await openLedger(page, token);
    await openStats(page);
    await expect(page.getByText("총 지출 · 2건")).toBeVisible();
    await page.getByRole("button", { name: "여행 제외" }).click();
    await expect(page.getByText("총 지출 · 1건")).toBeVisible();
    await expect(page.getByRole("button", { name: /여행 지출/ })).toHaveCount(0);
  });

  test("지워도 내역과 분류는 남는다", async ({ page, request, token }) => {
    const categoryId = await getCategories(request, token);
    const tripId = await createTrip(request, token, "지울 여행", today(), today());
    await addEntry(request, token, {
      entryDate: today(),
      amount: 8_000,
      memo: "남을 내역",
      categoryId: categoryId("식비"),
      tripId,
    });

    await openLedger(page, token);
    const dialog = await openMainTab(page, "여행");
    await dialog.getByRole("button", { name: "지울 여행 삭제" }).click();
    await dialog.getByRole("button", { name: "여행 삭제", exact: true }).click();
    await expect(dialog.getByText("등록된 여행이 없어요")).toBeVisible();

    const { entries } = await getLedger(request, token);
    expect(entries[0]).toMatchObject({
      memo: "남을 내역",
      tripId: null,
      categoryName: "식비",
    });
  });

  test("입력값을 검증한다", async ({ request, token }) => {
    const post = (data: object) =>
      request.post("/api/ledger/trips", { headers: authHeaders(token), data });
    expect(
      (await post({ name: "", startDate: today(), endDate: today() })).status()
    ).toBe(400);
    expect(
      (await post({ name: "역순", startDate: today(), endDate: daysAgo(1) })).status()
    ).toBe(400);
    expect(
      (await post({ name: "같은 이름", startDate: today(), endDate: today() })).ok()
    ).toBe(true);
    expect(
      (await post({ name: "같은 이름", startDate: today(), endDate: today() })).status()
    ).toBe(409);

    const missing = await request.get("/api/ledger/stats?trip=9999", {
      headers: authHeaders(token),
    });
    expect(missing.status()).toBe(400);
  });
});

test.describe("분류", () => {
  test("쓰인 분류는 내역을 옮겨야 삭제되고, 내역은 분류를 잃지 않는다", async ({
    page,
    request,
    token,
  }) => {
    const categoryId = await getCategories(request, token);
    await addEntry(request, token, {
      entryDate: today(),
      amount: 3_000,
      memo: "약값",
      categoryId: categoryId("의료"),
    });

    const rejected = await request.delete("/api/ledger/categories", {
      headers: authHeaders(token),
      data: { id: categoryId("의료") },
    });
    expect(rejected.status()).toBe(400);

    await openLedger(page, token);
    const dialog = await openSettingsTab(page, "분류");
    await dialog.getByRole("button", { name: "의료 삭제" }).click();

    const remove = dialog.getByRole("button", { name: "옮기고 삭제" });
    await expect(dialog.getByText(/내역 1건을 옮길 분류/)).toBeVisible();
    await expect(remove).toBeDisabled();

    await dialog.getByRole("combobox", { name: "옮길 분류" }).click();
    await page.getByRole("option", { name: "생활" }).click();
    await remove.click();
    await expect(dialog.getByRole("button", { name: "의료 삭제" })).toHaveCount(0);

    expect((await getLedger(request, token)).entries[0].categoryName).toBe("생활");
  });

  test("마지막 분류는 지울 수 없다", async ({ request, token }) => {
    const categoryId = await getCategories(request, token);
    for (const name of ["용돈", "이자", "기타"]) {
      const res = await request.delete("/api/ledger/categories", {
        headers: authHeaders(token),
        data: { id: categoryId(name, "income") },
      });
      expect(res.ok()).toBe(true);
    }
    const res = await request.delete("/api/ledger/categories", {
      headers: authHeaders(token),
      data: { id: categoryId("급여", "income") },
    });
    expect(res.status()).toBe(400);
  });
});

test("CSV 내보내기: Excel용 BOM, 수식 이스케이프, 삭제 내역 제외", async ({
  request,
  token,
}) => {
  await addEntry(request, token, { entryDate: today(), amount: 1_000, memo: "=SUM(A1)" });
  const deleted = await addEntry(request, token, {
    entryDate: today(),
    amount: 2_000,
    memo: "지운 기록",
  });
  await request.delete("/api/ledger/entries", {
    headers: authHeaders(token),
    data: { id: deleted },
  });

  const res = await request.get("/api/ledger/export", { headers: authHeaders(token) });
  expect(res.headers()["content-disposition"]).toContain("attachment");
  const bytes = await res.body();
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const csv = bytes.toString("utf-8");
  expect(csv).toContain(
    "날짜,시각,구분,금액,분류,소분류,결제수단,저축상품,내용,메모,태그,여행"
  );
  expect(csv).toContain("'=SUM(A1)");
  expect(csv).not.toContain("지운 기록");
});

test.describe("3D 보기", () => {
  test("달력을 3D 도시로 바꿨다가 되돌린다", async ({ page, request, token }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const categoryId = await getCategories(request, token);
    await addEntry(request, token, {
      entryDate: today(),
      amount: 12_000,
      categoryId: categoryId("식비"),
      memo: "오늘 점심",
    });

    await openLedger(page, token);
    await page
      .getByRole("tablist", { name: "가계부 보기" })
      .getByRole("tab", { name: "달력" })
      .click();
    const toggle = page.getByRole("group", { name: "달력 보기 방식" });
    await toggle.getByRole("button", { name: "3D 도시" }).click();

    const city = page.getByTestId("spend-city");
    await expect(city.locator("canvas")).toBeVisible();
    await expect(
      page.getByText("나무는 무지출한 날이고", { exact: false })
    ).toBeVisible();
    // 리캡 카드의 큰 지출에도 같은 메모가 나오므로 내역 줄(버튼)로 찾는다.
    await expect(page.getByRole("button", { name: /오늘 점심/ })).toBeVisible();

    await toggle.getByRole("button", { name: "달력", exact: true }).click();
    await expect(city).toHaveCount(0);
    await expect(page.getByRole("button", { name: /지출 12,000원/ })).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe("3D 영수증과 여행 깃발", () => {
  test("주간 영수증을 뽑으면 내역과 합계가 찍힌 이미지를 저장할 수 있다", async ({
    page,
    request,
    token,
  }) => {
    const week = lastWeek();
    await addEntry(request, token, {
      entryDate: week.from,
      amount: 12_000,
      memo: "월요일 점심",
    });
    await addEntry(request, token, {
      entryDate: week.to,
      amount: 3_500,
      memo: "일요일 커피",
    });
    await addEntry(request, token, {
      entryDate: week.to,
      kind: "income",
      amount: 50_000,
      memo: "영수증에 안 나올 입금",
    });

    // 출력 연출은 2초쯤이면 끝나고 그때 건너뛰기 버튼이 사라진다. GPU 없는 테스트 환경에서는
    // 3D를 CPU로 그리느라 클릭 준비가 그보다 오래 걸릴 수 있어, 시계를 멈추고
    // 캔버스가 뜰 때까지만 조금씩 흘려 연출이 거의 시작되지 않은 상태에서 누른다.
    await page.clock.install();
    await openLedger(page, token);
    await showLastWeek(page);
    const printButton = page.getByRole("button", { name: "영수증 뽑기" });
    // 리캡 데이터가 그려진 뒤에 멈춘다(데이터 갱신도 타이머를 쓴다).
    await expect(printButton).toBeVisible();
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1_000);
    await printButton.click();
    const dialog = page.getByRole("dialog", { name: "주간 영수증" });
    const canvas = dialog.getByTestId("receipt-printer").locator("canvas");
    await expect(async () => {
      await page.clock.runFor(50);
      await expect(canvas).toBeVisible({ timeout: 100 });
    }).toPass();
    await dialog.getByRole("button", { name: "건너뛰기" }).click();
    await page.clock.resume();

    await expect(
      dialog.getByRole("img", { name: "주간 영수증, 합계 15,500원" })
    ).toBeVisible();
    await expect(
      dialog.getByText(`${shortDay(week.from)} 월요일 점심 12,000`)
    ).toBeAttached();
    await expect(
      dialog.getByText(`${shortDay(week.to)} 일요일 커피 3,500`)
    ).toBeAttached();
    await expect(dialog.getByText("합계 15,500원")).toBeAttached();
    await expect(dialog.getByText("영수증에 안 나올 입금")).toHaveCount(0);

    const download = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "이미지 저장" }).click();
    expect((await download).suggestedFilename()).toBe(`머니노트-영수증-${week.from}.png`);
  });

  test("동작 줄이기를 켜면 출력 연출 없이 바로 영수증을 보여 준다", async ({
    page,
    request,
    token,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await addEntry(request, token, {
      entryDate: lastWeek().from,
      amount: 7_000,
      memo: "지난주 지출",
    });

    await openLedger(page, token);
    await showLastWeek(page);
    await page.getByRole("button", { name: "영수증 뽑기" }).click();
    const dialog = page.getByRole("dialog", { name: "주간 영수증" });
    await expect(
      dialog.getByRole("img", { name: "주간 영수증, 합계 7,000원" })
    ).toBeVisible();
    await expect(dialog.getByTestId("receipt-printer")).toHaveCount(0);
  });

  test("3D 도시에 이 달의 여행을 깃발과 함께 보여 준다", async ({
    page,
    request,
    token,
  }) => {
    const start = `${thisMonth()}-02`;
    const end = `${thisMonth()}-04`;
    await createTrip(request, token, "강릉 여행", start, end);
    await createTrip(request, token, "지난 여행", "2020-01-01", "2020-01-03");
    await addEntry(request, token, {
      entryDate: `${thisMonth()}-03`,
      amount: 8_000,
      memo: "강릉 순두부",
    });

    await openLedger(page, token);
    await page
      .getByRole("tablist", { name: "가계부 보기" })
      .getByRole("tab", { name: "달력" })
      .click();
    await page
      .getByRole("group", { name: "달력 보기 방식" })
      .getByRole("button", { name: "3D 도시" })
      .click();

    await expect(page.getByTestId("spend-city").locator("canvas")).toBeVisible();
    const trips = page.getByRole("list", { name: "이 달의 여행" });
    await expect(trips.getByRole("listitem")).toHaveCount(1);
    await expect(trips).toContainText("강릉 여행");
    await expect(trips).toContainText(
      `${shortDay(start)}~${shortDay(end)} · 지출 8,000원`
    );
  });
});

test.describe("주 단위 보기", () => {
  /** 이번 주부터 거슬러 올라가 처음 만나는 두 달에 걸친 주와, 거기까지 누를 횟수. */
  const crossMonthWeek = () => {
    let start = weekStartOf(today());
    for (let back = 0; back < 10; back += 1) {
      if (start.slice(0, 7) !== weekEndOf(start).slice(0, 7)) return { start, back };
      start = shiftWeek(start, -1);
    }
    throw new Error("두 달에 걸친 주를 찾지 못했어요.");
  };
  const periodToggle = (page: Page) => page.getByRole("group", { name: "기간 단위" });

  test("내역을 주 단위로 보고, 두 달에 걸친 주는 두 달 내역을 합친다", async ({
    page,
    request,
    token,
  }) => {
    const { start, back } = crossMonthWeek();
    const end = weekEndOf(start);
    await addEntry(request, token, { entryDate: start, amount: 11_000, memo: "주 첫날" });
    await addEntry(request, token, {
      entryDate: end,
      amount: 22_000,
      memo: "주 마지막날",
    });
    await addEntry(request, token, {
      entryDate: shiftWeek(start, -1),
      amount: 99_000,
      memo: "그 전 주",
    });

    await openLedger(page, token);
    await periodToggle(page).getByRole("button", { name: "주" }).click();
    for (let i = 0; i < back; i += 1) {
      await page.getByRole("button", { name: "이전 주" }).click();
    }

    await expect(page.getByText("주 첫날").first()).toBeVisible();
    await expect(page.getByText("주 마지막날").first()).toBeVisible();
    await expect(page.getByText("그 전 주")).toHaveCount(0);
    await expect(page.getByText("33,000원").first()).toBeVisible();

    await page.getByRole("button", { name: "이전 주" }).click();
    await expect(page.getByText("그 전 주").first()).toBeVisible();
    await expect(page.getByText("주 첫날")).toHaveCount(0);

    await page.getByRole("button", { name: "이번 주" }).click();
    await periodToggle(page).getByRole("button", { name: "월" }).click();
    await expect(page.getByRole("button", { name: "이전 달" })).toBeVisible();
  });

  test("달력을 주 단위로 보면 7일 막대와 고른 날 내역이 나온다", async ({
    page,
    request,
    token,
  }) => {
    const start = weekStartOf(today());
    await addEntry(request, token, {
      entryDate: start,
      amount: 15_000,
      memo: "월요일 점심",
    });

    await openLedger(page, token);
    await page
      .getByRole("tablist", { name: "가계부 보기" })
      .getByRole("tab", { name: "달력" })
      .click();
    await periodToggle(page).getByRole("button", { name: "주" }).click();

    const monday = page.getByRole("button", { name: /지출 15,000원$/ });
    await expect(monday).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^\d+월 \d+일 \(.\), 지출/ })
    ).toHaveCount(7);
    await monday.click();
    await expect(page.getByRole("button", { name: /월요일 점심/ })).toBeVisible();
    await expect(page.getByText("이 주 지출 15,000원")).toBeVisible();
  });

  test("통계에서 주별 리포트를 보고 전주와 비교한다", async ({
    page,
    request,
    token,
  }) => {
    const start = weekStartOf(today());
    await addEntry(request, token, { entryDate: start, amount: 30_000, memo: "이번 주" });
    await addEntry(request, token, {
      entryDate: shiftWeek(start, -1),
      amount: 10_000,
      memo: "지난주",
    });

    await openLedger(page, token);
    await openStats(page);
    await reportPeriod(page).getByRole("button", { name: "주별" }).click();

    await expect(
      page.getByText(`${start.replaceAll("-", ".")} ~ ${today().replaceAll("-", ".")}`, {
        exact: false,
      })
    ).toBeVisible();
    await expect(page.getByText("전주 대비")).toBeVisible();
    await expect(page.getByText("+20,000원").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "다음 주" })).toBeDisabled();

    await page.getByRole("button", { name: "이전 주" }).click();
    const previousEnd = weekEndOf(shiftWeek(start, -1)).replaceAll("-", ".");
    await expect(
      page.getByText(
        `${shiftWeek(start, -1).replaceAll("-", ".")} ~ ${previousEnd} · 7일`
      )
    ).toBeVisible();
  });

  test("내역에서 주 단위로 보다가 통계로 가면 주별 리포트로 열린다", async ({
    page,
    token,
  }) => {
    await openLedger(page, token);
    await periodToggle(page).getByRole("button", { name: "주" }).click();
    await openStats(page);
    await expect(
      reportPeriod(page).getByRole("button", { name: "주별" })
    ).toHaveAttribute("aria-pressed", "true");
  });
});
