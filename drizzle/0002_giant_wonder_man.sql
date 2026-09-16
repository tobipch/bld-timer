-- Flow rewrite: sessions carry their scramble mode, and a solve is only its
-- scramble and its timed moves.
--
-- Nothing is dropped. The reconstruction, the alg executions and the DNF
-- categories are no longer written or read, but a schema change is a bad
-- reason to destroy a recorded history, so the old columns and tables stay
-- where they are and only lose their NOT NULL.
ALTER TABLE "timer_session" ADD COLUMN IF NOT EXISTS "mode" text DEFAULT 'full' NOT NULL;--> statement-breakpoint
ALTER TABLE "solve" ALTER COLUMN "total_ms" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "solve" ALTER COLUMN "memo_ms" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "solve" ALTER COLUMN "reconstruction" DROP NOT NULL;
