import {
  test as base,
  type APIRequestContext,
  type Locator,
  type Page,
} from "@playwright/test";
import { cpSync } from "node:fs";

import { kst } from "../src/lib/kst";
import { E2E_PASSWORD, makeTempDir, removeDir, startServer } from "./server";

export { expect } from "@playwright/test";
export { E2E_PASSWORD };

export const test = base.extend<{ appUrl: string; token: string }>({
  // 테스트마다 빈 DB로 서버를 새로 띄워 서로 영향을 주지 않게 한다.
  appUrl: async ({}, provide) => {
    const template = process.env.E2E_TEMPLATE_DB;
    if (!template) throw new Error("E2E_TEMPLATE_DB가 없어요.");
    const dataDir = makeTempDir("db");
    cpSync(template, dataDir, { recursive: true });
    const server = await startServer(dataDir);
    await provide(server.url);
    await server.stop();
    removeDir(dataDir);
  },
  baseURL: async ({ appUrl }, provide) => provide(appUrl),
  token: async ({ request }, provide) => {
    const res = await request.post("/api/auth", { data: { password: E2E_PASSWORD } });
    await provide(((await res.json()) as { token: string }).token);
  },
});

export const today = () => kst().format("YYYY-MM-DD");
export const thisMonth = () => today().slice(0, 7);
export const lastMonth = () => kst().subtract(1, "month").format("YYYY-MM");
export const daysAgo = (days: number) => kst().subtract(days, "day").format("YYYY-MM-DD");
export const shortDay = (date: string) => date.slice(5).replace("-", ".");

export const authHeaders = (token: string) => ({ "x-auth-token": token });

export const openLedger = async (page: Page, token: string) => {
  await page.addInitScript((value) => {
    localStorage.setItem(
      "moneynote-auth",
      JSON.stringify({ state: { token: value }, version: 0 })
    );
  }, token);
  await page.goto("/");
  await page.getByRole("heading", { name: "머니노트" }).waitFor();
  await page.getByRole("button", { name: "내역 추가" }).first().waitFor();
};

interface LedgerEntry {
  id: number;
  memo: string;
  kind: string;
  amount: number;
  categoryName: string | null;
  subcategoryName: string | null;
  assetName: string | null;
  savingsName: string | null;
  tripId: number | null;
  tripName: string | null;
  recurringId?: number | null;
}

interface Ledger {
  entries: LedgerEntry[];
  categories: { id: number; name: string; kind: string }[];
  summary: { income: number; expense: number };
  account: { currentBalance: number };
  budget: { totalBudget: number | null; byCategory: { amount: number }[] };
}

/** 저장 결과는 화면이 쓰는 것과 같은 API로 읽어 확인한다. */
export const getLedger = async (
  request: APIRequestContext,
  token: string,
  month = thisMonth()
): Promise<Ledger> => {
  const res = await request.get(`/api/ledger?month=${month}`, {
    headers: authHeaders(token),
  });
  if (!res.ok()) throw new Error(`조회 실패: ${await res.text()}`);
  return ((await res.json()) as { ledger: Ledger }).ledger;
};

export const getCategories = async (request: APIRequestContext, token: string) => {
  const { categories } = await getLedger(request, token);
  return (name: string, kind = "expense") => {
    const category = categories.find((c) => c.name === name && c.kind === kind);
    if (!category) throw new Error(`분류 없음: ${name}`);
    return category.id;
  };
};

export const addEntry = async (
  request: APIRequestContext,
  token: string,
  entry: {
    entryDate: string;
    kind?: "expense" | "income" | "transfer";
    amount: number;
    categoryId?: number | null;
    subcategoryId?: number | null;
    assetId?: number | null;
    savingsId?: number | null;
    memo?: string;
    note?: string;
    entryTime?: string | null;
    tags?: string;
    tripId?: number | null;
  }
) => {
  const res = await request.post("/api/ledger/entries", {
    headers: authHeaders(token),
    data: { kind: "expense", ...entry },
  });
  if (!res.ok()) throw new Error(`기록 실패: ${await res.text()}`);
  return ((await res.json()) as { entry: { id: number } }).entry.id;
};

/** 설정용 POST 라우트를 호출하고 만든 항목의 id를 돌려준다. */
export const createItem = async (
  request: APIRequestContext,
  token: string,
  path: string,
  data: object
) => {
  const res = await request.post(path, { headers: authHeaders(token), data });
  if (!res.ok()) throw new Error(`생성 실패: ${await res.text()}`);
  const body = (await res.json()) as Record<string, { id: number } | undefined>;
  const item = body.result ?? body.trip ?? body.asset;
  if (!item) throw new Error(`응답에 항목이 없어요: ${JSON.stringify(body)}`);
  return item.id;
};

export const fillNewEntry = async (
  page: Page,
  values: { amount: string; memo: string; category?: string; time?: string }
) => {
  await page.getByRole("button", { name: "내역 추가" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#ledger-amount").fill(values.amount);
  if (values.time) await dialog.locator("#ledger-time").fill(values.time);
  if (values.category)
    await dialog.getByRole("button", { name: values.category, exact: true }).click();
  await dialog.locator("#ledger-memo").fill(values.memo);
  return dialog;
};

export const openSettingsTab = async (page: Page, name: string) => {
  await page.getByRole("button", { name: "예산·설정" }).click();
  await page.getByRole("dialog").getByRole("tab", { name, exact: true }).click();
  return page.getByRole("dialog");
};

/** 반복·여행은 설정 창이 아니라 가계부의 메인 탭에 있다. */
export const openMainTab = async (page: Page, name: "반복" | "여행") => {
  await page
    .getByRole("tablist", { name: "가계부 보기" })
    .getByRole("tab", { name })
    .click();
  return page.getByRole("main");
};

/** 날짜 선택기(Popover + Calendar)를 열고 달을 넘겨 YYYY-MM-DD 날짜를 고른다. */
export const pickDate = async (page: Page, trigger: Locator, iso: string) => {
  await trigger.click();
  const popup = page.locator('[data-slot="popover-content"]');
  await popup.waitFor();
  for (let step = 0; step < 36; step += 1) {
    const cell = popup.locator(`td[data-day="${iso}"]:not([data-outside])`);
    if (await cell.count()) {
      await cell.getByRole("button").click();
      await popup.waitFor({ state: "hidden" });
      return;
    }
    const shown = await popup
      .locator("td[data-day]:not([data-outside])")
      .first()
      .getAttribute("data-day");
    await popup
      .locator(shown && shown > iso ? ".rdp-button_previous" : ".rdp-button_next")
      .click();
  }
  throw new Error(`달력에서 ${iso}를 찾지 못했어요`);
};

export const reportPeriod = (page: Page) =>
  page.getByRole("group", { name: "리포트 기간" });

export const openStats = (page: Page) => page.getByRole("tab", { name: "통계" }).click();
