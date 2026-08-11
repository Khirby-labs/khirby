# Task Board Plugin — Plan Implementacji

> **Spec:** `.hermes/specs/deep-interview-task-board.md`
> **Klarowność wymagań:** 7.6/10

**Goal:** Plugin `crm-plugin-taskboard` — wewnętrzny task board w stylu ClickUp. Hierarchia Projekt → Moduł → Task → Subtask, kanban z D&D + SSE real-time, 3 widoki (Moje taski / PM / Moduł), RBAC.

**Architecture:**
- Plugin pattern identyczny z `crm-plugin-listmonk` — pełny NestJS sub-module w `/plugins/crm-plugin-taskboard/src/`
- Plugin SDK rozszerzony o hook `onMigrate` (ADR #1 — Opcja B, tabele `tb_*` poza głównym `schema.ts`)
- SSE przez istniejący `EventsService` (`@Global()`) — ten sam stream co pipeline
- Frontend: nowe Vue views + `vue-draggable-plus` dla D&D

**Tech Stack:** NestJS + Drizzle 0.40 + PostgreSQL, Vue 3 + Pinia + Tailwind, SSE (RxJS Subject), vue-draggable-plus

---

## Faza 0 — Rozszerzenie Plugin SDK o `onMigrate`

### Task 1: Dodaj hook `onMigrate` do `CrmPlugin` interface

**Cel:** Plugin SDK pozwala pluginom zadeklarować własne migracje SQL.

**Pliki:**
- Modify: `packages/plugin-sdk/index.ts`

**Implementacja:**

```typescript
// packages/plugin-sdk/index.ts — dodaj do CrmPlugin interface:
export interface CrmPlugin {
  // ... istniejące pola ...
  
  /**
   * Opcjonalny hook wywoływany przez PluginRegistryService przed onInit.
   * Plugin powinien wykonać własne SQL migracje (CREATE TABLE IF NOT EXISTS).
   * Otrzymuje surowy postgres.js `sql` client.
   */
  onMigrate?(sql: Sql): Promise<void>;
}

// Dodaj import Sql z postgres.js:
import type { Sql } from 'postgres';
export type { Sql };
```

**Weryfikacja:** `pnpm typecheck` w `packages/plugin-sdk/` — 0 błędów.

---

### Task 2: Wywołaj `onMigrate` w `PluginRegistryService`

**Cel:** Przed `onInit` — jeśli plugin ma `onMigrate`, wywołaj go z postgres.js `sql` client.

**Pliki:**
- Modify: `apps/api/src/modules/plugins/plugin-registry.service.ts`
- Modify: `apps/api/src/core/database/database.module.ts` (sprawdź jak jest eksportowany raw sql client)

**Uwaga:** Sprawdź jak `DatabaseModule` eksportuje połączenie. Jeśli tylko Drizzle `db`, potrzebny dostęp do raw `sql` (postgres.js). Drizzle 0.40 z postgres.js driver: `db.$client` to raw sql.

```typescript
// W PluginRegistryService.registerPlugin():
if (plugin.onMigrate) {
  try {
    await plugin.onMigrate((this.db as any).$client);
    this.logger.log(`Plugin ${plugin.name}: migrations applied`);
  } catch (err) {
    this.logger.error(`Plugin ${plugin.name} onMigrate failed: ${(err as Error).message}`);
  }
}
// Wywołaj PRZED onInit
```

**Weryfikacja:** `pnpm build` w `apps/api/` — 0 błędów TypeScript.

---

### Task 3: Test jednostkowy dla `onMigrate` w PluginRegistryService

**Cel:** Upewnić się że `onMigrate` jest wywołane przed `onInit` i błąd nie blokuje rejestracji.

**Pliki:**
- Modify: `apps/api/src/modules/plugins/plugin-registry.service.spec.ts`

```typescript
it('calls onMigrate before onInit when plugin declares it', async () => {
  const order: string[] = [];
  const plugin: CrmPlugin = {
    name: 'test_migrate',
    displayName: 'Test',
    version: '1.0.0',
    onMigrate: jest.fn().mockImplementation(async () => { order.push('migrate'); }),
    onInit: jest.fn().mockImplementation(async () => { order.push('init'); }),
  };
  // ... setup db mock, call registerPlugin ...
  expect(order).toEqual(['migrate', 'init']);
});
```

**Weryfikacja:** `cd apps/api && npx jest plugin-registry --no-coverage` — PASS.

---

## Faza 1 — Scaffold pluginu

### Task 4: Utwórz strukturę katalogu pluginu

**Cel:** Szkielet analogiczny do `crm-plugin-listmonk`.

```
plugins/crm-plugin-taskboard/
├── package.json
├── tsconfig.json          (opcjonalnie, dziedziczy z root)
└── src/
    ├── index.ts           (eksportuje TaskboardPlugin)
    ├── taskboard.plugin.ts
    ├── taskboard.module.ts
    ├── migrations.sql      (surowy SQL tworzący tabele tb_*)
    ├── projects/
    │   ├── projects.service.ts
    │   └── projects.controller.ts
    ├── modules/
    │   ├── modules.service.ts
    │   └── modules.controller.ts
    ├── tasks/
    │   ├── tasks.service.ts
    │   └── tasks.controller.ts
    ├── statuses/
    │   ├── statuses.service.ts
    │   └── statuses.controller.ts
    └── tags/
        ├── tags.service.ts
        └── tags.controller.ts
```

**Pliki — `package.json`:**
```json
{
  "name": "crm-plugin-taskboard",
  "version": "1.0.0",
  "description": "Task board plugin for CRM Bearly — Kanban z projektami, epicami i taskami",
  "main": "src/taskboard.plugin.ts",
  "private": true,
  "keywords": ["crm-bearly-plugin"]
}
```

---

### Task 5: Schema SQL — migracje pluginu

**Cel:** Wszystkie tabele `tb_*` jako `CREATE TABLE IF NOT EXISTS` — idempotentne.

**Plik:** `plugins/crm-plugin-taskboard/src/migrations.sql`

```sql
-- tb_projects
CREATE TABLE IF NOT EXISTS tb_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#6366f1',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- tb_modules (Epics)
CREATE TABLE IF NOT EXISTS tb_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES tb_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- tb_statuses (per projekt LUB per moduł)
CREATE TABLE IF NOT EXISTS tb_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES tb_projects(id) ON DELETE CASCADE,
  module_id UUID REFERENCES tb_modules(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#94a3b8',
  position INTEGER NOT NULL DEFAULT 0,
  is_backlog BOOLEAN NOT NULL DEFAULT FALSE,
  is_done BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT chk_status_owner CHECK (
    (project_id IS NOT NULL AND module_id IS NULL) OR
    (project_id IS NULL AND module_id IS NOT NULL)
  )
);

-- tb_tasks (self-referential — subtaski przez parent_task_id)
CREATE TABLE IF NOT EXISTS tb_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES tb_modules(id) ON DELETE CASCADE,
  status_id UUID REFERENCES tb_statuses(id) ON DELETE SET NULL,
  parent_task_id UUID REFERENCES tb_tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  position INTEGER NOT NULL DEFAULT 0,
  due_date TIMESTAMPTZ,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- tb_task_assignees (multi-assignee)
CREATE TABLE IF NOT EXISTS tb_task_assignees (
  task_id UUID NOT NULL REFERENCES tb_tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, user_id)
);

-- tb_tags (globalne)
CREATE TABLE IF NOT EXISTS tb_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#6366f1'
);

-- tb_task_tags
CREATE TABLE IF NOT EXISTS tb_task_tags (
  task_id UUID NOT NULL REFERENCES tb_tasks(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tb_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, tag_id)
);

-- tb_task_comments
CREATE TABLE IF NOT EXISTS tb_task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tb_tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- tb_task_activity (log)
CREATE TABLE IF NOT EXISTS tb_task_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tb_tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### Task 6: `TaskboardPlugin` — główna klasa pluginu z `onMigrate`

**Plik:** `plugins/crm-plugin-taskboard/src/taskboard.plugin.ts`

```typescript
import { readFileSync } from 'fs';
import { join } from 'path';
import type { Sql } from 'postgres';
import { CrmPlugin, PluginContext, CrmEvent } from '@crm/plugin-sdk';

export class TaskboardPlugin implements CrmPlugin {
  name = 'crm_taskboard';
  displayName = 'Task Board';
  displayNameKey = 'plugins.taskboard.displayName';
  description = 'Kanban task board z projektami, epicami i taskami';
  descriptionKey = 'plugins.taskboard.description';
  version = '1.0.0';

  async onMigrate(sql: Sql): Promise<void> {
    const migrations = readFileSync(join(__dirname, 'migrations.sql'), 'utf-8');
    await sql.unsafe(migrations);
  }

  getFrontendRoutes() {
    return [
      { path: '/taskboard', name: 'taskboard', navLabel: 'Task Board', navLabelKey: 'nav.workspace.taskboard', navIcon: 'LayoutDashboard' },
    ];
  }

  async onInit(ctx: PluginContext): Promise<void> {
    ctx.log('TaskboardPlugin: initialized');
  }

  async onEvent(_event: CrmEvent, _ctx: PluginContext): Promise<void> {
    // brak reakcji na zewnętrzne eventy w v1
  }
}
```

---

### Task 7: `TaskboardModule` — NestJS sub-module z DI

**Plik:** `plugins/crm-plugin-taskboard/src/taskboard.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../../apps/api/src/core/database/database.module';
import { RbacModule } from '../../../apps/api/src/core/rbac/rbac.module';
import { ProjectsService } from './projects/projects.service';
import { ProjectsController } from './projects/projects.controller';
import { ModulesService } from './modules/modules.service';
import { ModulesController } from './modules/modules.controller';
import { TasksService } from './tasks/tasks.service';
import { TasksController } from './tasks/tasks.controller';
import { StatusesService } from './statuses/statuses.service';
import { StatusesController } from './statuses/statuses.controller';
import { TagsService } from './tags/tags.service';
import { TagsController } from './tags/tags.controller';

@Module({
  imports: [DatabaseModule, RbacModule],
  providers: [ProjectsService, ModulesService, TasksService, StatusesService, TagsService],
  controllers: [ProjectsController, ModulesController, TasksController, StatusesController, TagsController],
})
export class TaskboardModule {}
```

**Plik:** `plugins/crm-plugin-taskboard/src/index.ts`

```typescript
export { TaskboardPlugin } from './taskboard.plugin';
export { TaskboardModule } from './taskboard.module';
```

---

### Task 8: Zarejestruj plugin w `app.module.ts`

**Pliki:**
- Modify: `apps/api/src/app.module.ts`

```typescript
import { TaskboardPlugin } from '../../../plugins/crm-plugin-taskboard/src';
import { TaskboardModule } from '../../../plugins/crm-plugin-taskboard/src';

// W @Module imports:
TaskboardModule,
// W PluginsModule.forRoot([...]):
new TaskboardPlugin(),
```

**Uwaga:** `TaskboardModule` importowany osobno (poza `PluginsModule`) — identycznie jak ListmonkNestModule w listmonk.

**Weryfikacja:** `pnpm build` — 0 błędów.

---

## Faza 2 — Backend: CRUD serwisy

### Task 9: `ProjectsService` — CRUD projektów

**Plik:** `plugins/crm-plugin-taskboard/src/projects/projects.service.ts`

Metody:
- `findAll(): Promise<Project[]>`
- `findById(id: string): Promise<Project>`
- `create(dto: CreateProjectDto, userId: string): Promise<Project>`
- `update(id: string, dto: UpdateProjectDto): Promise<Project>`
- `delete(id: string): Promise<void>`

Pattern DB: inject `DB_TOKEN`, `as any` na `.values()` / `.set()` (Drizzle 0.40).

Wszystkie serwisy używają **inline Drizzle queries** (bez osobnego schema file — tabele istnieją w DB przez SQL migration, do Drizzle queries używamy `sql\`\`` tagged template lub `pgTable` zdefiniowany lokalnie w pliku serwisu).

