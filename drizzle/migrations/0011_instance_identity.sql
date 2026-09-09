CREATE TABLE "instance_identity" (
	"id" uuid PRIMARY KEY NOT NULL,
	"installation_id" uuid NOT NULL,
	"registered_email" text,
	"registered_at" timestamptz,
	"last_heartbeat_at" timestamptz,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "instance_identity_installation_id_unique" UNIQUE("installation_id")
);
