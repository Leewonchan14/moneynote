import type { SQL } from "drizzle-orm";
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/db";
import { dayjs, kst } from "@/lib/kst";
import {
  DEFAULT_CATEGORY_COLOR,
  DEFAULT_CATEGORY_ICON,
  DEFAULT_CATEGORY_STYLES,
  defaultCategoryColor,
  isCategoryColorKey,
  isCategoryIconKey,
  suggestCategoryIcon,
  type LedgerCategoryColorKey,
  type LedgerCategoryIconKey,
} from "@/lib/ledger/icons";
import { suggestLedgerCategoryName } from "@/lib/ledger/notification";

export type LedgerEntryKind = "expense" | "income" | "transfer";
export type LedgerEntrySource = "web";

export type LedgerEntryView = {
  id: number;
  entryDate: string;
  entryTime: string | null;
  kind: LedgerEntryKind;
  amount: number;
  categoryId: number | null;
  categoryName: string | null;
  categoryEmoji: string | null;
  categoryIcon: LedgerCategoryIconKey | null;
  categoryColor: LedgerCategoryColorKey | null;
  subcategoryId: number | null;
  subcategoryName: string | null;
  assetId: number | null;
  assetName: string | null;
  savingsId: number | null;
  savingsName: string | null;
  recurringId: number | null;
  memo: string;
  note: string;
  tags: string;
  tripId: number | null;
  tripName: string | null;
};

export type LedgerSavingsView = {
  id: number;
  name: string;
  startDate: string | null;
  endDate: string | null;
  monthlyAmount: number | null;
  memo: string;
  total: number;
  count: number;
  firstDate: string | null;
  lastDate: string | null;
};

export type LedgerRecurringView = {
  id: number;
  kind: LedgerEntryKind;
  amount: number;
  categoryId: number | null;
  subcategoryId: number | null;
  assetId: number | null;
  savingsId: number | null;
  memo: string;
  note: string;
  dayOfMonth: number;
  startDate: string;
  endDate: string | null;
  lastDate: string | null;
  active: boolean;
};

export type LedgerTripView = {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  entryCount: number;
  expense: number;
};

export type LedgerAccountView = {
  openingBalance: number;
  /** 기준 잔액 + 기준일 이후 오늘까지의 입금 - 지출 - 이체 */
  currentBalance: number;
  checkedBalance: number | null;
  checkedAt: string | null;
  baseDate: string | null;
};

export type LedgerMonthPayload = {
  month: string;
  prevMonth: string;
  nextMonth: string;
  account: LedgerAccountView;
  categories: {
    id: number;
    name: string;
    kind: LedgerEntryKind;
    emoji: string;
    icon: LedgerCategoryIconKey;
    color: LedgerCategoryColorKey;
    sortOrder: number;
    entryCount: number;
  }[];
  subcategories: {
    id: number;
    categoryId: number;
    name: string;
    sortOrder: number;
    entryCount: number;
  }[];
  assets: { id: number; name: string; sortOrder: number; entryCount: number }[];
  savings: LedgerSavingsView[];
  recurring: LedgerRecurringView[];
  entries: LedgerEntryView[];
  trips: LedgerTripView[];
  /** 이 달 이전 3개월 중 지출이 있던 달의 평균. 예산을 정할 때 참고한다. */
  expenseReference: {
    months: number;
    average: number | null;
    byCategory: { categoryId: number | null; average: number }[];
  };
  budget: {
    totalBudget: number | null;
    note: string;
    byCategory: { categoryId: number; amount: number }[];
  };
  summary: {
    income: number;
    expense: number;
    transfer: number;
    balance: number;
    budgetRemaining: number | null;
    budgetUsedPct: number | null;
  };
  byCategory: {
    categoryId: number | null;
    name: string;
    emoji: string;
    icon: LedgerCategoryIconKey;
    color: LedgerCategoryColorKey;
    amount: number;
    pct: number;
  }[];
  calendar: { date: string; expense: number; income: number }[];
};

export interface LedgerEntryInput {
  entryDate: string;
  entryTime?: string | null;
  kind: LedgerEntryKind;
  amount: number;
  categoryId?: number | null;
  subcategoryId?: number | null;
  assetId?: number | null;
  savingsId?: number | null;
  memo?: string;
  note?: string;
  tags?: string;
  /** 생략하면 날짜로 여행을 찾고, null이면 여행에 넣지 않는다. */
  tripId?: number | null;
}

export interface LedgerTripInput {
  name: string;
  startDate: string;
  endDate: string;
}

export interface LedgerBulkEntryInput extends Omit<LedgerEntryInput, "categoryId"> {
  categoryId?: number | null;
  categoryName?: string | null;
}

export interface LedgerBudgetInput {
  month: string;
  totalBudget: number | null;
  note?: string;
  categories?: { categoryId: number; amount: number }[];
}

export interface LedgerCategoryInput {
  name: string;
  kind: LedgerEntryKind;
  emoji?: string;
  icon?: LedgerCategoryIconKey;
  color?: LedgerCategoryColorKey;
}

export interface LedgerCategoryUpdate {
  id: number;
  name?: string;
  emoji?: string;
  icon?: LedgerCategoryIconKey;
  color?: LedgerCategoryColorKey;
}

export interface LedgerAccountInput {
  openingBalance?: number;
  actualBalance?: number;
}

export type LedgerHistoryItem = {
  id: number;
  entryId: number;
  action: "create" | "update" | "delete" | "restore";
  source: LedgerEntrySource;
  createdAt: string;
  entryDate: string;
  kind: LedgerEntryKind;
  amount: number;
  memo: string;
  canRestore: boolean;
};

/** API 밖으로 나가면 400으로 변환되는 검증 오류. */
export class LedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LedgerError";
  }
}

const MAX_AMOUNT = 1_000_000_000;
const MAX_BALANCE = 2_000_000_000;
const MAX_BULK_ENTRIES = 100;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const ACCOUNT_ID = 1;

const DEFAULT_EXPENSE_CATEGORIES = [
  ["식비", "🍚"],
  ["카페", "☕"],
  ["교통", "🚌"],
  ["생활", "🛒"],
  ["쇼핑", "🛍️"],
  ["문화", "🎬"],
  ["의료", "💊"],
  ["주거", "🏠"],
  ["숙박", "🏨"],
  ["항공", "✈️"],
  ["렌트", "🚗"],
  ["기타", "🧾"],
] as const;

const DEFAULT_INCOME_CATEGORIES = [
  ["급여", "💰"],
  ["용돈", "🎁"],
  ["이자", "🏦"],
  ["기타", "➕"],
] as const;

export const MAX_NOTE_LENGTH = 2000;

export const DEFAULT_CATEGORY_NAMES = {
  expense: DEFAULT_EXPENSE_CATEGORIES.map(([name]) => name as string),
  income: DEFAULT_INCOME_CATEGORIES.map(([name]) => name as string),
};