**Alternatywa (rekomendowana):** Zdefiniuj Drizzle table definitions lokalnie w pluginie:

```typescript
// plugins/crm-plugin-taskboard/src/schema.ts
import { pgTable, uuid, text, boolean, integer, timestamp } from 'drizzle-orm/pg-core';

export const tbProjects = pgTable('tb_projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  color: text('color').notNull().default('#6366f1'),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
// ... pozostałe tabele
```

Ten plik jest lokalny dla pluginu — **nie importowany przez główny `schema.ts`**.

---

### Task 10: `ModulesService` — CRUD modułów/epiców

**Plik:** `plugins/crm-plugin-taskboard/src/modules/modules.service.ts`

Metody:
- `findByProject(projectId: string): Promise<Module[]>`
- `create(dto: CreateModuleDto): Promise<Module>`
- `update(id: string, dto: UpdateModuleDto): Promise<Module>`
- `delete(id: string): Promise<void>`
- `reorder(projectId: string, ids: string[]): Promise<void>` — bulk update `position`

---

### Task 11: `StatusesService` — CRUD statusów per projekt/moduł

**Plik:** `plugins/crm-plugin-taskboard/src/statuses/statuses.service.ts`

Metody:
- `findByProject(projectId: string): Promise<Status[]>`
- `findByModule(moduleId: string): Promise<Status[]>`
- `create(dto: CreateStatusDto): Promise<Status>`
- `reorder(ids: string[]): Promise<void>`
- `delete(id: string): Promise<void>` — guard: nie usuwa jeśli taski mają ten status

