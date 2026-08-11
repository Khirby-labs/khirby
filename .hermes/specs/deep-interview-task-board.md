# Specyfikacja: CRM Task Board Plugin
Data: 2026-07-25
Klarowność: 7.6/10

## Cel
Wewnętrzny task board dla zespołu używającego CRM — zarządzanie projektami, epicami i taskami w stylu ClickUp/Linear. Opcjonalny moduł (plugin), nie każda instancja CRM go ma.

## Zakres

### W zakresie
- Hierarchia: **Projekt → Moduł/Epic → Task → Subtask** (self-referential `parent_task_id`)
- Statusy konfigurowane per-Projekt/Moduł (każdy ma własny zestaw kolumn kanbana)
- Tagi globalne dla całego systemu (`tags` + `task_tags` junction)
- Multi-assignee (junction table `task_assignees`)
- Tylko tytuł wymagany przy tworzeniu taska (reszta opcjonalna)
- Komentarze per task + activity log (kto co zmienił i kiedy)
- Powiązanie taska z leadem CRM (FK do `leads.id`, nullable)
- Drag & drop między kolumnami kanbana — real-time przez SSE
- RBAC — istniejący system CRM (role admin/manage/user)
- **3 widoki:**
  1. **"Moje taski"** — taski przypisane do zalogowanego usera, bez backlogu
  2. **Widok PM (projekt)** — kanban agregatowy ORAZ lista/tabela z filtrami (moduł, assignee, priorytet, status)
  3. **Widok Modułu** — kanban stricte jednego modułu

### Poza zakresem (v1)
- Portal klientów (tylko wewnętrzne)
- Gantt / timeline
- Notyfikacje email/push
- Recurring tasks
- Time tracking
- External integrations (Jira, GitHub issues sync)

## Interfejs / API

### Backend (NestJS)
- Plugin: `crm-plugin-taskboard` w `/plugins/crm-plugin-taskboard/`
- Pełny własny NestJS sub-module tree (wzór: crm-plugin-listmonk)
- REST endpoints pod `/api/taskboard/`:
  - CRUD dla projektów, modułów, tasków, statusów, tagów
  - `PATCH /tasks/:id/status` — zmiana statusu (trigger SSE)
  - `PATCH /tasks/:id/position` — drag & drop (trigger SSE)
  - `GET /tasks/my` — "moje taski" (assignee = me, bez backlogu)
  - `GET /projects/:id/tasks` — widok PM (aggregat)
  - `GET /modules/:id/board` — widok modułu (kanban)
- SSE channel dla real-time updates (ten sam pattern co pipeline)
- Plugin emituje CrmEvents przez istniejący `PluginRegistryService.emit()`

### Frontend (Vue 3)
- Nowe views w `/apps/web/src/views/plugins/taskboard/`
- Rejestracja w `pluginComponentMap` (wzór: crm_listmonk)
- Komponenty: KanbanBoard, KanbanColumn, TaskCard, TaskDetail (drawer/modal), ProjectView, MyTasksView
- Drag & drop: `@vueuse/core` lub `vue-draggable-plus` (sprawdzić czy już w deps)

### Schemat bazy (nowe tabele w plugin)
```
tb_projects          (id, name, description, color, created_by, created_at, updated_at)
tb_modules           (id, project_id, name, description, position, created_at)
tb_statuses          (id, project_id?, module_id?, name, color, position, is_backlog, is_done)
tb_tasks             (id, module_id, parent_task_id?, title, description, priority, 
                      due_date, lead_id?, created_by, created_at, updated_at)
tb_task_assignees    (task_id, user_id)
tb_task_comments     (id, task_id, user_id, body, created_at)
tb_task_activity     (id, task_id, user_id, action, old_value, new_value, created_at)
tb_tags              (id, name, color)
tb_task_tags         (task_id, tag_id)
tb_task_status       (task_id, status_id, updated_at)  -- current status per task
```
Prefix `tb_` dla izolacji od core tabel CRM.

## Zachowanie brzegowe
- Task bez modułu — niedozwolone (moduł wymagany, jest "Backlog" jako domyślny moduł)
- Subtask nie może być przypisany do innego modułu niż rodzic
- Usunięcie projektu → cascade delete modułów → tasków (z ostrzeżeniem w UI)
- Task przypisany do usuniętego leada → `lead_id` SET NULL
- Status "backlog" — wykluczony z widoku "Moje taski"
- Drag & drop: optimistic update w UI + SSE broadcast do innych userów
- SSE reconnect — standardowy pattern z pipeline (EventSource auto-reconnect)
- RBAC: `manage`/`admin` — pełny CRUD; `user` — może edytować przypisane taski, nie może usuwać projektów/modułów

## Kryteria sukcesu
- [ ] Plugin można włączyć/wyłączyć przez panel pluginów bez restartu
- [ ] Tworzenie projektu → modułu → taska (tylko tytuł) w < 3 kliknięciach
- [ ] Drag & drop karty między kolumnami → zmiana statusu zapisana w DB + widoczna u innego usera bez odświeżania (SSE)
- [ ] Widok "Moje taski" nie pokazuje tasków w statusie backlog
- [ ] Task można przypiąć do istniejącego leada CRM
- [ ] Komentarz pojawia się w activity logu
- [ ] Testy: minimum unit testy serwisów + integration test dla CRUD tasków

## Otwarte kwestie
- Czy `tb_statuses` jest per-projekt czy per-moduł? (Ustalono: każdy może mieć swój — status może należeć do projektu LUB modułu, z projektu dziedziczone domyślnie)
- Głębokość zagnieżdżenia subtasków — limit na UI (zalecane max 2 poziomy głębiej, bez DB limitu)

## Decyzje ADR

| # | Decyzja | Wybór | Uzasadnienie |
|---|---------|-------|-------------|
| 1 | Plugin migrations | **Opcja B** — rozszerzyć SDK o hook `onMigrate` + `migrations/` w plugin dir. Plugin zarządza własnym schematem Drizzle, tabele `tb_*` nie wchodzą do głównego `schema.ts`. | Plugin self-contained, można wyciągnąć do zewnętrznego repo. Świadomie łamie konwencję AGENTS.md "single source of truth" — akceptowalny wyjątek dla opcjonalnych modułów. |
| 2 | Plugin size | Pełny NestJS sub-module tree w `/plugins/crm-plugin-taskboard/src/` | Pattern z listmonk, nie osobny microservice |
| 3 | Real-time | SSE — ten sam mechanizm co pipeline D&D | Już zaimplementowany w projekcie, zero nowych zależności |