export const normalizeId = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new LedgerError(`${label}가 올바르지 않아요.`);
  }
  return value;
};

export const normalizeOptionalId = (value: unknown, label: string): number | null => {
  if (value == null) return null;
  return normalizeId(value, label);
};

export const normalizeEntryKind = (value: unknown): LedgerEntryKind => {
  if (value !== "expense" && value !== "income" && value !== "transfer") {
    throw new LedgerError("지출/입금/이체 구분을 확인해 주세요.");
  }
  return value;
};

export const normalizeName = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new LedgerError(`${label} 이름을 입력해 주세요.`);
  }
  return value.trim();
};

const normalizeEmoji = (value: unknown): string => {
  if (value === undefined) return "🧾";
  if (typeof value !== "string") throw new LedgerError("이모지를 확인해 주세요.");
  return value.trim() || "🧾";
};

const normalizeCategoryIcon = (value: unknown): LedgerCategoryIconKey => {
  if (!isCategoryIconKey(value)) throw new LedgerError("분류 아이콘을 확인해 주세요.");
  return value;
};

const normalizeCategoryColor = (value: unknown): LedgerCategoryColorKey => {
  if (!isCategoryColorKey(value)) throw new LedgerError("분류 색상을 확인해 주세요.");
  return value;
};

export const normalizeMemo = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value !== "string") throw new LedgerError("내용을 확인해 주세요.");
  const memo = value.trim();
  if (memo.length > 200) throw new LedgerError("내용은 200자 이하로 입력해 주세요.");
  return memo;
};

export const normalizeEntryNote = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value !== "string") throw new LedgerError("메모를 확인해 주세요.");
  const note = value.trim();
  if (note.length > MAX_NOTE_LENGTH) {
    throw new LedgerError(`메모는 ${MAX_NOTE_LENGTH}자 이하로 입력해 주세요.`);
  }
  return note;
};

const normalizeTags = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value !== "string") throw new LedgerError("태그를 확인해 주세요.");
  const tags = value.trim();
  if (tags.length > 100) throw new LedgerError("태그는 100자 이하로 입력해 주세요.");
  return tags;
};

export const normalizeAmount = (value: unknown): number => {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_AMOUNT
  ) {
    throw new LedgerError("금액은 1원 이상 10억 원 이하로 입력해 주세요.");
  }
  return value;
};

const normalizeTotalBudget = (value: unknown): number | null => {
  if (value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > MAX_AMOUNT
  ) {
    throw new LedgerError("예산은 0원 이상 10억 원 이하로 입력해 주세요.");
  }
  return value;
};

const normalizeBalance = (value: unknown): number => {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    Math.abs(value) > MAX_BALANCE
  ) {
    throw new LedgerError("잔액을 확인해 주세요.");
  }
  return value;
};

export const normalizeMonth = (value: unknown): string => {
  if (typeof value !== "string" || !MONTH_RE.test(value)) {
    throw new LedgerError("월 형식이 올바르지 않아요.");
  }
  return value;
};

export const normalizeDate = (value: unknown): string => {
  if (
    typeof value !== "string" ||
    !DATE_RE.test(value) ||
    kst(value).format("YYYY-MM-DD") !== value ||
    value < "2000-01-01" ||
    value > "2100-12-31"
  ) {
    throw new LedgerError("날짜 형식이 올바르지 않아요.");
  }
  return value;
};

const normalizeTime = (value: unknown): string | null => {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !TIME_RE.test(value)) {
    throw new LedgerError("시각 형식이 올바르지 않아요.");
  }
  return value;
};

const normalizeNote = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value !== "string") throw new LedgerError("메모를 확인해 주세요.");
  return value.trim();
};

export const toEntryKind = (kind: string): LedgerEntryKind =>
  kind === "income" || kind === "transfer" ? kind : "expense";

/** neon-http와 node-postgres 양쪽에서 쓰는 단일 SQL 실행. 한 문장이라 원자적이다. */
const executeStatement = async (statement: SQL): Promise<void> => {
  const db = getDb() as unknown as { execute: (query: SQL) => Promise<unknown> };
  await db.execute(statement);
};

export const activeEntry = isNull(schema.ledgerEntries.deletedAt);

type EntryRow = typeof schema.ledgerEntries.$inferSelect;
type CategoryRef = { name: string; emoji: string; icon: string; color: string };
type NameRef = { name: string };

export type LedgerEntryRefs = {
  categories: Map<number, CategoryRef>;
  trips: Map<number, NameRef>;
  subcategories: Map<number, NameRef>;
  assets: Map<number, NameRef>;
  savings: Map<number, NameRef>;
};

export const getEntryRefs = async (): Promise<LedgerEntryRefs> => {
  const db = getDb();
  const [categories, trips, subcategories, assets, savings] = await Promise.all([
    db.select().from(schema.ledgerCategories),
    db.select().from(schema.ledgerTrips),
    db.select().from(schema.ledgerSubcategories),
    db.select().from(schema.ledgerAssets),
    db.select().from(schema.ledgerSavings),
  ]);
  const byId = <T extends { id: number }>(rows: T[]) =>
    new Map(rows.map((row) => [row.id, row]));
  return {
    categories: byId(categories),
    trips: byId(trips),
    subcategories: byId(subcategories),
    assets: byId(assets),
    savings: byId(savings),
  };
};

const refName = (map: Map<number, NameRef>, id: number | null): string | null =>
  id == null ? null : (map.get(id)?.name ?? null);

export const toLedgerEntryView = (
  entry: EntryRow,
  refs: LedgerEntryRefs
): LedgerEntryView => {
  const category =
    entry.categoryId == null ? null : refs.categories.get(entry.categoryId);
  return {
    id: entry.id,
    entryDate: entry.entryDate,
    entryTime: entry.entryTime,
    tags: entry.tags,
    kind: toEntryKind(entry.kind),
    amount: entry.amount,
    categoryId: entry.categoryId,
    categoryName: category?.name ?? null,
    categoryEmoji: category?.emoji ?? null,
    categoryIcon: (category?.icon ?? null) as LedgerCategoryIconKey | null,
    categoryColor: (category?.color ?? null) as LedgerCategoryColorKey | null,
    subcategoryId: entry.subcategoryId,
    subcategoryName: refName(refs.subcategories, entry.subcategoryId),
    assetId: entry.assetId,
    assetName: refName(refs.assets, entry.assetId),
    savingsId: entry.savingsId,
    savingsName: refName(refs.savings, entry.savingsId),
    recurringId: entry.recurringId,
    memo: entry.memo,
    note: entry.note,
    tripId: entry.tripId,
    tripName: refName(refs.trips, entry.tripId),
  };
};