---

### Task 12: `TagsService` — CRUD globalnych tagów

**Plik:** `plugins/crm-plugin-taskboard/src/tags/tags.service.ts`

Metody:
- `findAll(): Promise<Tag[]>`
- `create(dto: CreateTagDto): Promise<Tag>`
- `delete(id: string): Promise<void>`

---

### Task 13: `TasksService` — pełny CRUD tasków z SSE

**Plik:** `plugins/crm-plugin-taskboard/src/tasks/tasks.service.ts`

Inject: `DB_TOKEN`, `EventsService` (Global — dostępny bez importu modułu).

Metody:
- `findMyTasks(userId: string): Promise<Task[]>` — assignee = userId, status.is_backlog = false
- `findByProject(projectId: string, filters?): Promise<Task[]>` — aggregat wszystkich modułów
- `findByModule(moduleId: string): Promise<TaskWithDetails[]>` — z assignees, tags, status
- `findById(id: string): Promise<TaskWithDetails>`
- `create(dto: CreateTaskDto, userId: string): Promise<Task>` — log activity `task.created`
- `update(id: string, dto: UpdateTaskDto, userId: string): Promise<Task>` — log activity
- `updateStatus(id: string, statusId: string, position: number, userId: string): Promise<Task>` — log activity + SSE emit
- `delete(id: string): Promise<void>`
- `addComment(taskId: string, body: string, userId: string): Promise<Comment>`
- `getActivity(taskId: string): Promise<Activity[]>`

