import { and, asc, eq, gte, inArray, ne, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/db";
import {
  activeEntry,
  LedgerError,
  logEntryHistory,
  MAX_NOTE_LENGTH,
  normalizeAmount,
  normalizeDate,
  normalizeEntryKind,
  normalizeEntryNote,
  normalizeId,
  normalizeMemo,
  normalizeName,
  resolveEntryLinks,
  toEntryKind,
  type LedgerEntryKind,
} from "@/lib/db/ledger";
import { dayjs, kst } from "@/lib/kst";

const MAX_NAME_LENGTH = 40;

const nameOf = (value: unknown, label: string): string => {
  const name = normalizeName(value, label);
  if (name.length > MAX_NAME_LENGTH) {
    throw new LedgerError(`${label} 이름은 ${MAX_NAME_LENGTH}자 이하로 입력해 주세요.`);
  }
  return name;
};

/* ─────────────── 소분류 ─────────────── */

export const createLedgerSubcategory = async (input: {
  categoryId?: unknown;
  name?: unknown;
}) => {
  const categoryId = normalizeId(input.categoryId, "분류");
  const name = nameOf(input.name, "소분류");
  const db = getDb();
  const [category] = await db
    .select({ kind: schema.ledgerCategories.kind })
    .from(schema.ledgerCategories)
    .where(eq(schema.ledgerCategories.id, categoryId))
    .limit(1);
  if (!category) throw new LedgerError("분류를 찾을 수 없어요.");
  const [max] = await db
    .select({
      value: sql<number>`coalesce(max(${schema.ledgerSubcategories.sortOrder}), -1)`,
    })
    .from(schema.ledgerSubcategories)
    .where(eq(schema.ledgerSubcategories.categoryId, categoryId));
  const [row] = await db
    .insert(schema.ledgerSubcategories)
    .values({ categoryId, name, sortOrder: Number(max?.value ?? -1) + 1 })
    .returning();
  return row;
};

export const updateLedgerSubcategory = async (input: {
  id?: unknown;
  name?: unknown;
}) => {
  const id = normalizeId(input.id, "소분류");
  const [row] = await getDb()
    .update(schema.ledgerSubcategories)
    .set({ name: nameOf(input.name, "소분류") })
    .where(eq(schema.ledgerSubcategories.id, id))
    .returning();
  if (!row) throw new LedgerError("소분류를 찾을 수 없어요.");
  return row;
};

/** 소분류만 지운다. 연결된 내역은 대분류만 남는다. */
export const deleteLedgerSubcategory = async (input: { id?: unknown }) => {
  const id = normalizeId(input.id, "소분류");
  await getDb()
    .delete(schema.ledgerSubcategories)
    .where(eq(schema.ledgerSubcategories.id, id));
};

/* ─────────────── 결제수단 ─────────────── */

export const createLedgerAsset = async (input: { name?: unknown }) => {
  const db = getDb();
  const [max] = await db
    .select({ value: sql<number>`coalesce(max(${schema.ledgerAssets.sortOrder}), -1)` })
    .from(schema.ledgerAssets);
  const [row] = await db
    .insert(schema.ledgerAssets)
    .values({
      name: nameOf(input.name, "결제수단"),
      sortOrder: Number(max?.value ?? -1) + 1,
    })
    .returning();
  return row;
};

export const updateLedgerAsset = async (input: { id?: unknown; name?: unknown }) => {
  const id = normalizeId(input.id, "결제수단");
  const [row] = await getDb()
    .update(schema.ledgerAssets)
    .set({ name: nameOf(input.name, "결제수단") })
    .where(eq(schema.ledgerAssets.id, id))
    .returning();
  if (!row) throw new LedgerError("결제수단을 찾을 수 없어요.");
  return row;
};

/** 결제수단만 지운다. 연결된 내역의 결제수단은 비워진다. */
export const deleteLedgerAsset = async (input: { id?: unknown }) => {
  const id = normalizeId(input.id, "결제수단");
  await getDb().delete(schema.ledgerAssets).where(eq(schema.ledgerAssets.id, id));
};

export interface MergeLedgerAssetResult {
  assetId: number;
  movedEntries: number;
  movedRecurring: number;
}

/**
 * 결제수단 하나를 다른 결제수단으로 합친다.
 * 내역·자동 기록 규칙의 결제수단을 옮긴 뒤 원래 결제수단만 지운다.
 * 내역별 이력은 남기지 않는다 — 한 번에 수천 건이 바뀌어 이력 목록을 덮어버린다.
 */
export const mergeLedgerAsset = async (input: {
  fromId?: unknown;
  toId?: unknown;
}): Promise<MergeLedgerAssetResult> => {
  const fromId = normalizeId(input.fromId, "합칠 결제수단");
  const toId = normalizeId(input.toId, "합쳐질 결제수단");
  if (fromId === toId) {
    throw new LedgerError("같은 결제수단끼리는 합칠 수 없어요.");
  }

  const db = getDb();
  const rows = await db
    .select({ id: schema.ledgerAssets.id })
    .from(schema.ledgerAssets)
    .where(inArray(schema.ledgerAssets.id, [fromId, toId]));
  if (rows.length < 2) throw new LedgerError("결제수단을 찾을 수 없어요.");

  const now = new Date();
  const movedEntries = await db
    .update(schema.ledgerEntries)
    .set({ assetId: toId, updatedAt: now })
    .where(eq(schema.ledgerEntries.assetId, fromId))
    .returning({ id: schema.ledgerEntries.id });
  const movedRecurring = await db
    .update(schema.ledgerRecurring)
    .set({ assetId: toId })
    .where(eq(schema.ledgerRecurring.assetId, fromId))
    .returning({ id: schema.ledgerRecurring.id });

  await db.delete(schema.ledgerAssets).where(eq(schema.ledgerAssets.id, fromId));
  return {
    assetId: toId,
    movedEntries: movedEntries.length,
    movedRecurring: movedRecurring.length,
  };
};

/* ─────────────── 저축 상품 ─────────────── */

export interface LedgerSavingsInput {
  id?: unknown;
  name?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  monthlyAmount?: unknown;
  memo?: unknown;
}

const normalizeSavingsFields = (input: LedgerSavingsInput) => {
  const startDate = input.startDate ? normalizeDate(input.startDate) : null;
  const endDate = input.endDate ? normalizeDate(input.endDate) : null;
  if (startDate && endDate && startDate > endDate) {
    throw new LedgerError("가입일은 만기일보다 늦을 수 없어요.");
  }
  return {
    name: nameOf(input.name, "저축 상품"),
    startDate,
    endDate,
    monthlyAmount:
      input.monthlyAmount == null || input.monthlyAmount === ""
        ? null
        : normalizeAmount(input.monthlyAmount),
    memo: normalizeEntryNote(input.memo),
  };
};

export const createLedgerSavings = async (input: LedgerSavingsInput) => {
  const db = getDb();
  const [max] = await db
    .select({ value: sql<number>`coalesce(max(${schema.ledgerSavings.sortOrder}), -1)` })
    .from(schema.ledgerSavings);
  const [row] = await db
    .insert(schema.ledgerSavings)
    .values({
      ...normalizeSavingsFields(input),
      sortOrder: Number(max?.value ?? -1) + 1,
    })
    .returning();
  return row;
};

export const updateLedgerSavings = async (input: LedgerSavingsInput) => {
  const id = normalizeId(input.id, "저축 상품");
  const [row] = await getDb()
    .update(schema.ledgerSavings)
    .set(normalizeSavingsFields(input))
    .where(eq(schema.ledgerSavings.id, id))
    .returning();
  if (!row) throw new LedgerError("저축 상품을 찾을 수 없어요.");
  return row;
};

/** 납입 내역이 있는 상품을 지우면 어디에 저축했는지 사라지므로 막는다. */
export const deleteLedgerSavings = async (input: { id?: unknown }) => {
  const id = normalizeId(input.id, "저축 상품");
  const db = getDb();
  const [used] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(schema.ledgerEntries)
    .where(and(activeEntry, eq(schema.ledgerEntries.savingsId, id)));
  if (used?.value) {
    throw new LedgerError(`납입 내역 ${used.value}건이 있어서 지울 수 없어요.`);
  }
  await db.delete(schema.ledgerSavings).where(eq(schema.ledgerSavings.id, id));
};

/* ─────────────── 반복 거래 ─────────────── */

export interface LedgerRecurringInput {
  id?: unknown;
  kind?: unknown;
  amount?: unknown;
  categoryId?: unknown;
  subcategoryId?: unknown;
  assetId?: unknown;
  savingsId?: unknown;
  memo?: unknown;
  note?: unknown;
  dayOfMonth?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  active?: unknown;
}

const normalizeDay = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 31) {
    throw new LedgerError("반복일은 1일부터 31일까지 입력해 주세요.");
  }
  return value;
};