/** 최신순: 날짜, 시각(없으면 뒤로), id */
export const compareLedgerEntries = (
  a: Pick<LedgerEntryView, "id" | "entryDate" | "entryTime">,
  b: Pick<LedgerEntryView, "id" | "entryDate" | "entryTime">
): number =>
  b.entryDate.localeCompare(a.entryDate) ||
  (b.entryTime ?? "").localeCompare(a.entryTime ?? "") ||
  b.id - a.id;

export const logEntryHistory = async (
  entryId: number,
  action: LedgerHistoryItem["action"],
  source: LedgerEntrySource,
  before: EntryRow | null,
  after: EntryRow | null
): Promise<void> => {
  try {
    await getDb()
      .insert(schema.ledgerEntryHistory)
      .values({ entryId, action, source, before, after });
  } catch (error) {
    // 이력 기록 실패가 사용자의 저장을 되돌리면 안 된다.
    console.error("[ledger] failed to write history:", error);
  }
};

/**
 * 분류 테이블이 비어 있을 때만 기본값을 넣는다.
 * 여러 요청이 동시에 들어와도 unique 인덱스 덕분에 안전하다.
 */
export const ensureLedgerDefaults = async (): Promise<void> => {
  const db = getDb();

  const [categoryCount] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(schema.ledgerCategories);

  if (categoryCount?.value) return;

  await db
    .insert(schema.ledgerCategories)
    .values([
      ...DEFAULT_EXPENSE_CATEGORIES.map(([name, emoji], index) => {
        const style = DEFAULT_CATEGORY_STYLES[name] ?? {
          icon: suggestCategoryIcon(name),
          color: defaultCategoryColor(suggestCategoryIcon(name)),
        };
        return {
          name,
          emoji,
          kind: "expense" as const,
          icon: style.icon,
          color: style.color,
          sortOrder: index,
        };
      }),
      ...DEFAULT_INCOME_CATEGORIES.map(([name, emoji], index) => {
        const style =
          name === "기타"
            ? { icon: "plus" as const, color: "neutral" as const }
            : (DEFAULT_CATEGORY_STYLES[name] ?? {
                icon: suggestCategoryIcon(name),
                color: defaultCategoryColor(suggestCategoryIcon(name)),
              });
        return {
          name,
          emoji,
          kind: "income" as const,
          icon: style.icon,
          color: style.color,
          sortOrder: index,
        };
      }),
    ])
    .onConflictDoNothing();
};

export type LedgerBalanceBase = {
  openingBalance: number;
  baseDate: string | null;
  checkedAt: Date | null;
  checkedBalance: number | null;
};

export const getLedgerBalanceBase = async (): Promise<LedgerBalanceBase> => {
  const [row] = await getDb()
    .select()
    .from(schema.ledgerAccount)
    .where(eq(schema.ledgerAccount.id, ACCOUNT_ID))
    .limit(1);
  return {
    openingBalance: row?.openingBalance ?? 0,
    baseDate: row?.baseDate ?? null,
    checkedAt: row?.checkedAt ?? null,
    checkedBalance: row?.checkedBalance ?? null,
  };
};

/**
 * 잔액에 더할 내역인지 판단한다. 기준일 다음 날부터 더하고, 기준일 당일 내역은
 * 실제 잔액을 맞춘 뒤에 추가한 것만 더한다.
 */
export const countsTowardBalance = (
  entry: Pick<EntryRow, "entryDate" | "createdAt">,
  base: LedgerBalanceBase
): boolean => {
  if (!base.baseDate || entry.entryDate > base.baseDate) return true;
  if (entry.entryDate < base.baseDate || !base.checkedAt || !entry.createdAt) {
    return false;
  }
  return entry.createdAt > base.checkedAt;
};

export const getLedgerAccount = async (): Promise<LedgerAccountView> => {
  const base = await getLedgerBalanceBase();
  const rows = await getDb()
    .select({
      entryDate: schema.ledgerEntries.entryDate,
      createdAt: schema.ledgerEntries.createdAt,
      kind: schema.ledgerEntries.kind,
      amount: schema.ledgerEntries.amount,
    })
    .from(schema.ledgerEntries)
    .where(
      and(
        activeEntry,
        lte(schema.ledgerEntries.entryDate, kst().format("YYYY-MM-DD")),
        base.baseDate ? gte(schema.ledgerEntries.entryDate, base.baseDate) : undefined
      )
    );
  const net = rows
    .filter((row) => countsTowardBalance(row, base))
    .reduce((sum, row) => sum + (row.kind === "income" ? row.amount : -row.amount), 0);
  return {
    openingBalance: base.openingBalance,
    currentBalance: base.openingBalance + net,
    checkedBalance: base.checkedBalance,
    checkedAt: base.checkedAt?.toISOString() ?? null,
    baseDate: base.baseDate,
  };
};

/** 기준 잔액을 직접 정하거나, 오늘을 기준일로 실제 통장 잔액에 맞춘다. */
export const saveLedgerAccount = async (
  input: LedgerAccountInput
): Promise<LedgerAccountView> => {
  const db = getDb();
  const now = new Date();

  if (input.actualBalance !== undefined) {
    const actualBalance = normalizeBalance(input.actualBalance);
    const values = {
      openingBalance: actualBalance,
      checkedBalance: actualBalance,
      checkedAt: now,
      baseDate: kst().format("YYYY-MM-DD"),
      updatedAt: now,
    };
    await db
      .insert(schema.ledgerAccount)
      .values({ id: ACCOUNT_ID, ...values })
      .onConflictDoUpdate({ target: schema.ledgerAccount.id, set: values });
    return getLedgerAccount();
  }

  if (input.openingBalance === undefined) {
    throw new LedgerError("잔액을 입력해 주세요.");
  }
  const openingBalance = normalizeBalance(input.openingBalance);
  await db
    .insert(schema.ledgerAccount)
    .values({ id: ACCOUNT_ID, openingBalance, updatedAt: now })
    .onConflictDoUpdate({
      target: schema.ledgerAccount.id,
      set: { openingBalance, updatedAt: now },
    });
  return getLedgerAccount();
};

export const getCategoryRows = () =>
  getDb()
    .select()
    .from(schema.ledgerCategories)
    .orderBy(asc(schema.ledgerCategories.sortOrder), asc(schema.ledgerCategories.id));