**SSE emit po `updateStatus`:**
```typescript
this.eventsService.emit('taskboard.task.moved', {
  taskId: id,
  statusId,
  moduleId: task.moduleId,
});
```

---

### Task 14: Kontrolery z RBAC

Wzór dla każdego kontrolera (przykład TasksController):

```typescript
@ApiTags('taskboard')
@ApiBearerAuth('session')
@Controller('taskboard/tasks')
@UseGuards(SessionGuard, PermissionGuard)
export class TasksController {
  // GET  /api/taskboard/tasks/my             — @RequirePermission('taskboard', 'read')
  // GET  /api/taskboard/tasks/:id            — @RequirePermission('taskboard', 'read')
  // POST /api/taskboard/tasks                — @RequirePermission('taskboard', 'write')
  // PATCH /api/taskboard/tasks/:id           — @RequirePermission('taskboard', 'write')
  // PATCH /api/taskboard/tasks/:id/status    — @RequirePermission('taskboard', 'write')
  // DELETE /api/taskboard/tasks/:id          — @RequirePermission('taskboard', 'manage')
  // POST /api/taskboard/tasks/:id/comments   — @RequirePermission('taskboard', 'write')
  // GET  /api/taskboard/tasks/:id/activity   — @RequirePermission('taskboard', 'read')
}
```

