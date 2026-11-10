CREATE TABLE "auth_login_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"ip" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_account" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"opening_balance" integer DEFAULT 0 NOT NULL,
	"checked_balance" integer,
	"checked_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ledger_budgets" (
	"month" text NOT NULL,
	"category_id" integer NOT NULL,
	"amount" integer NOT NULL,
	CONSTRAINT "ledger_budgets_month_category_id_pk" PRIMARY KEY("month","category_id")
);
--> statement-breakpoint
CREATE TABLE "ledger_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'expense' NOT NULL,
	"emoji" text DEFAULT '🧾' NOT NULL,
	"icon" text DEFAULT 'tag' NOT NULL,
	"color" text DEFAULT 'neutral' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"entry_date" text NOT NULL,
	"entry_time" text,
	"kind" text DEFAULT 'expense' NOT NULL,
	"amount" integer NOT NULL,
	"category_id" integer,
	"trip_id" integer,
	"memo" text DEFAULT '' NOT NULL,
	"tags" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ledger_entry_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"entry_id" integer NOT NULL,
	"action" text NOT NULL,
	"source" text DEFAULT 'web' NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_months" (
	"month" text PRIMARY KEY NOT NULL,
	"total_budget" integer,
	"note" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ledger_trips" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "ledger_budgets" ADD CONSTRAINT "ledger_budgets_category_id_ledger_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."ledger_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_category_id_ledger_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."ledger_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_trip_id_ledger_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."ledger_trips"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_login_attempts_created_idx" ON "auth_login_attempts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ledger_categories_kind_idx" ON "ledger_categories" USING btree ("kind","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_categories_kind_name_uniq" ON "ledger_categories" USING btree ("kind","name");--> statement-breakpoint
CREATE INDEX "ledger_entries_date_idx" ON "ledger_entries" USING btree ("entry_date");--> statement-breakpoint
CREATE INDEX "ledger_entries_trip_idx" ON "ledger_entries" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "ledger_entry_history_created_idx" ON "ledger_entry_history" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_trips_name_uniq" ON "ledger_trips" USING btree ("name");