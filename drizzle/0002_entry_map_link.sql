ALTER TABLE "ledger_entries" ADD COLUMN "map_url" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "map_place_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "map_image_urls" jsonb DEFAULT '[]'::jsonb NOT NULL;