const normalizeRecurringFields = async (input: LedgerRecurringInput) => {
  const kind = normalizeEntryKind(input.kind);
  const startDate = normalizeDate(input.startDate);
  const endDate = input.endDate ? normalizeDate(input.endDate) : null;
  if (endDate && startDate > endDate) {
    throw new LedgerError("시작일은 종료일보다 늦을 수 없어요.");
  }
  return {
    kind,
    amount: normalizeAmount(input.amount),
    memo: normalizeMemo(input.memo),
    note: normalizeEntryNote(input.note),
    dayOfMonth: normalizeDay(input.dayOfMonth),
    startDate,
    endDate,
    ...(await resolveEntryLinks(kind, input)),
  };
};

export const createLedgerRecurring = async (input: LedgerRecurringInput) => {
  const [row] = await getDb()
    .insert(schema.ledgerRecurring)
    .values(await normalizeRecurringFields(input))
    .returning();
  return row;
};

/** 다시 켤 때는 꺼져 있던 동안의 내역을 소급해서 만들지 않는다. */
export const setLedgerRecurringActive = async (input: {
  id?: unknown;
  active?: unknown;
}) => {
  const id = normalizeId(input.id, "반복 거래");
  if (typeof input.active !== "boolean") {
    throw new LedgerError("사용 여부를 확인해 주세요.");
  }
  const [row] = await getDb()
    .update(schema.ledgerRecurring)
    .set(
      input.active
        ? { active: true, lastDate: kst().format("YYYY-MM-DD") }
        : { active: false }
    )
    .where(eq(schema.ledgerRecurring.id, id))
    .returning();
  if (!row) throw new LedgerError("반복 거래를 찾을 수 없어요.");
  return row;
};

