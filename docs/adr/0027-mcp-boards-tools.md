# 0027 — MCP boards tools (projects, modules, tasks)

- **Status:** Accepted
- **Date:** 2026-08-07
- **Deciders:** Damian Orzeł
- **Pokelo ADR id:** `e6e7329e-febc-4157-8969-ec1c3e5d352d`

## Context

ADR-0013 shipped MCP as bearer-auth Streamable HTTP with read-only contacts/leads.
ADR-0019 added attributed mail write. Work boards are now core (ADR-0026) but agents
could only touch the sales kanban (`get_leads_board`), not projects/modules/tasks.

The MCP bearer still has no user identity, while task create/update/move/comment
require a CRM `userId` for attribution and activity. Hard deletes are irreversible;
MCP tool-annotation hints (`destructiveHint`) are UX only and do not stop an
auto-approved agent from wiping data.

## Decision

We expose work-board **read + create/update** on the MCP plugin via host bridges
`BOARD_PROJECTS_SERVICE`, `BOARD_MODULES_SERVICE`, `BOARD_TASKS_SERVICE`,
`BOARD_STATUSES_SERVICE`:

- **Read:** `list_board_projects`, `get_board_project`, `list_board_modules`,
  `get_module_board`, `list_board_tasks`, `get_board_task` (UUID or `KEY-NN`),
  `list_board_statuses`, `list_board_assignees`.
- **Write:** project/module/task create·update; `move_board_task`;
  `add_board_task_comment`. Task mutations take explicit `actorUserId`
  (discoverable via `list_board_assignees` / `list_lead_assignees`).
- **No delete tools.** Hard delete of projects, modules, and tasks stays in the
  CRM UI (session + confirmation). Agents may soft-retire a task by moving it to
  the Canceled status (7-day purge per ADR-0026).

Tool names use the `board_` prefix so they do not collide with sales pipeline tools.

## Consequences

- Agents can scaffold boards and manage tasks without a browser session.
- Token compromise can still mutate boards and impersonate any `actorUserId`, but
  cannot hard-delete via MCP — rotate the MCP token; same threat model as ADR-0019.
- Host contract grows additively (ADR-0016); plugins must not import `apps/api`.

## Considered alternatives

- **Full CRUD including delete** — rejected: irreversible loss with no human gate
  on the MCP bearer; annotations are not a security boundary.
- **Delete tools with `destructiveHint` only** — rejected: clients may auto-approve.
- **Read-only board tools** — rejected: product ask was create/update workflows.
- **Bind a fixed agent user on the MCP token** — deferred; explicit `actorUserId`
  matches mail.
- **Reuse `get_leads_board` naming** — rejected: different domain (ADR-0026).
