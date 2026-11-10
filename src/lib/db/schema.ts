import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const ledgerCategories = pgTable(
  "ledger_categories",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("expense"), // expense | income
    emoji: text("emoji").notNull().default("🧾"),
    icon: text("icon").notNull().default("tag"),
    color: text("color").notNull().default("neutral"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    kindIdx: index("ledger_categories_kind_idx").on(t.kind, t.sortOrder),
    nameUniq: uniqueIndex("ledger_categories_kind_name_uniq").on(t.kind, t.name),
  })
);

/** 여행. 분류(무엇에 썼나)와 별개로 어느 여행의 지출인지 묶는다. */
export const ledgerTrips = pgTable(
  "ledger_trips",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    startDate: text("start_date").notNull(), // YYYY-MM-DD (KST)
    endDate: text("end_date").notNull(), // YYYY-MM-DD (KST)
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({ nameUniq: uniqueIndex("ledger_trips_name_uniq").on(t.name) })
);

/** 대분류 아래의 소분류. 대분류가 지워지면 함께 지운다. */
export const ledgerSubcategories = pgTable(
  "ledger_subcategories",
  {
    id: serial("id").primaryKey(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => ledgerCategories.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    nameUniq: uniqueIndex("ledger_subcategories_category_name_uniq").on(
      t.categoryId,
      t.name
    ),
  })
);

/** 결제수단. 구분과 필터 용도이고 수단별 잔액은 계산하지 않는다. */
export const ledgerAssets = pgTable(
  "ledger_assets",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({ nameUniq: uniqueIndex("ledger_assets_name_uniq").on(t.name) })
);

/** 적금·청약 같은 저축 상품. 이체 내역이 이 상품으로 쌓인다. */
export const ledgerSavings = pgTable(
  "ledger_savings",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    startDate: text("start_date"), // YYYY-MM-DD (KST)
    endDate: text("end_date"), // 만기일
    monthlyAmount: integer("monthly_amount"),
    memo: text("memo").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({ nameUniq: uniqueIndex("ledger_savings_name_uniq").on(t.name) })
);

/** 매달 같은 날 자동으로 내역을 만드는 규칙. lastDate까지 생성을 마쳤다는 뜻이다. */
export const ledgerRecurring = pgTable("ledger_recurring", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull().default("expense"), // expense | income | transfer
  amount: integer("amount").notNull(),
  categoryId: integer("category_id").references(() => ledgerCategories.id, {
    onDelete: "set null",
  }),
  subcategoryId: integer("subcategory_id").references(() => ledgerSubcategories.id, {
    onDelete: "set null",
  }),
  assetId: integer("asset_id").references(() => ledgerAssets.id, {
    onDelete: "set null",
  }),
  savingsId: integer("savings_id").references(() => ledgerSavings.id, {
    onDelete: "set null",
  }),
  memo: text("memo").notNull().default(""),
  note: text("note").notNull().default(""),
  dayOfMonth: integer("day_of_month").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  lastDate: text("last_date"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: serial("id").primaryKey(),
    entryDate: text("entry_date").notNull(), // YYYY-MM-DD (KST)
    entryTime: text("entry_time"), // HH:mm (KST), 모르면 null
    kind: text("kind").notNull().default("expense"), // expense | income | transfer
    amount: integer("amount").notNull(),
    categoryId: integer("category_id").references(() => ledgerCategories.id, {
      onDelete: "set null",
    }),
    tripId: integer("trip_id").references(() => ledgerTrips.id, {
      onDelete: "set null",
    }),
    subcategoryId: integer("subcategory_id").references(() => ledgerSubcategories.id, {
      onDelete: "set null",
    }),
    assetId: integer("asset_id").references(() => ledgerAssets.id, {
      onDelete: "set null",
    }),
    savingsId: integer("savings_id").references(() => ledgerSavings.id, {
      onDelete: "set null",
    }),
    recurringId: integer("recurring_id").references(() => ledgerRecurring.id, {
      onDelete: "set null",
    }),
    memo: text("memo").notNull().default(""),
    note: text("note").notNull().default(""),
    tags: text("tags").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // null이면 살아 있는 기록
  },
  (t) => ({
    dateIdx: index("ledger_entries_date_idx").on(t.entryDate),
    tripIdx: index("ledger_entries_trip_idx").on(t.tripId),
    assetIdx: index("ledger_entries_asset_idx").on(t.assetId),
    savingsIdx: index("ledger_entries_savings_idx").on(t.savingsId),
    recurringDateUniq: uniqueIndex("ledger_entries_recurring_date_uniq").on(
      t.recurringId,
      t.entryDate
    ),
  })
);

/** 로그인 시도 기록. 비밀번호가 틀린 시도만 남고, 성공하면 지운다. */
export const authLoginAttempts = pgTable(
  "auth_login_attempts",
  {
    id: serial("id").primaryKey(),
    ip: text("ip").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    createdIdx: index("auth_login_attempts_created_idx").on(t.createdAt),
  })
);

/** 통장 한 개의 잔액 기준점. id=1 한 줄만 쓴다. */
export const ledgerAccount = pgTable("ledger_account", {
  id: integer("id").primaryKey().default(1),
  openingBalance: integer("opening_balance").notNull().default(0),
  checkedBalance: integer("checked_balance"),
  checkedAt: timestamp("checked_at", { withTimezone: true }),
  /** 이 날짜까지의 내역은 openingBalance에 이미 반영됐다고 본다. */
  baseDate: text("base_date"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

/** 내역 변경 이력. 원본이 지워져도 남도록 FK를 걸지 않는다. */
export const ledgerEntryHistory = pgTable(
  "ledger_entry_history",
  {
    id: serial("id").primaryKey(),
    entryId: integer("entry_id").notNull(),
    action: text("action").notNull(), // create | update | delete | restore
    source: text("source").notNull().default("web"),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    createdIdx: index("ledger_entry_history_created_idx").on(t.createdAt),
  })
);

export const ledgerMonths = pgTable("ledger_months", {
  month: text("month").primaryKey(), // YYYY-MM
  totalBudget: integer("total_budget"),
  note: text("note").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const ledgerBudgets = pgTable(
  "ledger_budgets",
  {
    month: text("month").notNull(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => ledgerCategories.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.month, t.categoryId] }) })
);
