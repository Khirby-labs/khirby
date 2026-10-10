-- When Enterprise MW added forms.scope_id + RLS, UNIQUE(slug) stayed global.
-- SELECT under RLS cannot see another workspace's slug, so create looks free,
-- then INSERT dies on forms_slug_unique (Drizzle: "Failed query"). Scope the
-- uniqueness when the column exists; Community (no scope_id) is unchanged.
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'forms'
      AND column_name = 'scope_id'
  ) THEN
    ALTER TABLE forms DROP CONSTRAINT IF EXISTS forms_slug_unique;
    CREATE UNIQUE INDEX IF NOT EXISTS forms_scope_id_slug_uidx ON forms (scope_id, slug);
  END IF;
END
$mig$;