/** 규칙만 지운다. 이미 만들어진 내역은 남는다. */
export const deleteLedgerRecurring = async (input: { id?: unknown }) => {
  const id = normalizeId(input.id, "반복 거래");
  await getDb().delete(schema.ledgerRecurring).where(eq(schema.ledgerRecurring.id, id));
};

const nextMonth = (month: string) =>
  dayjs(`${month}-01`).add(1, "month").format("YYYY-MM");

/** 31일 규칙은 짧은 달에 말일로 당겨진다. */
const occurrenceIn = (month: string, dayOfMonth: number): string => {
  const lastDay = dayjs(`${month}-01`).daysInMonth();
  return `${month}-${String(Math.min(dayOfMonth, lastDay)).padStart(2, "0")}`;
};

const nextOccurrence = (rule: {
  startDate: string;
  lastDate: string | null;
  dayOfMonth: number;
}): string => {
  let month = (rule.lastDate ?? rule.startDate).slice(0, 7);
  let date = occurrenceIn(month, rule.dayOfMonth);
  while (date < rule.startDate || (rule.lastDate != null && date <= rule.lastDate)) {
    month = nextMonth(month);
    date = occurrenceIn(month, rule.dayOfMonth);
  }
  return date;
};

/**
 * 오늘까지 도래한 반복 거래를 내역으로 만든다. 앱을 열 때마다 호출되므로
 * (규칙, 날짜) 유니크 인덱스로 동시 요청에도 한 번만 생성되게 한다.
 * 지운 내역이 되살아나지 않도록 진행 위치는 lastDate에 저장한다.
 */
export const materializeRecurring = async (): Promise<number> => {
  const db = getDb();
  const today = kst().format("YYYY-MM-DD");
  const rules = await db
    .select()
    .from(schema.ledgerRecurring)
    .where(eq(schema.ledgerRecurring.active, true));

  let created = 0;
  for (const rule of rules) {
    if (rule.kind === "transfer" && rule.savingsId == null) continue;

    let lastDate = rule.lastDate;
    let date = nextOccurrence(rule);
    while (date <= today && (!rule.endDate || date <= rule.endDate)) {
      const [entry] = await db
        .insert(schema.ledgerEntries)
        .values({
          entryDate: date,
          kind: rule.kind,
          amount: rule.amount,
          categoryId: rule.categoryId,
          subcategoryId: rule.subcategoryId,
          assetId: rule.assetId,
          savingsId: rule.savingsId,
          recurringId: rule.id,
          memo: rule.memo,
          note: rule.note,
        })
        .onConflictDoNothing()
        .returning();
      if (entry) {
        created += 1;
        await logEntryHistory(entry.id, "create", "web", null, entry);
      }
      lastDate = date;
      date = nextOccurrence({ ...rule, lastDate });
    }

    if (lastDate !== rule.lastDate) {
      await db
        .update(schema.ledgerRecurring)
        .set({ lastDate })
        .where(eq(schema.ledgerRecurring.id, rule.id));
    }
  }
  return created;
};

export type LedgerRecurringCandidate = {
  memo: string;
  amount: number;
  kind: LedgerEntryKind;
  dayOfMonth: number;
  lastDate: string;
  categoryId: number | null;
  subcategoryId: number | null;
  assetId: number | null;
  savingsId: number | null;
};

const CANDIDATE_MONTHS = 3;
const CANDIDATE_MAX_DAY_SPREAD = 3;
const CANDIDATE_MAX_AGE_DAYS = 45;

