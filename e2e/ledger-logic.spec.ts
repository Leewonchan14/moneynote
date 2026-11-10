import { expect, test } from "@playwright/test";

import {
  exceedsLoginLimit,
  getLoginBlockSeconds,
  LOGIN_WINDOW_MS,
} from "../src/lib/auth-rate-limit";
import { comparableMonthRange, compareLedgerPeriods } from "../src/lib/ledger/compare";
import {
  buildSavingsInsight,
  detectFixedMemos,
  findUnusualSpending,
  type InsightEntry,
} from "../src/lib/ledger/insights";
import {
  parseLedgerNotifications,
  suggestLedgerCategoryName,
} from "../src/lib/ledger/notification";
import { getBudgetPace, projectMonthExpense } from "../src/lib/ledger/pace";
import { recapRange, type LedgerRecap } from "../src/lib/ledger/recap";
import {
  buildReceiptLines,
  RECEIPT_MAX_ITEMS,
  receiptLineText,
} from "../src/lib/ledger/receipt";
import { topExpenseCategoryBy } from "../src/lib/ledger/top-category";
import {
  comparableWeekRange,
  formatWeekKo,
  weekMonth,
  weekMonths,
  weekRange,
  weekStartOf,
} from "../src/lib/ledger/week";

import type { LedgerEntryView } from "../src/lib/db/ledger";

test.describe("은행 알림 해석", () => {
  const today = "2026-11-08";

  test("출금 알림에서 금액, 날짜, 시각, 내용을 읽는다", () => {
    const [item] = parseLedgerNotifications(
      "[Web발신] 11/08 15:52 토스뱅크 모임통장 출금 12,000원 스타벅스 잔액 300,000원",
      today
    );
    expect(item).toEqual({
      entryDate: "2026-11-08",
      entryTime: "15:52",
      kind: "expense",
      amount: 12000,
      memo: "스타벅스",
    });
  });

  test("입금과 잔액 금액을 구분한다", () => {
    const [item] = parseLedgerNotifications(
      "11월 7일 18:41 입금 50,000원 홍길동 잔액 1,000원",
      today
    );
    expect(item).toMatchObject({
      entryDate: "2026-11-07",
      kind: "income",
      amount: 50000,
      memo: "홍길동",
    });
  });

  test("빈 줄이 있든 없든 여러 알림을 나눈다", () => {
    const blank = parseLedgerNotifications(
      "출금 1,000원 김밥\n\n출금 2,000원 커피",
      today
    );
    const noBlank = parseLedgerNotifications(
      "출금 1,000원 김밥\n출금 2,000원 커피",
      today
    );
    expect(blank.map((item) => item.amount)).toEqual([1000, 2000]);
    expect(noBlank.map((item) => item.amount)).toEqual([1000, 2000]);
  });

  test("여러 줄로 나뉜 알림 하나는 한 건으로 읽는다", () => {
    const items = parseLedgerNotifications("토스뱅크 출금\n12,000원\n스타벅스", today);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ amount: 12000, memo: "스타벅스" });
  });

  test("올해 기준 미래 날짜는 작년으로 본다", () => {
    const [item] = parseLedgerNotifications("12/30 출금 1,000원 김밥", "2027-01-02");
    expect(item.entryDate).toBe("2026-12-30");
  });

  test("금액이 없거나 잔액만 있으면 건너뛴다", () => {
    expect(parseLedgerNotifications("안녕하세요\n\n잔액 1,000원", today)).toEqual([]);
  });

  test("내용으로 지출 분류를 추측한다", () => {
    expect(suggestLedgerCategoryName("스타벅스 성수점", "expense")).toBe("카페");
    expect(suggestLedgerCategoryName("KTX 예매", "expense")).toBe("교통");
    expect(suggestLedgerCategoryName("스타벅스", "income")).toBeNull();
    expect(suggestLedgerCategoryName("이름모를가게", "expense")).toBeNull();
  });
});

