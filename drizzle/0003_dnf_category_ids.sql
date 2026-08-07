ALTER TABLE "solve" ADD COLUMN IF NOT EXISTS "dnf_category_ids" jsonb;
--> statement-breakpoint
UPDATE "solve" SET "dnf_category_ids" = to_jsonb(ARRAY["dnf_category_id"]) WHERE "dnf_category_id" IS NOT NULL AND "dnf_category_ids" IS NULL;
--> statement-breakpoint
ALTER TABLE "solve" DROP COLUMN IF EXISTS "dnf_category_id";