**Pamiętaj:** Wszystkie routes dostają prefix `/api/` globalnie. Kontroler deklaruje `taskboard/tasks` → endpoint: `/api/taskboard/tasks`.

---

### Task 15: Seed RBAC — dodaj uprawnienia taskboard

**Plik:** Szukaj istniejącego seed/init pliku dla RBAC uprawnień.

Dodaj do seed:
```
resource: 'taskboard', action: 'read'   → role: user, admin, manage
resource: 'taskboard', action: 'write'  → role: admin, manage
resource: 'taskboard', action: 'manage' → role: admin, manage
```

---

### Task 16: Testy serwisów (unit)

**Pliki:**
- `plugins/crm-plugin-taskboard/src/tasks/tasks.service.spec.ts`
- `plugins/crm-plugin-taskboard/src/projects/projects.service.spec.ts`

Pattern: identyczny `makeChain()` mock jak w reszcie projektu (AGENTS.md).

Kluczowe testy:
- `findMyTasks` nie zwraca tasków z backlog statusem
- `updateStatus` wywołuje `eventsService.emit` z właściwymi argumentami
- `create` loguje activity `task.created`

**Weryfikacja:** `cd apps/api && npx jest crm-plugin-taskboard --no-coverage` — PASS.

---

## Faza 3 — Frontend

### Task 17: Zainstaluj `vue-draggable-plus`

```bash
pnpm add -w vue-draggable-plus
```

Sprawdź najpierw czy `@vueuse/integrations` nie ma już Sortable — jeśli tak, użyj tego.

**Weryfikacja:** `pnpm build` w `apps/web/` — 0 błędów.

---

### Task 18: Pinia store — `taskboard.store.ts`

**Plik:** `apps/web/src/stores/taskboard.store.ts`

```typescript
export const useTaskboardStore = defineStore('taskboard', () => {
  const projects = ref<Project[]>([]);
  const currentProject = ref<Project | null>(null);
  const currentModule = ref<Module | null>(null);
  const myTasks = ref<Task[]>([]);
  
  async function fetchProjects() { ... }
  async function fetchMyTasks() { ... }
  async function fetchBoard(moduleId: string) { ... }  // returns { statuses, tasks }
  async function moveTask(taskId: string, statusId: string, position: number) { ... }
  
  return { projects, currentProject, currentModule, myTasks, fetchProjects, fetchMyTasks, fetchBoard, moveTask };
});
```

Wszystkie fetch przez `fetch('/api/taskboard/...', { credentials: 'include' })`.

---

### Task 19: SSE — dodaj obsługę taskboard events w `useRealtimeEvents`

**Plik:** `apps/web/src/composables/useRealtimeEvents.ts`

Dodaj do `switch (type)`:
```typescript
case 'taskboard.task.moved':
  if (taskboardStore.currentModule?.id === data.moduleId) {
    taskboardStore.fetchBoard(data.moduleId as string);
  }
  break;
```

---

### Task 20: Widok 1 — `MyTasksView.vue`

