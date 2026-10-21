-- OIDC identity + nullable password for SSO-only users (CP ADR-0010 account linking).
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "oidc_issuer" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "oidc_subject" text;
CREATE UNIQUE INDEX IF NOT EXISTS "users_oidc_issuer_subject_uidx"
  ON "users" ("oidc_issuer", "oidc_subject")
  WHERE "oidc_issuer" IS NOT NULL AND "oidc_subject" IS NOT NULL;