export const getLedgerMonth = async (month: string): Promise<LedgerMonthPayload> => {
  const validMonth = normalizeMonth(month);
  await ensureLedgerDefaults();

  const db = getDb();
  const monthStart = `${validMonth}-01`;
  const monthEnd = `${validMonth}-31`;

  const referenceStart = dayjs(monthStart).subtract(3, "month").format("YYYY-MM-DD");
  const referenceMonth = sql<string>`substr(${schema.ledgerEntries.entryDate}, 1, 7)`;

  const [
    categoryRows,
    entryRows,
    monthRows,
    budgetRows,
    usageRows,
    account,
    referenceRows,
  ] = await Promise.all([
    getCategoryRows(),
    db
      .select()
      .from(schema.ledgerEntries)
      .where(
        and(
          activeEntry,
          gte(schema.ledgerEntries.entryDate, monthStart),
          lte(schema.ledgerEntries.entryDate, monthEnd)
        )
      )
      .orderBy(desc(schema.ledgerEntries.entryDate), desc(schema.ledgerEntries.id)),
    db
      .select()
      .from(schema.ledgerMonths)
      .where(eq(schema.ledgerMonths.month, validMonth))
      .limit(1),
    db
      .select()
      .from(schema.ledgerBudgets)
      .where(eq(schema.ledgerBudgets.month, validMonth)),
    db
      .select({
        categoryId: schema.ledgerEntries.categoryId,
        value: sql<number>`count(*)::int`,
      })
      .from(schema.ledgerEntries)
      .groupBy(schema.ledgerEntries.categoryId),
    getLedgerAccount(),
    db
      .select({
        month: referenceMonth,
        categoryId: schema.ledgerEntries.categoryId,
        amount: sql<number>`sum(${schema.ledgerEntries.amount})::bigint`,
      })
      .from(schema.ledgerEntries)
      .where(
        and(
          activeEntry,
          eq(schema.ledgerEntries.kind, "expense"),
          gte(schema.ledgerEntries.entryDate, referenceStart),
          lt(schema.ledgerEntries.entryDate, monthStart)
        )
      )
      .groupBy(referenceMonth, schema.ledgerEntries.categoryId),
  ]);

  const [tripRows, tripUsageRows] = await Promise.all([
    getTripRows(),
    db
      .select({
        tripId: schema.ledgerEntries.tripId,
        entryCount: sql<number>`count(*)::int`,
        expense: sql<number>`coalesce(sum(${schema.ledgerEntries.amount}), 0)::bigint`,
      })
      .from(schema.ledgerEntries)
      .where(and(activeEntry, eq(schema.ledgerEntries.kind, "expense")))
      .groupBy(schema.ledgerEntries.tripId),
  ]);
  const tripById = new Map(tripRows.map((trip) => [trip.id, trip]));
  const tripUsage = new Map(tripUsageRows.map((row) => [row.tripId, row]));
  const trips = tripRows.map((trip) => ({
    id: trip.id,
    name: trip.name,
    startDate: trip.startDate,
    endDate: trip.endDate,
    entryCount: tripUsage.get(trip.id)?.entryCount ?? 0,
    expense: Number(tripUsage.get(trip.id)?.expense ?? 0),
  }));

  const [
    subcategoryRows,
    assetRows,
    savingsRows,
    recurringRows,
    subcategoryUsage,
    assetUsage,
    savingsUsage,
  ] = await Promise.all([
    db
      .select()
      .from(schema.ledgerSubcategories)
      .orderBy(
        asc(schema.ledgerSubcategories.sortOrder),
        asc(schema.ledgerSubcategories.id)
      ),
    db
      .select()
      .from(schema.ledgerAssets)
      .orderBy(asc(schema.ledgerAssets.sortOrder), asc(schema.ledgerAssets.id)),
    db
      .select()
      .from(schema.ledgerSavings)
      .orderBy(asc(schema.ledgerSavings.sortOrder), asc(schema.ledgerSavings.id)),
    db.select().from(schema.ledgerRecurring).orderBy(asc(schema.ledgerRecurring.id)),
    db
      .select({
        id: schema.ledgerEntries.subcategoryId,
        value: sql<number>`count(*)::int`,
      })
      .from(schema.ledgerEntries)
      .where(activeEntry)
      .groupBy(schema.ledgerEntries.subcategoryId),
    db
      .select({
        id: schema.ledgerEntries.assetId,
        value: sql<number>`count(*)::int`,
      })
      .from(schema.ledgerEntries)
      .where(activeEntry)
      .groupBy(schema.ledgerEntries.assetId),
    db
      .select({
        id: schema.ledgerEntries.savingsId,
        count: sql<number>`count(*)::int`,
        total: sql<number>`coalesce(sum(${schema.ledgerEntries.amount}), 0)::bigint`,
        firstDate: sql<string>`min(${schema.ledgerEntries.entryDate})`,
        lastDate: sql<string>`max(${schema.ledgerEntries.entryDate})`,
      })
      .from(schema.ledgerEntries)
      .where(and(activeEntry, eq(schema.ledgerEntries.kind, "transfer")))
      .groupBy(schema.ledgerEntries.savingsId),
  ]);

  const subcategoryCounts = new Map(subcategoryUsage.map((row) => [row.id, row.value]));
  const assetCounts = new Map(assetUsage.map((row) => [row.id, row.value]));
  const savingsStats = new Map(savingsUsage.map((row) => [row.id, row]));

  const subcategories = subcategoryRows.map((row) => ({
    id: row.id,
    categoryId: row.categoryId,
    name: row.name,
    sortOrder: row.sortOrder,
    entryCount: subcategoryCounts.get(row.id) ?? 0,
  }));
  const assets = assetRows.map((row) => ({
    id: row.id,
    name: row.name,
    sortOrder: row.sortOrder,
    entryCount: assetCounts.get(row.id) ?? 0,
  }));
  const savings = savingsRows.map((row) => {
    const stats = savingsStats.get(row.id);
    return {
      id: row.id,
      name: row.name,
      startDate: row.startDate,
      endDate: row.endDate,
      monthlyAmount: row.monthlyAmount,
      memo: row.memo,
      total: Number(stats?.total ?? 0),
      count: stats?.count ?? 0,
      firstDate: stats?.firstDate ?? null,
      lastDate: stats?.lastDate ?? null,
    };
  });
  const recurring = recurringRows.map((row) => ({
    id: row.id,
    kind: toEntryKind(row.kind),
    amount: row.amount,
    categoryId: row.categoryId,
    subcategoryId: row.subcategoryId,
    assetId: row.assetId,
    savingsId: row.savingsId,
    memo: row.memo,
    note: row.note,
    dayOfMonth: row.dayOfMonth,
    startDate: row.startDate,
    endDate: row.endDate,
    lastDate: row.lastDate,
    active: row.active,
  }));

  const usageByCategory = new Map(usageRows.map((row) => [row.categoryId, row.value]));
  const categories = categoryRows.map((category) => ({
    id: category.id,
    name: category.name,
    kind: toEntryKind(category.kind),
    emoji: category.emoji,
    icon: category.icon as LedgerCategoryIconKey,
    color: category.color as LedgerCategoryColorKey,
    sortOrder: category.sortOrder,
    entryCount: usageByCategory.get(category.id) ?? 0,
  }));

  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const refs: LedgerEntryRefs = {
    categories: categoryById,
    trips: tripById,
    subcategories: new Map(subcategories.map((row) => [row.id, row])),
    assets: new Map(assets.map((row) => [row.id, row])),
    savings: new Map(savings.map((row) => [row.id, row])),
  };
  const entries = entryRows
    .map((entry) => toLedgerEntryView(entry, refs))
    .sort(compareLedgerEntries);

  let income = 0;
  let expense = 0;
  let transfer = 0;
  const categoryTotals = new Map<number | null, number>();
  const calendarTotals = new Map<string, { expense: number; income: number }>();

  for (const entry of entries) {
    if (entry.kind === "transfer") {
      transfer += entry.amount;
      continue;
    }

    const day = calendarTotals.get(entry.entryDate) ?? { expense: 0, income: 0 };

    if (entry.kind === "income") {
      income += entry.amount;
      day.income += entry.amount;
    } else {
      expense += entry.amount;
      day.expense += entry.amount;
      categoryTotals.set(
        entry.categoryId,
        (categoryTotals.get(entry.categoryId) ?? 0) + entry.amount
      );
    }

    calendarTotals.set(entry.entryDate, day);
  }

  const totalBudget = monthRows[0]?.totalBudget ?? null;

  const referenceMonths = new Set(referenceRows.map((row) => row.month)).size;
  const referenceByCategory = new Map<number | null, number>();
  for (const row of referenceRows) {
    referenceByCategory.set(
      row.categoryId,
      (referenceByCategory.get(row.categoryId) ?? 0) + Number(row.amount)
    );
  }
  const expenseReference = {
    months: referenceMonths,
    average: referenceMonths
      ? Math.round(
          [...referenceByCategory.values()].reduce((sum, value) => sum + value, 0) /
            referenceMonths
        )
      : null,
    byCategory: [...referenceByCategory.entries()].map(([categoryId, amount]) => ({
      categoryId,
      average: Math.round(amount / referenceMonths),
    })),
  };

  const byCategory = [...categoryTotals.entries()]
    .map(([categoryId, amount]) => {
      const category = categoryId == null ? null : categoryById.get(categoryId);
      return {
        categoryId,
        name: category?.name ?? "분류 없음",
        emoji: category?.emoji ?? "🧾",
        icon: category?.icon ?? DEFAULT_CATEGORY_ICON,
        color: category?.color ?? DEFAULT_CATEGORY_COLOR,
        amount,
        pct: expense === 0 ? 0 : Math.round((amount / expense) * 100),
      };
    })
    .sort((a, b) => b.amount - a.amount);

  const calendar = [...calendarTotals.entries()]
    .map(([date, totals]) => ({ date, ...totals }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    month: validMonth,
    prevMonth: dayjs(`${validMonth}-01`).subtract(1, "month").format("YYYY-MM"),
    nextMonth: dayjs(`${validMonth}-01`).add(1, "month").format("YYYY-MM"),
    account,
    categories,
    subcategories,
    assets,
    savings,
    recurring,
    entries,
    trips,
    expenseReference,
    budget: {
      totalBudget,
      note: monthRows[0]?.note ?? "",
      byCategory: budgetRows.map((row) => ({
        categoryId: row.categoryId,
        amount: row.amount,
      })),
    },
    summary: {
      income,
      expense,
      transfer,
      balance: income - expense,
      budgetRemaining: totalBudget == null ? null : totalBudget - expense,
      budgetUsedPct:
        totalBudget == null || totalBudget === 0
          ? null
          : Math.round((expense / totalBudget) * 100),
    },
    byCategory,
    calendar,
  };
};

const normalizeEntryFields = (input: LedgerEntryInput) => ({
  entryDate: normalizeDate(input.entryDate),
  entryTime: normalizeTime(input.entryTime),
  kind: normalizeEntryKind(input.kind),
  amount: normalizeAmount(input.amount),
  categoryId: normalizeOptionalId(input.categoryId, "분류"),
  memo: normalizeMemo(input.memo),
  note: normalizeEntryNote(input.note),
  tags: normalizeTags(input.tags),
});

/** 구분에 맞지 않는 연결을 비우고, 연결 대상이 실제로 있는지 확인한다. */
export const resolveEntryLinks = async (
  kind: LedgerEntryKind,
  input: {
    categoryId?: unknown;
    subcategoryId?: unknown;
    assetId?: unknown;
    savingsId?: unknown;
  }
) => {
  const db = getDb();
  const categoryId =
    kind === "transfer" ? null : normalizeOptionalId(input.categoryId, "분류");
  const subcategoryId =
    categoryId == null ? null : normalizeOptionalId(input.subcategoryId, "소분류");
  const assetId = normalizeOptionalId(input.assetId, "결제수단");
  const savingsId =
    kind === "transfer" ? normalizeOptionalId(input.savingsId, "저축 상품") : null;

  if (kind === "transfer" && savingsId == null) {
    throw new LedgerError("이체할 저축 상품을 선택해 주세요.");
  }
  await assertCategoryKind(categoryId, kind);
  if (subcategoryId != null) {
    const [row] = await db
      .select({ categoryId: schema.ledgerSubcategories.categoryId })
      .from(schema.ledgerSubcategories)
      .where(eq(schema.ledgerSubcategories.id, subcategoryId))
      .limit(1);
    if (row?.categoryId !== categoryId) {
      throw new LedgerError("소분류가 선택한 분류에 속하지 않아요.");
    }
  }
  if (assetId != null) {
    const [row] = await db
      .select({ id: schema.ledgerAssets.id })
      .from(schema.ledgerAssets)
      .where(eq(schema.ledgerAssets.id, assetId))
      .limit(1);
    if (!row) throw new LedgerError("결제수단을 찾을 수 없어요.");
  }
  if (savingsId != null) {
    const [row] = await db
      .select({ id: schema.ledgerSavings.id })
      .from(schema.ledgerSavings)
      .where(eq(schema.ledgerSavings.id, savingsId))
      .limit(1);
    if (!row) throw new LedgerError("저축 상품을 찾을 수 없어요.");
  }
  return { categoryId, subcategoryId, assetId, savingsId };
};

const assertCategoryKind = async (categoryId: number | null, kind: LedgerEntryKind) => {
  if (categoryId == null) return;
  const [category] = await getDb()
    .select({ kind: schema.ledgerCategories.kind })
    .from(schema.ledgerCategories)
    .where(eq(schema.ledgerCategories.id, categoryId))
    .limit(1);
  if (!category) throw new LedgerError("분류를 찾을 수 없어요.");
  if (toEntryKind(category.kind) !== kind) {
    throw new LedgerError("분류의 입금/지출 구분이 맞지 않아요.");
  }
};

export const createLedgerEntry = async (
  input: LedgerEntryInput,
  source: LedgerEntrySource = "web"
) => {
  const fields = normalizeEntryFields(input);
  const values = { ...fields, ...(await resolveEntryLinks(fields.kind, input)) };
  const tripId = resolveTripId(
    input.tripId,
    values.entryDate,
    values.kind,
    await getTripRows()
  );
  const [entry] = await getDb()
    .insert(schema.ledgerEntries)
    .values({ ...values, tripId })
    .returning();
  await logEntryHistory(entry.id, "create", source, null, entry);
  return entry;
};

/**
 * 여러 건을 한 번에 등록한다. 같은 날짜·금액·구분·내용의 기록은 이미 있다고 보고 건너뛴다.
 * 시각이 양쪽 모두 있고 서로 다르면 다른 기록으로 본다.
 */
export const createLedgerEntriesBulk = async (
  inputs: LedgerBulkEntryInput[],
  options: { source: LedgerEntrySource; allowDuplicates?: boolean }
) => {
  if (!Array.isArray(inputs) || !inputs.length) {
    throw new LedgerError("등록할 내역이 없어요.");
  }
  if (inputs.length > MAX_BULK_ENTRIES) {
    throw new LedgerError(`한 번에 ${MAX_BULK_ENTRIES}건까지 등록할 수 있어요.`);
  }

  await ensureLedgerDefaults();
  const db = getDb();
  const [categories, trips] = await Promise.all([getCategoryRows(), getTripRows()]);
  const categoryIdByKey = new Map(
    categories.map((category) => [`${category.kind}:${category.name}`, category.id])
  );

  const normalized = inputs.map((input) => {
    if (typeof input !== "object" || input === null) {
      throw new LedgerError("내역 형식을 확인해 주세요.");
    }
    const fields = normalizeEntryFields(input);
    if (fields.kind === "transfer") {
      throw new LedgerError("이체는 한 번에 등록할 수 없어요.");
    }
    const named =
      typeof input.categoryName === "string"
        ? categoryIdByKey.get(`${fields.kind}:${input.categoryName.trim()}`)
        : undefined;
    const suggestedName = suggestLedgerCategoryName(fields.memo, fields.kind);
    const suggested = suggestedName
      ? categoryIdByKey.get(`${fields.kind}:${suggestedName}`)
      : undefined;
    return {
      ...fields,
      categoryId: fields.categoryId ?? named ?? suggested ?? null,
      tripId: resolveTripId(input.tripId, fields.entryDate, fields.kind, trips),
    };
  });

  for (const fields of normalized) {
    if (
      fields.categoryId != null &&
      !categories.some(
        (category) =>
          category.id === fields.categoryId && toEntryKind(category.kind) === fields.kind
      )
    ) {
      throw new LedgerError("분류의 입금/지출 구분이 맞지 않아요.");
    }
  }

  const existing = await db
    .select()
    .from(schema.ledgerEntries)
    .where(
      and(
        activeEntry,
        inArray(schema.ledgerEntries.entryDate, [
          ...new Set(normalized.map((fields) => fields.entryDate)),
        ])
      )
    );
  const seen = [...existing];

  type Candidate = (typeof normalized)[number];
  const isDuplicate = (fields: Candidate) =>
    seen.some(
      (row) =>
        row.entryDate === fields.entryDate &&
        row.amount === fields.amount &&
        row.kind === fields.kind &&
        row.memo === fields.memo &&
        (row.entryTime == null ||
          fields.entryTime == null ||
          row.entryTime === fields.entryTime)
    );

  const toInsert: Candidate[] = [];
  let skipped = 0;
  for (const fields of normalized) {
    if (!options.allowDuplicates && isDuplicate(fields)) {
      skipped += 1;
      continue;
    }
    toInsert.push(fields);
    seen.push({ ...(fields as unknown as EntryRow) });
  }

  if (!toInsert.length) return { created: [] as EntryRow[], skipped };

  const created = await db.insert(schema.ledgerEntries).values(toInsert).returning();
  await Promise.all(
    created.map((entry) =>
      logEntryHistory(entry.id, "create", options.source, null, entry)
    )
  );
  return { created, skipped };
};

const findActiveEntry = async (entryId: number): Promise<EntryRow> => {
  const [entry] = await getDb()
    .select()
    .from(schema.ledgerEntries)
    .where(and(eq(schema.ledgerEntries.id, entryId), activeEntry))
    .limit(1);
  if (!entry) throw new LedgerError("기록을 찾을 수 없어요.");
  return entry;
};

export const updateLedgerEntry = async (
  id: number,
  input: LedgerEntryInput,
  source: LedgerEntrySource = "web"
) => {
  const entryId = normalizeId(id, "기록");
  const fields = normalizeEntryFields(input);
  const values = { ...fields, ...(await resolveEntryLinks(fields.kind, input)) };
  const tripPatch =
    input.tripId === undefined
      ? {}
      : {
          tripId: resolveTripId(
            input.tripId,
            values.entryDate,
            values.kind,
            await getTripRows()
          ),
        };
  const before = await findActiveEntry(entryId);
  const [entry] = await getDb()
    .update(schema.ledgerEntries)
    .set({ ...values, ...tripPatch, updatedAt: new Date() })
    .where(and(eq(schema.ledgerEntries.id, entryId), activeEntry))
    .returning();
  if (!entry) throw new LedgerError("기록을 찾을 수 없어요.");
  await logEntryHistory(entryId, "update", source, before, entry);
  return entry;
};

/** 복구할 수 있게 표시만 지운다. */
export const deleteLedgerEntry = async (
  id: number,
  source: LedgerEntrySource = "web"
): Promise<void> => {
  const entryId = normalizeId(id, "기록");
  const [entry] = await getDb()
    .update(schema.ledgerEntries)
    .set({ deletedAt: new Date() })
    .where(and(eq(schema.ledgerEntries.id, entryId), activeEntry))
    .returning();
  if (!entry) throw new LedgerError("기록을 찾을 수 없어요.");
  await logEntryHistory(entryId, "delete", source, entry, null);
};

export const restoreLedgerEntry = async (id: number) => {
  const entryId = normalizeId(id, "기록");
  const [entry] = await getDb()
    .update(schema.ledgerEntries)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(schema.ledgerEntries.id, entryId),
        sql`${schema.ledgerEntries.deletedAt} is not null`
      )
    )
    .returning();
  if (!entry) throw new LedgerError("되돌릴 기록을 찾을 수 없어요.");
  await logEntryHistory(entryId, "restore", "web", null, entry);
  return entry;
};

