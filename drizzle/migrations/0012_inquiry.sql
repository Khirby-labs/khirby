ALTER TABLE "forms" ADD COLUMN "destination" text DEFAULT 'lead' NOT NULL;--> statement-breakpoint
ALTER TABLE "forms" ADD COLUMN "intake_mode" text DEFAULT 'static' NOT NULL;--> statement-breakpoint
CREATE TABLE "inquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"form_id" uuid,
	"source" text,
	"source_meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"contact_name" text,
	"email" text,
	"company_name" text,
	"structured_data" jsonb DEFAULT '{"problem":null,"desiredOutcome":null,"currentProcess":null,"currentTools":[],"teamSize":null,"constraints":[],"timeline":null,"inquiryType":null}'::jsonb NOT NULL,
	"ai_summary" text,
	"proposed_type" text,
	"missing_information" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ai_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reviewed_at" timestamp,
	"reviewed_by" uuid,
	"lead_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inquiries_public_token_unique" UNIQUE("public_token"),
	CONSTRAINT "inquiries_lead_id_unique" UNIQUE("lead_id")
);--> statement-breakpoint
CREATE TABLE "inquiry_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inquiry_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_messages" ADD CONSTRAINT "inquiry_messages_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE cascade ON UPDATE no action;