test.describe("예산 속도", () => {
  const base = { month: "2026-11", today: "2026-11-08", budget: 800_000 };

  test("지금 속도가 예산을 넘으면 초과 예상을 알려 준다", () => {
    const pace = getBudgetPace({ ...base, spent: 558_922 });
    expect(pace).toMatchObject({
      state: "current",
      status: "risk",
      daysLeft: 23,
      dailyAllowance: 10_481,
      projected: 2_095_958,
      projectedOver: 1_295_958,
    });
  });

  test("속도가 여유 있으면 ok", () => {
    expect(getBudgetPace({ ...base, spent: 100_000 })).toMatchObject({ status: "ok" });
  });

  test("이미 넘었으면 over이고 하루 사용 가능액은 0", () => {
    expect(getBudgetPace({ ...base, spent: 900_000 })).toMatchObject({
      status: "over",
      dailyAllowance: 0,
    });
  });

  test("예산이 없으면 null, 다른 달은 속도를 계산하지 않는다", () => {
    expect(getBudgetPace({ ...base, budget: null, spent: 1 })).toBeNull();
    expect(getBudgetPace({ ...base, month: "2026-10", spent: 1 })).toEqual({
      state: "other-month",
    });
  });
});

test.describe("로그인 제한 계산", () => {
  const now = 1_000_000_000;
  const minutes = (value: number) => value * 60 * 1000;
  const fails = (ip: string, ...ago: number[]) =>
    ago.map((value) => ({ ip, at: now - minutes(value) }));

  test("4번까지는 막지 않는다", () => {
    expect(getLoginBlockSeconds(fails("a", 1, 2, 3, 4), "a", now)).toBe(0);
  });

  test("15분 안에 5번이면 마지막 실패부터 15분 막는다", () => {
    expect(getLoginBlockSeconds(fails("a", 1, 2, 3, 4, 5), "a", now)).toBe(14 * 60);
  });

  test("차단 시간이 지나면 다시 시도할 수 있다", () => {
    expect(getLoginBlockSeconds(fails("a", 16, 17, 18, 19, 20), "a", now)).toBe(0);
  });

  test("15분에 걸쳐 흩어진 실패는 막지 않는다", () => {
    expect(getLoginBlockSeconds(fails("a", 1, 6, 11, 16, 21), "a", now)).toBe(0);
  });

  test("다른 IP의 실패는 IP 한도에 세지 않지만 전체 한도에는 센다", () => {
    expect(getLoginBlockSeconds(fails("b", 1, 2, 3, 4, 5), "a", now)).toBe(0);
    const many = Array.from({ length: 6 }, (_, group) =>
      fails(`ip${group}`, 1, 2, 3, 4)
    ).flat();
    expect(getLoginBlockSeconds(many.slice(0, 29), "z", now)).toBe(0);
    const thirty = Array.from({ length: 30 }, (_, index) => ({
      ip: `ip${index}`,
      at: now - 1000 * (index + 1),
    }));
    expect(getLoginBlockSeconds(thirty, "z", now)).toBeGreaterThan(0);
  });

  test("동시 요청으로 한도를 넘었는지 판단한다", () => {
    expect(exceedsLoginLimit(fails("a", 1, 2, 3, 4, 5), "a", now)).toBe(false);
    expect(exceedsLoginLimit(fails("a", 1, 2, 3, 4, 5, 6), "a", now)).toBe(true);
    expect(
      exceedsLoginLimit(
        [{ ip: "a", at: now - LOGIN_WINDOW_MS - 1 }, ...fails("a", 1, 2, 3, 4, 5)],
        "a",
        now
      )
    ).toBe(false);
  });
});