**Plik:** `apps/web/src/views/plugins/taskboard/MyTasksView.vue`

Prosta lista tasków przypisanych do zalogowanego usera, zgrupowana po projekcie/module, bez backlogu.
- Kliknięcie taska → otwiera `TaskDetailDrawer`
- Filtr po priorytecie

---

### Task 21: Komponent `KanbanBoard.vue` — core

**Plik:** `apps/web/src/views/plugins/taskboard/components/KanbanBoard.vue`

```typescript
// Props: statuses: Status[], tasks: Task[], moduleId: string
// Emits: task-moved(taskId, newStatusId, position)

// vue-draggable-plus:
// <VueDraggable v-model="columnTasks" group="tasks" @end="onDragEnd" />
```

- Kolumny = statusy posortowane po `position`
- Karty = `TaskCard.vue` per task
- `onDragEnd` → emit `task-moved` → store `moveTask()` (optimistic update) → SSE broadcast

---

### Task 22: Komponent `TaskCard.vue`

**Plik:** `apps/web/src/views/plugins/taskboard/components/TaskCard.vue`

Wyświetla:
- Tytuł, priorytet (ikona/kolor), due date (czerwone jeśli przeterminowane)
- Avatary assignees (max 3, "+N" jeśli więcej)
- Tagi jako chips
- Licznik komentarzy i subtasków

---

### Task 23: Komponent `TaskDetailDrawer.vue`

**Plik:** `apps/web/src/views/plugins/taskboard/components/TaskDetailDrawer.vue`

Drawer (panel boczny) z pełnym detalem taska:
- Edycja tytułu inline
- Zmiana statusu, priorytetu, due date
- Multi-select assignees
- Tagi
- Powiązanie z leadem (autocomplete leadów)
- Lista subtasków (rozwijalna)
- Sekcja komentarzy (lista + textarea + submit)
- Timeline aktywności (activity log)

---

### Task 24: Widok 2 — `ModuleBoardView.vue`

**Plik:** `apps/web/src/views/plugins/taskboard/ModuleBoardView.vue`

- Montuje `KanbanBoard` z taskami danego modułu
- Toolbar: filtr assignee, priorytet, tag + button "Nowy task"
- Route param: `:moduleId`

---

### Task 25: Widok 3 — `ProjectView.vue` (widok PM)

**Plik:** `apps/web/src/views/plugins/taskboard/ProjectView.vue`

Dwa taby:
1. **Kanban** — aggregat wszystkich modułów, kolumny = union statusów projektu
2. **Lista** — tabela z kolumnami: Tytuł | Moduł | Status | Assignees | Priorytet | Due Date

   Filtry: moduł, assignee, priorytet, status, tag

Route param: `:projectId`

---

### Task 26: Widok główny `TaskboardView.vue` — lista projektów

**Plik:** `apps/web/src/views/plugins/taskboard/TaskboardView.vue`

Sidebar z listą projektów + modułów (tree). Kliknięcie modułu → `ModuleBoardView`. Kliknięcie projektu → `ProjectView`.

Osobna karta "Moje Taski" na górze listy.

---

### Task 27: Router — rejestracja routes taskboard

**Plik:** `apps/web/src/router/index.ts` — dodaj do children layoutu:

```typescript
{
  path: 'taskboard',
  name: 'taskboard',
  component: () => import('../views/plugins/taskboard/TaskboardView.vue'),
  meta: { titleKey: 'nav.workspace.taskboard' },
  children: [
    { path: 'my', name: 'taskboard-my', component: () => import('../views/plugins/taskboard/MyTasksView.vue') },
    { path: 'projects/:projectId', name: 'taskboard-project', component: () => import('../views/plugins/taskboard/ProjectView.vue') },
    { path: 'modules/:moduleId', name: 'taskboard-module', component: () => import('../views/plugins/taskboard/ModuleBoardView.vue') },
  ],
},
```

