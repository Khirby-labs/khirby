ALTER TABLE "forms" ADD COLUMN "kind" text DEFAULT 'contact' NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "source" jsonb DEFAULT '{}'::jsonb NOT NULL;