const getTripRows = () =>
  getDb()
    .select()
    .from(schema.ledgerTrips)
    .orderBy(desc(schema.ledgerTrips.startDate), desc(schema.ledgerTrips.id));

type TripRow = typeof schema.ledgerTrips.$inferSelect;

/** undefined면 지출 날짜가 정확히 한 여행 기간에 들 때만 그 여행으로 묶는다. */
const resolveTripId = (
  value: unknown,
  entryDate: string,
  kind: LedgerEntryKind,
  trips: TripRow[]
): number | null => {
  if (value === undefined) {
    if (kind !== "expense") return null;
    const matches = trips.filter(
      (trip) => trip.startDate <= entryDate && entryDate <= trip.endDate
    );
    return matches.length === 1 ? matches[0].id : null;
  }
  const tripId = normalizeOptionalId(value, "여행");
  if (tripId != null && !trips.some((trip) => trip.id === tripId)) {
    throw new LedgerError("여행을 찾을 수 없어요.");
  }
  return tripId;
};

const normalizeTripFields = (input: LedgerTripInput) => {
  const name = normalizeName(input.name, "여행");
  if (name.length > 30) throw new LedgerError("여행 이름은 30자 이하로 입력해 주세요.");
  const startDate = normalizeDate(input.startDate);
  const endDate = normalizeDate(input.endDate);
  if (startDate > endDate) {
    throw new LedgerError("시작일은 종료일보다 늦을 수 없어요.");
  }
  return { name, startDate, endDate };
};

