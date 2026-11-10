CREATE TABLE "ledger_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ledger_recurring" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text DEFAULT 'expense' NOT NULL,
	"amount" integer NOT NULL,
	"category_id" integer,
	"subcategory_id" integer,
	"asset_id" integer,
	"savings_id" integer,
	"memo" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"day_of_month" integer NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text,
	"last_date" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ledger_savings" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"start_date" text,
	"end_date" text,
	"monthly_amount" integer,
	"memo" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ledger_subcategories" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "ledger_account" ADD COLUMN "base_date" text;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "subcategory_id" integer;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "asset_id" integer;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "savings_id" integer;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "recurring_id" integer;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger_recurring" ADD CONSTRAINT "ledger_recurring_category_id_ledger_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."ledger_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_recurring" ADD CONSTRAINT "ledger_recurring_subcategory_id_ledger_subcategories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."ledger_subcategories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_recurring" ADD CONSTRAINT "ledger_recurring_asset_id_ledger_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."ledger_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_recurring" ADD CONSTRAINT "ledger_recurring_savings_id_ledger_savings_id_fk" FOREIGN KEY ("savings_id") REFERENCES "public"."ledger_savings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_subcategories" ADD CONSTRAINT "ledger_subcategories_category_id_ledger_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."ledger_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_assets_name_uniq" ON "ledger_assets" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_savings_name_uniq" ON "ledger_savings" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_subcategories_category_name_uniq" ON "ledger_subcategories" USING btree ("category_id","name");--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_subcategory_id_ledger_subcategories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."ledger_subcategories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_asset_id_ledger_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."ledger_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_savings_id_ledger_savings_id_fk" FOREIGN KEY ("savings_id") REFERENCES "public"."ledger_savings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_recurring_id_ledger_recurring_id_fk" FOREIGN KEY ("recurring_id") REFERENCES "public"."ledger_recurring"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledger_entries_asset_idx" ON "ledger_entries" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_savings_idx" ON "ledger_entries" USING btree ("savings_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_recurring_date_uniq" ON "ledger_entries" USING btree ("recurring_id","entry_date");