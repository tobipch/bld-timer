CREATE TABLE IF NOT EXISTS "dnf_category" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"sort_index" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dnf_category" ADD CONSTRAINT "dnf_category_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dnf_category_user_idx" ON "dnf_category" USING btree ("user_id");
--> statement-breakpoint
ALTER TABLE "solve" ADD COLUMN IF NOT EXISTS "dnf_category_id" text;
