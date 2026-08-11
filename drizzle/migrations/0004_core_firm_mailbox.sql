CREATE TABLE "mailboxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"from_name" text NOT NULL,
	"from_address" text NOT NULL,
	"imap_host" text NOT NULL,
	"imap_port" integer NOT NULL,
	"imap_secure" boolean DEFAULT true NOT NULL,
	"imap_user" text NOT NULL,
	"imap_password_enc" text NOT NULL,
	"smtp_host" text NOT NULL,
	"smtp_port" integer NOT NULL,
	"smtp_secure" boolean DEFAULT true NOT NULL,
	"smtp_user" text NOT NULL,
	"smtp_password_enc" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"backfill_days" integer DEFAULT 30 NOT NULL,
	"connection_status" text DEFAULT 'disconnected' NOT NULL,
	"last_sync_at" timestamp,
	"last_sync_error" text,
	"imap_uid_validity" integer,
	"imap_last_uid" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mailbox_id" uuid NOT NULL,
	"contact_id" uuid,
	"lead_id" uuid,
	"subject" text NOT NULL,
	"root_message_id" text NOT NULL,
	"last_message_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"mailbox_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"message_id" text NOT NULL,
	"in_reply_to" text,
	"references" text,
	"from_address" text NOT NULL,
	"to_addresses" jsonb DEFAULT '[]' NOT NULL,
	"cc_addresses" jsonb DEFAULT '[]' NOT NULL,
	"subject" text NOT NULL,
	"body_text" text NOT NULL,
	"body_html" text,
	"sent_at" timestamp,
	"received_at" timestamp,
	"imap_uid" integer,
	"sent_by_user_id" uuid,
	"last_error" text,
	"has_attachments" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_mailbox_id_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."mailboxes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_thread_id_email_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."email_threads"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_mailbox_id_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."mailboxes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_sent_by_user_id_users_id_fk" FOREIGN KEY ("sent_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "email_threads_mailbox_root_message_id_idx" ON "email_threads" ("mailbox_id", "root_message_id");
--> statement-breakpoint
CREATE INDEX "email_threads_contact_id_idx" ON "email_threads" ("contact_id");
--> statement-breakpoint
CREATE INDEX "email_threads_lead_id_idx" ON "email_threads" ("lead_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "email_messages_mailbox_message_id_idx" ON "email_messages" ("mailbox_id", "message_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "email_messages_mailbox_imap_uid_idx" ON "email_messages" ("mailbox_id", "imap_uid") WHERE imap_uid IS NOT NULL;
