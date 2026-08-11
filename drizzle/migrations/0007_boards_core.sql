-- Boards module (ADR-0026): promote former plugin tb_* tables into core migrations.
-- Idempotent CREATE IF NOT EXISTS preserves data for installs that already ran plugin onMigrate.

CREATE TABLE IF NOT EXISTS tb_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#6366f1',
  key TEXT,
  task_seq INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tb_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES tb_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tb_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES tb_projects(id) ON DELETE CASCADE,
  module_id UUID REFERENCES tb_modules(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#94a3b8',
  position INTEGER NOT NULL DEFAULT 0,
  is_backlog BOOLEAN NOT NULL DEFAULT FALSE,
  is_done BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS tb_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES tb_modules(id) ON DELETE CASCADE,
  status_id UUID REFERENCES tb_statuses(id) ON DELETE SET NULL,
  parent_task_id UUID REFERENCES tb_tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  position INTEGER NOT NULL DEFAULT 0,
  number INTEGER,
  identifier TEXT,
  due_date TIMESTAMPTZ,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tb_task_assignees (
  task_id UUID NOT NULL REFERENCES tb_tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, user_id)
);

CREATE TABLE IF NOT EXISTS tb_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#6366f1'
);

CREATE TABLE IF NOT EXISTS tb_task_tags (
  task_id UUID NOT NULL REFERENCES tb_tasks(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tb_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, tag_id)
);

CREATE TABLE IF NOT EXISTS tb_task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tb_tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tb_task_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tb_tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tb_projects ADD COLUMN IF NOT EXISTS key TEXT;
ALTER TABLE tb_projects ADD COLUMN IF NOT EXISTS task_seq INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tb_tasks ADD COLUMN IF NOT EXISTS number INTEGER;
ALTER TABLE tb_tasks ADD COLUMN IF NOT EXISTS identifier TEXT;
ALTER TABLE tb_tasks ADD COLUMN IF NOT EXISTS pokelo_document_id UUID;

UPDATE tb_projects
SET key = upper(left(regexp_replace(coalesce(name, 'PRJ'), '[^a-zA-Z0-9]', '', 'g'), 6))
WHERE key IS NULL OR btrim(key) = '';

UPDATE tb_projects
SET key = 'P' || upper(left(replace(id::text, '-', ''), 5))
WHERE key IS NULL OR btrim(key) = '';

UPDATE tb_projects p
SET key = left(coalesce(p.key, 'P'), 4) || upper(left(replace(p.id::text, '-', ''), 4))
FROM (
  SELECT id, row_number() OVER (PARTITION BY key ORDER BY created_at, id) AS rn
  FROM tb_projects
  WHERE key IS NOT NULL
) d
WHERE p.id = d.id AND d.rn > 1;

WITH numbered AS (
  SELECT
    t.id AS task_id,
    p.key AS project_key,
    row_number() OVER (PARTITION BY m.project_id ORDER BY t.created_at ASC, t.id ASC) AS rn
  FROM tb_tasks t
  INNER JOIN tb_modules m ON m.id = t.module_id
  INNER JOIN tb_projects p ON p.id = m.project_id
)
UPDATE tb_tasks t
SET
  number = coalesce(t.number, n.rn),
  identifier = coalesce(
    t.identifier,
    n.project_key || '-' || lpad(coalesce(t.number, n.rn)::text, 2, '0')
  )
FROM numbered n
WHERE t.id = n.task_id
  AND (t.number IS NULL OR t.identifier IS NULL);

UPDATE tb_projects p
SET task_seq = greatest(
  p.task_seq,
  coalesce((
    SELECT max(t.number)
    FROM tb_tasks t
    INNER JOIN tb_modules m ON m.id = t.module_id
    WHERE m.project_id = p.id
  ), 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS tb_projects_key_unique ON tb_projects(key);
CREATE UNIQUE INDEX IF NOT EXISTS tb_tasks_identifier_unique ON tb_tasks(identifier);

CREATE INDEX IF NOT EXISTS idx_tb_modules_project ON tb_modules(project_id);
CREATE INDEX IF NOT EXISTS idx_tb_tasks_module ON tb_tasks(module_id);
CREATE INDEX IF NOT EXISTS idx_tb_tasks_status ON tb_tasks(status_id);
CREATE INDEX IF NOT EXISTS idx_tb_tasks_parent ON tb_tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tb_tasks_identifier ON tb_tasks(identifier);
CREATE INDEX IF NOT EXISTS idx_tb_task_assignees_user ON tb_task_assignees(user_id);

UPDATE role_permissions SET resource = 'boards' WHERE resource = 'taskboard';

DELETE FROM plugins WHERE name = 'crm_taskboard';