/** 최근 3개월 연속으로 비슷한 날짜에 같은 금액이 나간 내역을 추천한다. */
export const getRecurringCandidates = async (): Promise<LedgerRecurringCandidate[]> => {
  const db = getDb();
  const today = kst();
  const since = today.subtract(6, "month").format("YYYY-MM-DD");
  const [rows, rules] = await Promise.all([
    db
      .select()
      .from(schema.ledgerEntries)
      .where(
        and(
          activeEntry,
          ne(schema.ledgerEntries.kind, "income"),
          ne(schema.ledgerEntries.memo, ""),
          gte(schema.ledgerEntries.entryDate, since)
        )
      )
      .orderBy(asc(schema.ledgerEntries.entryDate)),
    db
      .select()
      .from(schema.ledgerRecurring)
      .where(eq(schema.ledgerRecurring.active, true)),
  ]);

  const covered = new Set(rules.map((rule) => `${rule.memo}|${rule.amount}`));
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.memo}|${row.amount}`;
    if (covered.has(key)) continue;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const candidates: LedgerRecurringCandidate[] = [];
  for (const group of groups.values()) {
    const latestByMonth = new Map(group.map((row) => [row.entryDate.slice(0, 7), row]));
    const months = [...latestByMonth.keys()].sort().slice(-CANDIDATE_MONTHS);
    if (months.length < CANDIDATE_MONTHS) continue;
    const consecutive = months.every(
      (month, index) => index === 0 || month === nextMonth(months[index - 1])
    );
    if (!consecutive) continue;
    // 한 달에 여러 번 사는 품목은 고정 지출이 아니다.
    if (group.filter((row) => months.includes(row.entryDate.slice(0, 7))).length > 3) {
      continue;
    }

    const recent = months.map((month) => latestByMonth.get(month)!);
    const days = recent
      .map((row) => Number(row.entryDate.slice(8)))
      .sort((a, b) => a - b);
    if (days[days.length - 1] - days[0] > CANDIDATE_MAX_DAY_SPREAD) continue;

    const last = recent[recent.length - 1];
    if (today.diff(kst(last.entryDate), "day") > CANDIDATE_MAX_AGE_DAYS) continue;

    candidates.push({
      memo: last.memo,
      amount: last.amount,
      kind: toEntryKind(last.kind),
      dayOfMonth: days[1],
      lastDate: last.entryDate,
      categoryId: last.categoryId,
      subcategoryId: last.subcategoryId,
      assetId: last.assetId,
      savingsId: last.savingsId,
    });
  }
  return candidates.sort((a, b) => a.dayOfMonth - b.dayOfMonth);
};

/* ─────────────── 입력 추천 ─────────────── */

export type LedgerSuggestion = {
  memo: string;
  count: number;
  kind: LedgerEntryKind;
  amount: number;
  categoryId: number | null;
  subcategoryId: number | null;
  assetId: number | null;
  savingsId: number | null;
};

export type LedgerSuggestions = {
  items: LedgerSuggestion[];
  defaultAssetId: number | null;
};

const MAX_SUGGESTIONS = 300;
const RECENT_DAYS = 90;
const RECENT_WEIGHT = 5;

/** 내용별로 묶어 최근 값을 돌려준다. 자주, 최근에 쓴 내역이 앞에 온다. */
export const getLedgerSuggestions = async (): Promise<LedgerSuggestions> => {
  const rows = await getDb()
    .select()
    .from(schema.ledgerEntries)
    .where(and(activeEntry, ne(schema.ledgerEntries.memo, "")))
    .orderBy(asc(schema.ledgerEntries.entryDate), asc(schema.ledgerEntries.id));

  const recentFrom = kst().subtract(RECENT_DAYS, "day").format("YYYY-MM-DD");
  const assetUse = new Map<number, number>();
  const groups = new Map<
    string,
    { latest: (typeof rows)[number]; count: number; score: number }
  >();

  for (const row of rows) {
    const isRecent = row.entryDate >= recentFrom;
    if (isRecent && row.assetId != null && row.kind === "expense") {
      assetUse.set(row.assetId, (assetUse.get(row.assetId) ?? 0) + 1);
    }
    const group = groups.get(row.memo) ?? { latest: row, count: 0, score: 0 };
    group.latest = row;
    group.count += 1;
    group.score += isRecent ? RECENT_WEIGHT : 1;
    groups.set(row.memo, group);
  }

  const items = [...groups.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SUGGESTIONS)
    .map(({ latest, count }) => ({
      memo: latest.memo,
      count,
      kind: toEntryKind(latest.kind),
      amount: latest.amount,
      categoryId: latest.categoryId,
      subcategoryId: latest.subcategoryId,
      assetId: latest.assetId,
      savingsId: latest.savingsId,
    }));

  const defaultAssetId =
    [...assetUse.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { items, defaultAssetId };
};

export { MAX_NOTE_LENGTH };
