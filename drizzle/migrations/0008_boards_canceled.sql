-- Canceled status flag + task cancel timestamp for 7-day auto-purge.

ALTER TABLE tb_statuses ADD COLUMN IF NOT EXISTS is_canceled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tb_tasks ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tb_tasks_canceled_at ON tb_tasks(canceled_at)
  WHERE canceled_at IS NOT NULL;

-- Seed a Canceled column on every project that does not already have one.
INSERT INTO tb_statuses (project_id, name, color, position, is_backlog, is_done, is_canceled)
SELECT
  p.id,
  'Canceled',
  '#E06055',
  COALESCE((SELECT max(s.position) + 1 FROM tb_statuses s WHERE s.project_id = p.id), 0),
  FALSE,
  FALSE,
  TRUE
FROM tb_projects p
WHERE NOT EXISTS (
  SELECT 1 FROM tb_statuses s
  WHERE s.project_id = p.id AND s.is_canceled = TRUE
);