test.describe("전월 대비", () => {
  test("진행 중인 달은 지난달의 같은 날까지 비교한다", () => {
    expect(comparableMonthRange("2026-11", "2026-11-08")).toEqual({
      from: "2026-10-01",
      to: "2026-10-08",
    });
  });

  test("지난달이 더 짧으면 마지막 날까지 비교한다", () => {
    expect(comparableMonthRange("2026-03", "2026-03-31")).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
  });

  test("끝난 달은 지난달 전체와 비교한다", () => {
    expect(comparableMonthRange("2026-10", "2026-11-08")).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
  });

  test("증감을 계산하고 사라진 분류도 포함한다", () => {
    const row = (categoryId: number, name: string, amount: number) => ({
      categoryId,
      name,
      icon: "tag" as const,
      color: "neutral" as const,
      amount,
    });
    const result = compareLedgerPeriods(
      { summary: { income: 0, expense: 150 }, byCategory: [row(1, "식비", 150)] },
      {
        summary: { income: 10, expense: 100 },
        byCategory: [row(1, "식비", 70), row(2, "카페", 30)],
      }
    );
    expect(result.expense).toMatchObject({ diff: 50, pct: 50 });
    expect(result.income).toMatchObject({ diff: -10, pct: -100 });
    expect(result.categories.map((c) => [c.name, c.diff])).toEqual([
      ["식비", 80],
      ["카페", -30],
    ]);
  });

  test("지난달 금액이 0이면 비율을 계산하지 않는다", () => {
    const result = compareLedgerPeriods(
      { summary: { income: 0, expense: 10 }, byCategory: [] },
      { summary: { income: 0, expense: 0 }, byCategory: [] }
    );
    expect(result.expense.pct).toBeNull();
    expect(result.hasPrevious).toBe(false);
  });
});

test.describe("예상 지출", () => {
  test("진행 중인 달을 지금 속도로 계산하고 다른 달은 null이다", () => {
    expect(
      projectMonthExpense({ month: "2026-11", today: "2026-11-10", spent: 100_000 })
    ).toEqual({ projected: 300_000, day: 10, daysInMonth: 30 });
    expect(
      projectMonthExpense({ month: "2026-10", today: "2026-11-10", spent: 100_000 })
    ).toBeNull();
  });
});

test("항공과 렌터카는 각각의 분류로 추측한다", () => {
  expect(suggestLedgerCategoryName("이스타항공(주)", "expense")).toBe("항공");
  expect(suggestLedgerCategoryName("토스페이_렌터카_나이스", "expense")).toBe("렌트");
});

test.describe("리캡 기간", () => {
  test("끝난 주는 월~일 전체를 전주 전체와 비교한다", () => {
    expect(recapRange("week", "2026-11-02", "2026-11-10")).toEqual({
      from: "2026-11-02",
      to: "2026-11-08",
      inProgress: false,
      previousFrom: "2026-10-26",
      previousTo: "2026-11-01",
      month: "2026-11",
    });
  });

  test("진행 중인 주는 오늘까지를 전주 같은 요일까지와 비교한다", () => {
    expect(recapRange("week", "2026-11-09", "2026-11-11")).toMatchObject({
      from: "2026-11-09",
      to: "2026-11-11",
      inProgress: true,
      previousFrom: "2026-11-02",
      previousTo: "2026-11-04",
    });
  });

  test("두 달에 걸친 주의 예산은 목요일이 든 달 것을 본다", () => {
    expect(recapRange("week", "2026-09-28", "2026-11-10").month).toBe("2026-10");
  });

  test("진행 중인 달은 오늘까지를 지난달 같은 날까지와 비교한다", () => {
    expect(recapRange("month", "2026-11", "2026-11-10")).toEqual({
      from: "2026-11-01",
      to: "2026-11-10",
      inProgress: true,
      previousFrom: "2026-10-01",
      previousTo: "2026-10-10",
      month: "2026-11",
    });
    // 지난달이 더 짧으면 그 달 마지막 날까지만 본다.
    expect(recapRange("month", "2026-03", "2026-03-31").previousTo).toBe("2026-02-28");
  });

  test("끝난 달은 말일까지를 지난달 전체와 비교한다", () => {
    expect(recapRange("month", "2026-10", "2026-11-10")).toMatchObject({
      from: "2026-10-01",
      to: "2026-10-31",
      inProgress: false,
      previousFrom: "2026-09-01",
      previousTo: "2026-09-30",
    });
  });
});