**Uwaga:** Route `/taskboard` pochodzi z `getFrontendRoutes()` pluginu — sprawdź jak plugin-registry.ts w froncie to obsługuje. Może wymagać rozszerzenia `pluginComponentMap`.

---

### Task 28: Rejestracja w `pluginComponentMap`

**Plik:** `apps/web/src/plugins/plugin-registry.ts`

```typescript
crm_taskboard: () => import('../views/plugins/taskboard/TaskboardView.vue'),
```

---

### Task 29: i18n — klucze tłumaczeń

**Pliki:** `apps/web/src/i18n/pl.ts` i `apps/web/src/i18n/en.ts`

Dodaj klucze:
```
nav.workspace.taskboard: 'Task Board' / 'Task Board'
plugins.taskboard.displayName: 'Task Board' / 'Task Board'
plugins.taskboard.description: 'Kanban z projektami i taskami' / 'Kanban with projects and tasks'
taskboard.project.new: 'Nowy projekt' / 'New project'
taskboard.task.new: 'Nowy task' / 'New task'
taskboard.my.title: 'Moje taski' / 'My tasks'
// ... reszta per komponent
```

---

## Faza 4 — Weryfikacja end-to-end

### Task 30: Smoke test — manualna weryfikacja

Checklist:
- [ ] Panel pluginów → "Task Board" widoczny, można enable/disable
- [ ] Po enable: nawigacja "Task Board" pojawia się w sidebarze
- [ ] Utwórz projekt → moduł → status → task (tylko tytuł)
- [ ] Drag & drop karty → status zmieniony w DB
- [ ] Drugi tab przeglądarki → ruch karty widoczny bez odświeżania (SSE)
- [ ] "Moje taski" nie pokazuje tasków w statusie backlog
- [ ] Przypięcie taska do leada → lead widoczny w detalu taska

### Task 31: `pnpm test` — pełna weryfikacja

```bash
cd /opt/data/work/crm-repo
cd apps/api && npx jest --no-coverage
```

Oczekiwane: wszystkie testy PASS (nowe + istniejące).

---

## Kolejność implementacji (Cursor)

```
Faza 0 → Faza 1 (Task 1-8 razem — SDK + scaffold + rejestracja) → build check
→ Faza 2 (Task 9-16 — backend serwisy + kontrolery + RBAC seed + testy)
→ Faza 3 (Task 17-29 — frontend od store przez widoki do i18n)
→ Faza 4 (Task 30-31 — weryfikacja)
```

Każda faza powinna kończyć się `pnpm build` i `npx jest --no-coverage`.

---

## Ryzyka i pitfalls

| # | Ryzyko | Mitygacja |
|---|--------|-----------|
| 1 | `onMigrate` z `sql.unsafe()` na całym pliku SQL — jeden błąd blokuje wszystko | Podziel migrations.sql na osobne statements, owijaj każdy w try/catch |
| 2 | Drizzle table definitions w pluginie vs główny schema — JOIN z `leads` / `users` | Zdefiniuj `tbTasks` z FK ale bez relacji Drizzle — używaj raw uuid do joinów |
| 3 | vue-draggable-plus + SSE jednocześnie = race condition (drag + incoming SSE update) | Debounce SSE re-fetch po drag (200ms), cancel jeśli drag in progress |
| 4 | Self-referential `parent_task_id` — nieskończona rekurencja w UI | Limit wyświetlania subtasków do 2 poziomów głębokości w `TaskDetailDrawer` |
| 5 | Statusy per projekt vs per moduł — constraint CHECK może być nieoczywisty | Jasny error message gdy próba tworzenia statusu bez project_id i module_id |
| 6 | AGENTS.md: UI copy musi być przez `t()` | Każdy string w `.vue` przez i18n — bez wyjątków |
| 7 | AGENTS.md: UI colors przez design tokens | Nie używać hardcodowanych kolorów tagów/priorytetów — mapować przez CSS vars |