export const createLedgerTrip = async (input: LedgerTripInput) => {
  const [trip] = await getDb()
    .insert(schema.ledgerTrips)
    .values(normalizeTripFields(input))
    .returning();
  return trip;
};

export const updateLedgerTrip = async (id: unknown, input: LedgerTripInput) => {
  const tripId = normalizeId(id, "여행");
  const [trip] = await getDb()
    .update(schema.ledgerTrips)
    .set(normalizeTripFields(input))
    .where(eq(schema.ledgerTrips.id, tripId))
    .returning();
  if (!trip) throw new LedgerError("여행을 찾을 수 없어요.");
  return trip;
};

/** 여행만 지운다. 연결된 내역은 남고 여행 표시만 사라진다. */
export const deleteLedgerTrip = async (id: unknown): Promise<void> => {
  const tripId = normalizeId(id, "여행");
  await getDb().delete(schema.ledgerTrips).where(eq(schema.ledgerTrips.id, tripId));
};

/** 여행 기간에 들어 있지만 아직 어떤 여행에도 연결되지 않은 지출. */
export const listTripCandidates = async (id: unknown): Promise<LedgerEntryView[]> => {
  const tripId = normalizeId(id, "여행");
  const [[trip], refs] = await Promise.all([
    getDb()
      .select()
      .from(schema.ledgerTrips)
      .where(eq(schema.ledgerTrips.id, tripId))
      .limit(1),
    getEntryRefs(),
  ]);
  if (!trip) throw new LedgerError("여행을 찾을 수 없어요.");

  const rows = await getDb()
    .select()
    .from(schema.ledgerEntries)
    .where(
      and(
        activeEntry,
        isNull(schema.ledgerEntries.tripId),
        eq(schema.ledgerEntries.kind, "expense"),
        gte(schema.ledgerEntries.entryDate, trip.startDate),
        lte(schema.ledgerEntries.entryDate, trip.endDate)
      )
    );
  return rows.map((row) => toLedgerEntryView(row, refs)).sort(compareLedgerEntries);
};