test.describe("3D 보기 색", () => {
  const entry = (patch: Partial<LedgerEntryView>): LedgerEntryView => ({
    id: 0,
    entryDate: "2026-11-01",
    entryTime: null,
    kind: "expense",
    amount: 0,
    categoryId: null,
    categoryName: null,
    categoryEmoji: null,
    categoryIcon: null,
    categoryColor: null,
    subcategoryId: null,
    subcategoryName: null,
    assetId: null,
    assetName: null,
    savingsId: null,
    savingsName: null,
    recurringId: null,
    memo: "",
    note: "",
    tags: "",
    tripId: null,
    tripName: null,
    ...patch,
  });

  test("날짜마다 지출 합이 가장 큰 분류를 고르고 입금은 세지 않는다", () => {
    const food = { categoryId: 1, categoryName: "식비", categoryColor: "peach" as const };
    const cafe = { categoryId: 2, categoryName: "카페", categoryColor: "latte" as const };
    const top = topExpenseCategoryBy(
      [
        entry({ ...food, amount: 6_000 }),
        entry({ ...food, amount: 5_000 }),
        entry({ ...cafe, amount: 10_000 }),
        entry({ ...cafe, entryDate: "2026-11-02", kind: "income", amount: 90_000 }),
        entry({ ...food, entryDate: "2026-11-02", amount: 1_000 }),
      ],
      (item) => item.entryDate
    );

    expect(top.get("2026-11-01")).toEqual({ name: "식비", color: "#B85F52" });
    expect(top.get("2026-11-02")).toEqual({ name: "식비", color: "#B85F52" });
  });

  test("지출이 없는 날은 고르지 않고, 분류 없는 지출은 미분류로 센다", () => {
    const top = topExpenseCategoryBy(
      [
        entry({ entryDate: "2026-11-03", kind: "transfer", amount: 50_000 }),
        entry({ entryDate: "2026-11-04", amount: 3_000 }),
      ],
      (item) => item.entryDate
    );

    expect(top.has("2026-11-03")).toBe(false);
    expect(top.get("2026-11-04")?.name).toBe("미분류");
  });
});

