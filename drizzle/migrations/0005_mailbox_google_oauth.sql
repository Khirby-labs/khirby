ALTER TABLE "mailboxes" ADD COLUMN "auth_method" text DEFAULT 'password' NOT NULL;--> statement-breakpoint
ALTER TABLE "mailboxes" ADD COLUMN "oauth_refresh_token_enc" text;--> statement-breakpoint
ALTER TABLE "mailboxes" ADD COLUMN "oauth_token_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "mailboxes" ALTER COLUMN "imap_password_enc" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "mailboxes" ALTER COLUMN "smtp_password_enc" DROP NOT NULL;