export const attachEntriesToTrip = async (
  id: unknown,
  entryIdsInput: unknown
): Promise<number> => {
  const tripId = normalizeId(id, "여행");
  if (!Array.isArray(entryIdsInput) || !entryIdsInput.length) {
    throw new LedgerError("연결할 내역을 골라 주세요.");
  }
  if (entryIdsInput.length > MAX_BULK_ENTRIES) {
    throw new LedgerError(`한 번에 ${MAX_BULK_ENTRIES}건까지 연결할 수 있어요.`);
  }
  const entryIds = entryIdsInput.map((value) => normalizeId(value, "기록"));
  const trips = await getTripRows();
  if (!trips.some((trip) => trip.id === tripId)) {
    throw new LedgerError("여행을 찾을 수 없어요.");
  }

  const db = getDb();
  const targets = and(activeEntry, inArray(schema.ledgerEntries.id, entryIds));
  const before = await db.select().from(schema.ledgerEntries).where(targets);
  const updated = await db
    .update(schema.ledgerEntries)
    .set({ tripId, updatedAt: new Date() })
    .where(targets)
    .returning();

  const beforeById = new Map(before.map((row) => [row.id, row]));
  await Promise.all(
    updated.map((row) =>
      logEntryHistory(row.id, "update", "web", beforeById.get(row.id) ?? null, row)
    )
  );
  return updated.length;
};

/** 삭제되지 않은 모든 기록. CSV 내보내기용. */
export const listAllLedgerEntries = async (): Promise<LedgerEntryView[]> => {
  const [rows, refs] = await Promise.all([
    getDb().select().from(schema.ledgerEntries).where(activeEntry),
    getEntryRefs(),
  ]);
  return rows.map((row) => toLedgerEntryView(row, refs)).sort(compareLedgerEntries);
};

/** 내용·태그·분류 이름으로 전 기간을 검색한다. */
export const searchLedgerEntries = async (query: string, limit = 200) => {
  const q = query.trim();
  if (!q) return { entries: [] as LedgerEntryView[], income: 0, expense: 0, count: 0 };

  const [rows, refs] = await Promise.all([
    getDb().select().from(schema.ledgerEntries).where(activeEntry),
    getEntryRefs(),
  ]);
  const lowered = q.toLowerCase();

  // 화면에 보이는 값으로 찾는다.
  const views = rows
    .map((row) => toLedgerEntryView(row, refs))
    .filter((entry) =>
      [
        entry.memo,
        entry.note,
        entry.tags,
        entry.categoryName ?? "",
        entry.subcategoryName ?? "",
        entry.assetName ?? "",
        entry.savingsName ?? "",
        entry.tripName ?? "",
      ].some((value) => value.toLowerCase().includes(lowered))
    )
    .sort(compareLedgerEntries);

  return {
    entries: views.slice(0, limit),
    income: views
      .filter((e) => e.kind === "income")
      .reduce((sum, e) => sum + e.amount, 0),
    expense: views
      .filter((e) => e.kind === "expense")
      .reduce((sum, e) => sum + e.amount, 0),
    count: views.length,
  };
};

export const listLedgerHistory = async (limit = 50): Promise<LedgerHistoryItem[]> => {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.ledgerEntryHistory)
    .orderBy(
      desc(schema.ledgerEntryHistory.createdAt),
      desc(schema.ledgerEntryHistory.id)
    )
    .limit(limit);

  const deleted = rows.length
    ? await db
        .select({ id: schema.ledgerEntries.id })
        .from(schema.ledgerEntries)
        .where(
          and(
            inArray(schema.ledgerEntries.id, [
              ...new Set(rows.map((row) => row.entryId)),
            ]),
            sql`${schema.ledgerEntries.deletedAt} is not null`
          )
        )
    : [];
  const deletedIds = new Set(deleted.map((row) => row.id));
  const seenDelete = new Set<number>();

  return rows.map((row) => {
    const snapshot = (row.after ?? row.before ?? {}) as Partial<EntryRow>;
    const latestDelete = row.action === "delete" && !seenDelete.has(row.entryId);
    if (row.action === "delete") seenDelete.add(row.entryId);
    return {
      id: row.id,
      entryId: row.entryId,
      action: row.action as LedgerHistoryItem["action"],
      source: "web",
      createdAt: row.createdAt.toISOString(),
      entryDate: snapshot.entryDate ?? "",
      kind: toEntryKind(snapshot.kind ?? "expense"),
      amount: snapshot.amount ?? 0,
      memo: snapshot.memo ?? "",
      canRestore: latestDelete && deletedIds.has(row.entryId),
    };
  });
};