test.describe("리캡 영수증", () => {
  const recap = (patch: Partial<LedgerRecap> = {}): LedgerRecap => ({
    period: "week",
    from: "2026-11-02",
    to: "2026-11-08",
    inProgress: false,
    expense: 0,
    expenseCount: 0,
    previousExpense: 0,
    topExpenses: [],
    items: [],
    budget: null,
    ...patch,
  });
  const item = (
    id: number,
    date: string,
    amount: number,
    categoryName: string | null
  ) => ({
    id,
    date,
    label: `내역${id}`,
    amount,
    categoryName,
  });
  const text = (lines: ReturnType<typeof buildReceiptLines>) =>
    lines.map(receiptLineText).filter(Boolean);

  test("내역·합계·전주 대비·최다 분류·무지출 일수를 찍는다", () => {
    const lines = buildReceiptLines(
      recap({
        expense: 18_000,
        expenseCount: 3,
        previousExpense: 20_000,
        items: [
          item(1, "2026-11-02", 3_000, "식비"),
          item(2, "2026-11-02", 5_000, "카페"),
          item(3, "2026-11-05", 10_000, "카페"),
        ],
      }),
      { printedAt: "2026.11.10 09:00", budgetLine: "이번 달은 예산 안이에요" }
    );

    expect(text(lines)).toEqual([
      "MONEYNOTE",
      "머니노트 주간 영수증",
      "2026.11.02 (월) ~ 11.08 (일)",
      "11.02 내역1 3,000",
      "11.02 내역2 5,000",
      "11.05 내역3 10,000",
      "품목 수 3건",
      "합계 18,000원",
      "전주 대비 -2,000",
      "최다 분류 · 카페 15,000",
      "무지출 5일",
      "이번 달은 예산 안이에요",
      "MN-20261102-003",
      "이번 주도 수고했어요 :)",
      "출력 2026.11.10 09:00",
    ]);
  });

  test("내역이 많으면 뒤쪽을 '외 N건'으로 묶고, 한 건만 넘치면 그대로 찍는다", () => {
    const many = (count: number) =>
      Array.from({ length: count }, (_, index) =>
        item(index + 1, "2026-11-03", 1_000, null)
      );
    const rows = (count: number) =>
      buildReceiptLines(recap({ items: many(count), expenseCount: count }), {
        printedAt: "",
      }).filter((line) => line.kind === "row" && line.left.startsWith("11.03"));

    expect(rows(RECEIPT_MAX_ITEMS)).toHaveLength(RECEIPT_MAX_ITEMS);
    expect(rows(RECEIPT_MAX_ITEMS + 5)).toHaveLength(RECEIPT_MAX_ITEMS - 1);
    expect(
      text(
        buildReceiptLines(recap({ items: many(RECEIPT_MAX_ITEMS + 5) }), {
          printedAt: "",
        })
      )
    ).toContain("외 6건 6,000");
  });

  test("전주 기록이 없으면 그렇게 적고, 같은 주는 늘 같은 바코드다", () => {
    const week = recap({
      expense: 1_000,
      expenseCount: 1,
      items: [item(1, "2026-11-04", 1_000, null)],
    });
    const lines = buildReceiptLines(week, { printedAt: "" });
    expect(text(lines)).toContain("전주 대비 기록 없음");
    expect(text(lines)).toContain("최다 분류 · 미분류 1,000");
    expect(lines.find((line) => line.kind === "barcode")).toEqual(
      buildReceiptLines(week, { printedAt: "다른 시각" }).find(
        (line) => line.kind === "barcode"
      )
    );
  });

  test("월간 영수증은 전월과 비교하고 달 인사로 끝난다", () => {
    const lines = text(
      buildReceiptLines(
        recap({
          period: "month",
          from: "2026-10-01",
          to: "2026-10-31",
          expense: 5_000,
          expenseCount: 1,
          previousExpense: 8_000,
          items: [item(1, "2026-10-15", 5_000, "식비")],
        }),
        { printedAt: "" }
      )
    );
    expect(lines).toContain("머니노트 월간 영수증");
    expect(lines).toContain("전월 대비 -3,000");
    expect(lines).toContain("무지출 30일");
    expect(lines).toContain("이번 달도 수고했어요 :)");
  });
});

test.describe("주 단위", () => {
  test("주는 월요일에 시작하고 일요일도 그 주에 든다", () => {
    expect(weekStartOf("2026-11-09")).toBe("2026-11-09");
    expect(weekStartOf("2026-11-15")).toBe("2026-11-09");
    expect(weekStartOf("2026-11-01")).toBe("2026-10-26");
  });

  test("두 달에 걸친 주는 목요일이 든 달로 치고 두 달을 모두 읽는다", () => {
    expect(weekMonths("2026-10-26")).toEqual(["2026-10", "2026-11"]);
    expect(weekMonth("2026-10-26")).toBe("2026-10");
    expect(weekMonth("2026-09-28")).toBe("2026-10");
    expect(weekMonths("2026-11-09")).toEqual(["2026-11"]);
  });

  test("주 이름은 달과 해가 바뀔 때만 앞부분을 다시 적는다", () => {
    expect(formatWeekKo("2026-11-09", "2026-11-10")).toBe("11월 9일 ~ 15일");
    expect(formatWeekKo("2026-10-26", "2026-11-10")).toBe("10월 26일 ~ 11월 1일");
    expect(formatWeekKo("2025-12-29", "2026-11-10")).toBe(
      "2025년 12월 29일 ~ 2026년 1월 4일"
    );
    expect(formatWeekKo("2025-11-10", "2026-11-10")).toBe("2025년 11월 10일 ~ 16일");
  });

  test("이번 주는 오늘까지 보고, 지난주도 같은 요일까지만 비교한다", () => {
    expect(weekRange("2026-11-09", "2026-11-11")).toEqual({
      from: "2026-11-09",
      to: "2026-11-11",
    });
    expect(comparableWeekRange("2026-11-09", "2026-11-11")).toEqual({
      from: "2026-11-02",
      to: "2026-11-04",
    });
    expect(weekRange("2026-11-02", "2026-11-11")).toEqual({
      from: "2026-11-02",
      to: "2026-11-08",
    });
    expect(comparableWeekRange("2026-11-02", "2026-11-11")).toEqual({
      from: "2026-10-26",
      to: "2026-11-01",
    });
  });
});

