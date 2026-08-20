CREATE TABLE IF NOT EXISTS "agent_conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "title" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "agent_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL REFERENCES "agent_conversations"("id") ON DELETE cascade,
  "role" text NOT NULL,
  "content" text NOT NULL,
  "tool_trace" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "agent_conversations_user_id_idx" ON "agent_conversations" ("user_id");
CREATE INDEX IF NOT EXISTS "agent_messages_conversation_id_idx" ON "agent_messages" ("conversation_id");
