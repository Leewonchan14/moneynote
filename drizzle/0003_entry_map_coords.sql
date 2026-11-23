ALTER TABLE "ledger_entries" ADD COLUMN "map_place_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "map_lat" double precision;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "map_lng" double precision;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "map_address" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "map_category" text DEFAULT '' NOT NULL;