test.describe("인사이트", () => {
  let nextId = 1;
  const entry = (
    entryDate: string,
    amount: number,
    fields: Partial<InsightEntry> = {}
  ): InsightEntry => ({
    id: nextId++,
    entryDate,
    kind: "expense",
    amount,
    categoryId: 1,
    subcategoryId: null,
    savingsId: null,
    recurringId: null,
    tripId: null,
    memo: "",
    ...fields,
  });
  const categories = [
    { id: 1, name: "식비" },
    { id: 2, name: "쇼핑" },
    { id: 3, name: "병원" },
  ];
  const months = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];

  test("분류 지출을 최근 6개월 중앙값과 비교해 크게 늘거나 준 곳만 고른다", () => {
    const entries = [
      ...months.flatMap((m) => [
        entry(`${m}-03`, 200_000, { categoryId: 1 }),
        entry(`${m}-05`, 100_000, { categoryId: 2 }),
      ]),
      entry("2026-10-03", 420_000, { categoryId: 1 }),
      entry("2026-10-05", 20_000, { categoryId: 2 }),
      entry("2026-10-07", 80_000, { categoryId: 3 }),
    ];
    const result = findUnusualSpending({
      month: "2026-10",
      today: "2026-11-10",
      entries,
      categories,
      subcategories: [],
    });

    expect(result.throughDay).toBeNull();
    expect(result.baselineMonths).toEqual(months);
    expect(result.total).toEqual({
      current: 520_000,
      usual: 300_000,
      diff: 220_000,
      ratio: 1.73,
    });
    expect(result.categories.map((c) => [c.name, c.direction, c.diff, c.ratio])).toEqual([
      ["식비", "up", 220_000, 2.1],
      ["병원", "up", 80_000, null],
      ["쇼핑", "down", -80_000, 0.2],
    ]);
  });

  test("진행 중인 달은 지난 달들도 같은 날까지만 비교하고, 기록 전 달은 빼며 3개월 미만이면 비교하지 않는다", () => {
    const entries = [
      ...["2026-08", "2026-09", "2026-10"].flatMap((m) => [
        entry(`${m}-02`, 100_000),
        entry(`${m}-25`, 500_000),
      ]),
      entry("2026-11-03", 110_000),
    ];
    const result = findUnusualSpending({
      month: "2026-11",
      today: "2026-11-10",
      entries,
      categories,
      subcategories: [],
    });
    expect(result.throughDay).toBe(10);
    expect(result.baselineMonths).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(result.total?.usual).toBe(100_000);
    expect(result.categories).toEqual([]);

    const short = findUnusualSpending({
      month: "2026-11",
      today: "2026-11-10",
      entries: entries.filter((e) => e.entryDate >= "2026-09"),
      categories,
      subcategories: [],
    });
    expect(short.total).toBeNull();
    expect(short.baselineMonths).toEqual([]);
  });

  test("같은 분류·소분류의 과거 내역보다 유난히 큰 내역을 고른다", () => {
    const lunch = { categoryId: 1, subcategoryId: 10 };
    const history = months.flatMap((m) => [
      entry(`${m}-01`, 9_000, lunch),
      entry(`${m}-02`, 10_000, lunch),
    ]);
    const big = entry("2026-10-15", 48_000, { ...lunch, memo: "회식", tripId: 3 });
    const normal = entry("2026-10-16", 11_000, lunch);
    const small = entry("2026-10-17", 25_000, { categoryId: 2, memo: "기록 적은 분류" });
    const result = findUnusualSpending({
      month: "2026-10",
      today: "2026-11-10",
      entries: [...history, big, normal, small],
      categories,
      subcategories: [{ id: 10, name: "점심" }],
    });
    expect(result.entries).toEqual([
      {
        id: big.id,
        entryDate: "2026-10-15",
        memo: "회식",
        amount: 48_000,
        categoryId: 1,
        groupName: "식비 · 점심",
        usual: 9_500,
        ratio: 5.1,
        historyCount: 12,
        onTrip: true,
      },
    ]);
  });

  test("고정비: 반복 거래와, 연속 3개월 한 달 한 번 비슷한 금액인 내용", () => {
    const entries = [
      // 요금이 바뀌어도 연속 3개월 비슷했던 적이 있으면 고정비
      entry("2026-01-21", 90_000, { memo: "통신비" }),
      entry("2026-03-21", 55_000, { memo: "통신비" }),
      entry("2026-04-21", 55_000, { memo: "통신비" }),
      entry("2026-05-21", 56_000, { memo: "통신비 " }),
      // 한 달에 여러 번 사면 고정비가 아니다
      ...["2026-03", "2026-04", "2026-05"].flatMap((m) => [
        entry(`${m}-01`, 5_000, { memo: "커피" }),
        entry(`${m}-09`, 5_000, { memo: "커피" }),
      ]),
      // 금액이 들쭉날쭉하면 고정비가 아니다
      entry("2026-03-10", 10_000, { memo: "쿠팡" }),
      entry("2026-04-10", 80_000, { memo: "쿠팡" }),
      entry("2026-05-10", 30_000, { memo: "쿠팡" }),
      // 두 달 띄엄띄엄이면 아니다
      entry("2026-01-05", 20_000, { memo: "미용실" }),
      entry("2026-03-05", 20_000, { memo: "미용실" }),
      entry("2026-05-05", 20_000, { memo: "미용실" }),
      entry("2026-05-06", 9_900, { memo: "자동 생성", recurringId: 7 }),
    ];
    expect([...detectFixedMemos(entries, ["넷플릭스"])].sort()).toEqual([
      ["넷플릭스", "recurring"],
      ["자동 생성", "recurring"],
      ["통신비", "pattern"],
    ]);
  });

  test("저축 비중은 지출과 적금 이체 중 저축 몫, 수입 대비 비율은 수입이 있을 때만", () => {
    const entries = [
      entry("2026-09-10", 3_000_000, { kind: "income", categoryId: null }),
      entry("2026-09-11", 600_000, { kind: "transfer", savingsId: 1, categoryId: null }),
      entry("2026-09-12", 100_000, { kind: "transfer", categoryId: null }),
      entry("2026-09-13", 1_400_000),
      entry("2026-10-21", 55_000, { memo: "통신비" }),
      entry("2026-10-22", 345_000),
      entry("2026-10-23", 400_000, { kind: "transfer", savingsId: 1, categoryId: null }),
      entry("2026-11-01", 13_500, { memo: "넷플릭스" }),
    ];
    const result = buildSavingsInsight({
      month: "2026-10",
      entries,
      recurringMemos: ["통신비", "넷플릭스"],
    });

    // 첫 기록 달부터만 센다
    expect(result.months.map((m) => m.month)).toEqual(["2026-09", "2026-10"]);
    expect(result.months[0]).toMatchObject({
      income: 3_000_000,
      expense: 1_400_000,
      saving: 600_000,
      savingShare: 30,
      savingsRate: 53.3,
      fixedShare: 0,
    });
    expect(result.months[1]).toMatchObject({
      income: 0,
      expense: 400_000,
      saving: 400_000,
      fixed: 55_000,
      savingShare: 50,
      savingsRate: null,
      fixedShare: 13.8,
    });
    expect(result.fixedItems).toEqual([
      { memo: "통신비", amount: 55_000, count: 1, reason: "recurring" },
    ]);
  });
});