export const saveLedgerBudget = async (input: LedgerBudgetInput): Promise<void> => {
  const month = normalizeMonth(input.month);
  const totalBudget = normalizeTotalBudget(input.totalBudget);
  const note = normalizeNote(input.note);

  const budgetByCategory = new Map<number, number>();
  if (input.categories !== undefined && !Array.isArray(input.categories)) {
    throw new LedgerError("분류별 예산을 확인해 주세요.");
  }
  for (const row of input.categories ?? []) {
    if (typeof row !== "object" || row === null) {
      throw new LedgerError("분류별 예산을 확인해 주세요.");
    }
    const categoryId = normalizeId(row.categoryId, "분류");
    const amount = normalizeTotalBudget(row.amount);
    if (amount == null) continue;
    budgetByCategory.set(categoryId, amount);
  }

  if (budgetByCategory.size) {
    const ids = [...budgetByCategory.keys()];
    const existing = await getDb()
      .select({ id: schema.ledgerCategories.id })
      .from(schema.ledgerCategories)
      .where(inArray(schema.ledgerCategories.id, ids));
    if (existing.length !== ids.length) {
      throw new LedgerError("분류를 찾을 수 없어요.");
    }
  }

  const rows = JSON.stringify(
    [...budgetByCategory.entries()]
      .filter(([, amount]) => amount > 0)
      .map(([category_id, amount]) => ({ category_id, amount }))
  );

  // 드라이버와 상관없이 원자적으로 저장되도록 한 문장으로 처리한다.
  await executeStatement(sql`
    with new_rows as (
      select category_id, amount
      from jsonb_to_recordset(${rows}::jsonb) as r(category_id int, amount int)
    ),
    saved_month as (
      insert into ledger_months (month, total_budget, note, updated_at)
      values (${month}, ${totalBudget}, ${note}, now())
      on conflict (month) do update
        set total_budget = excluded.total_budget,
            note = excluded.note,
            updated_at = now()
    ),
    removed as (
      delete from ledger_budgets
      where month = ${month}
        and category_id not in (select category_id from new_rows)
    )
    insert into ledger_budgets (month, category_id, amount)
    select ${month}, category_id, amount from new_rows
    on conflict (month, category_id) do update set amount = excluded.amount
  `);
};

export const createLedgerCategory = async (input: LedgerCategoryInput) => {
  const name = normalizeName(input.name, "분류");
  const kind = normalizeEntryKind(input.kind);
  if (kind === "transfer") throw new LedgerError("이체에는 분류를 만들 수 없어요.");
  const emoji = normalizeEmoji(input.emoji);
  const icon =
    input.icon === undefined
      ? suggestCategoryIcon(name)
      : normalizeCategoryIcon(input.icon);
  const color =
    input.color === undefined
      ? defaultCategoryColor(icon)
      : normalizeCategoryColor(input.color);
  const db = getDb();

  const [maxRow] = await db
    .select({
      value: sql<number>`coalesce(max(${schema.ledgerCategories.sortOrder}), -1)`,
    })
    .from(schema.ledgerCategories)
    .where(eq(schema.ledgerCategories.kind, kind));

  const [category] = await db
    .insert(schema.ledgerCategories)
    .values({
      name,
      kind,
      emoji,
      icon,
      color,
      sortOrder: Number(maxRow?.value ?? -1) + 1,
    })
    .returning();
  return category;
};

export const updateLedgerCategory = async (input: LedgerCategoryUpdate) => {
  const id = normalizeId(input.id, "분류");
  const patch: {
    name?: string;
    emoji?: string;
    icon?: LedgerCategoryIconKey;
    color?: LedgerCategoryColorKey;
  } = {};

  if (input.name !== undefined) patch.name = normalizeName(input.name, "분류");
  if (input.emoji !== undefined) patch.emoji = normalizeEmoji(input.emoji);
  if (input.icon !== undefined) patch.icon = normalizeCategoryIcon(input.icon);
  if (input.color !== undefined) patch.color = normalizeCategoryColor(input.color);
  if (!Object.keys(patch).length) throw new LedgerError("변경할 내용이 없어요.");

  const db = getDb();
  const [category] = await db
    .update(schema.ledgerCategories)
    .set(patch)
    .where(eq(schema.ledgerCategories.id, id))
    .returning();
  if (!category) throw new LedgerError("분류를 찾을 수 없어요.");
  return category;
};

/**
 * 분류를 지운다. 쓰인 분류라면 내역이 "분류 없음"이 되지 않도록 옮길 분류가 필요하다.
 * 옮기기와 삭제는 한 SQL 문장으로 함께 처리한다.
 */
export const deleteLedgerCategory = async (
  id: number,
  moveToIdInput?: unknown
): Promise<void> => {
  const categoryId = normalizeId(id, "분류");
  const moveToId = normalizeOptionalId(moveToIdInput, "옮길 분류");
  const db = getDb();

  const [category] = await db
    .select({ kind: schema.ledgerCategories.kind })
    .from(schema.ledgerCategories)
    .where(eq(schema.ledgerCategories.id, categoryId))
    .limit(1);
  if (!category) throw new LedgerError("분류를 찾을 수 없어요.");

  const [[siblings], [usage]] = await Promise.all([
    db
      .select({ value: sql<number>`count(*)::int` })
      .from(schema.ledgerCategories)
      .where(eq(schema.ledgerCategories.kind, category.kind)),
    db
      .select({ value: sql<number>`count(*)::int` })
      .from(schema.ledgerEntries)
      .where(eq(schema.ledgerEntries.categoryId, categoryId)),
  ]);
  if ((siblings?.value ?? 0) <= 1) throw new LedgerError("분류는 최소 하나 필요해요.");

  if (!usage?.value) {
    await db
      .delete(schema.ledgerCategories)
      .where(eq(schema.ledgerCategories.id, categoryId));
    return;
  }

  if (moveToId == null) throw new LedgerError("내역을 옮길 분류를 선택해 주세요.");
  if (moveToId === categoryId) throw new LedgerError("다른 분류를 선택해 주세요.");
  await assertCategoryKind(moveToId, toEntryKind(category.kind));

  await executeStatement(sql`
    with moved as (
      update ledger_entries
      set category_id = ${moveToId}, subcategory_id = null
      where category_id = ${categoryId}
    )
    delete from ledger_categories where id = ${categoryId}
  `);
};
