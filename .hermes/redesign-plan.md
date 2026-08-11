# CRM Redesign Plan — Linear-inspired dark UI

## Cel

Całkowity redesign frontendu: z "technical/boring neutral-grey" na nowoczesny dark UI
inspirowany Linear.app — precyzyjny, premium, spójny system tokenów.
Bez zmian backendu. Bez nowych zależności npm.
Podejście: najpierw tokeny i komponenty bazowe, potem widoki.

---

## Design tokens (Tailwind custom config)

Jedyna zmiana w `tailwind.config.js` — dodaj custom colors jako rozszerzenie palety:

```js
// tailwind.config.js
extend: {
  colors: {
    surface: {
      base:     '#08090a',   // tło strony
      panel:    '#0f1011',   // sidebar, panels
      elevated: '#191a1b',   // karty, dropdowny
      hover:    '#1e1f21',   // hover na kartach
      input:    '#131415',   // tła inputów
    },
    border: {
      subtle: 'rgba(255,255,255,0.05)',
      default: 'rgba(255,255,255,0.08)',
      strong:  'rgba(255,255,255,0.12)',
    },
    text: {
      primary:   '#f7f8f8',
      secondary: '#d0d6e0',
      muted:     '#8a8f98',
      ghost:     '#62666d',
    },
    accent: {
      DEFAULT:   '#5e6ad2',
      hover:     '#7170ff',
      subtle:    'rgba(94,106,210,0.15)',
    },
  },
  fontFamily: {
    sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
  },
}
```

Dodaj do `<head>` w `index.html`:
```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
```

Dodaj do globalnego CSS (`style.css`):
```css
* { font-feature-settings: "cv01", "ss03"; }
body { font-size: 14px; -webkit-font-smoothing: antialiased; }
```

---

## Pliki do zmiany — pełna lista

```
apps/web/
  index.html                                    ← dodaj Inter font link
  src/style.css                                 ← font-feature-settings, base font-size
  tailwind.config.js                            ← custom design tokens
  src/views/layout/AppLayout.vue                ← sidebar + topbar (duże zmiany)
  src/components/AppTable.vue                   ← przepisanie stylu
  src/components/AppModal.vue                   ← przepisanie stylu
  src/components/AppPagination.vue              ← przepisanie stylu
  src/views/auth/LoginView.vue                  ← przepisanie stylu
  src/views/contacts/ContactsView.vue           ← klasy CSS (logika bez zmian)
  src/views/contacts/ContactDetailView.vue      ← klasy CSS
  src/views/forms/FormsView.vue                 ← klasy CSS
  src/views/forms/FormsAnalyticsView.vue        ← klasy CSS
  src/views/forms/FormDetailView.vue            ← klasy CSS
  src/views/roles/RolesView.vue                 ← klasy CSS
  src/views/users/UsersView.vue                 ← klasy CSS
  src/views/plugins/PluginsView.vue             ← klasy CSS
  src/views/settings/SettingsView.vue           ← klasy CSS
  src/views/pipeline/PipelineView.vue           ← jeśli już istnieje
```

---

## 1. `AppLayout.vue` — największa zmiana

### Sidebar

**Zmień tło i border:**
- `bg-neutral-900 border-r border-neutral-800` → `bg-[#0f1011] border-r border-[rgba(255,255,255,0.05)]`

**Logo/header sidebar:**
- Obecne: `<span class="text-lg font-semibold text-white tracking-tight">CRM</span>`
- Nowe: `<span class="text-sm font-semibold text-[#f7f8f8] tracking-tight uppercase letter-spacing-[0.08em]">CRM</span>`

**Nav items — base state:**
```html
<!-- Obecne klasy: -->
class="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
active-class="!text-white !bg-neutral-800"

<!-- Nowe klasy: -->
class="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-[#8a8f98] hover:text-[#f7f8f8] hover:bg-[rgba(255,255,255,0.04)] transition-all duration-150"
active-class="!text-[#f7f8f8] !bg-[rgba(255,255,255,0.06)]"
```

**Nav items — active state z lewym akcentem:**
Dodaj wrapper z `relative` i pseudo-element przez dodatkową klasę lub conditionally rendered div:
```html
<RouterLink
  v-for="item in navItems"
  :key="item.to"
  :to="item.to"
  class="relative flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-[#8a8f98] hover:text-[#f7f8f8] hover:bg-[rgba(255,255,255,0.04)] transition-all duration-150"
  active-class="!text-[#f7f8f8] !bg-[rgba(255,255,255,0.06)]"
>
  <!-- Left accent bar — widoczny tylko gdy aktywny -->
  <span
    v-if="$route.path.startsWith(item.to)"
    class="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-[#7170ff] rounded-full"
  />
  <span class="text-base">{{ item.icon }}</span>
  {{ item.label }}
</RouterLink>
```

**Bottom user section:**
```html
<!-- Obecne: -->
<div class="px-4 py-4 border-t border-neutral-800">

<!-- Nowe: -->
<div class="px-4 py-4 border-t border-[rgba(255,255,255,0.05)]">
  <p class="text-xs text-[#62666d] truncate mb-2">{{ auth.user?.email ?? 'Unknown' }}</p>
  <button class="w-full text-xs text-[#62666d] hover:text-[#d0d6e0] transition-colors text-left">
    Sign out
  </button>
```

### Topbar

```html
<!-- Obecne: -->
<header class="h-14 flex-shrink-0 border-b border-neutral-800 bg-neutral-900 flex items-center px-6 gap-3">
  <h1 class="text-sm font-medium text-neutral-400">{{ currentPageTitle }}</h1>

<!-- Nowe: -->
<header class="h-12 flex-shrink-0 border-b border-[rgba(255,255,255,0.05)] bg-[#0f1011] flex items-center px-6 gap-3">
  <h1 class="text-xs font-medium text-[#62666d] uppercase tracking-widest">{{ currentPageTitle }}</h1>
```

### Tło głównej treści:

```html
<!-- Obecne: -->
<main class="flex-1 overflow-y-auto p-6">

<!-- Nowe: -->
<main class="flex-1 overflow-y-auto p-6 bg-[#08090a]">
```

---

## 2. Design system — shared Tailwind klasy (użyj w KAŻDYM pliku)

Zdefiniuj w `style.css` jako `@layer components` żeby nie powtarzać w każdym pliku:

```css
@layer components {
  /* Karty / kontenery */
  .crm-card {
    @apply bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)] rounded-xl;
  }

  /* Sekcje page (jak obecne bg-neutral-900 border rounded-xl) */
  .crm-panel {
    @apply bg-[#0f1011] border border-[rgba(255,255,255,0.06)] rounded-xl;
  }

  /* Przyciski primary */
  .btn-primary {
    @apply px-4 py-2 bg-[#5e6ad2] hover:bg-[#7170ff] text-white text-sm font-medium rounded-md transition-all duration-150 disabled:opacity-40;
  }

  /* Przyciski secondary / ghost */
  .btn-ghost {
    @apply px-4 py-2 bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.08)] border border-[rgba(255,255,255,0.08)] text-[#d0d6e0] text-sm font-medium rounded-md transition-all duration-150;
  }

  /* Przyciski danger */
  .btn-danger {
    @apply px-4 py-2 bg-transparent hover:bg-red-500/10 border border-red-800/50 hover:border-red-500/50 text-red-400 hover:text-red-300 text-sm font-medium rounded-md transition-all duration-150;
  }

  /* Input fields */
  .crm-input {
    @apply w-full px-3 py-2 bg-[#131415] border border-[rgba(255,255,255,0.08)] text-[#f7f8f8] placeholder-[#62666d] text-sm rounded-md focus:outline-none focus:border-[#5e6ad2] focus:ring-1 focus:ring-[#5e6ad2]/30 transition-all duration-150;
  }

  /* Labelki nad inputami */
  .crm-label {
    @apply block text-xs font-medium text-[#8a8f98] mb-1.5 uppercase tracking-wide;
  }

  /* Page header (tytuł widoku + akcje) */
  .crm-page-header {
    @apply flex items-center justify-between gap-4 flex-wrap mb-6;
  }

  /* Tytuł widoku */
  .crm-page-title {
    @apply text-lg font-semibold text-[#f7f8f8] tracking-tight;
  }

  /* Error banner */
  .crm-error {
    @apply text-sm text-red-400 bg-red-500/10 border border-red-800/50 rounded-lg px-4 py-3;
  }

  /* Empty state */
  .crm-empty {
    @apply text-center py-16 text-[#62666d] text-sm;
  }

  /* Badge priority */
  .badge-high   { @apply inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-500/15 text-red-400; }
  .badge-medium { @apply inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-500/15 text-amber-400; }
  .badge-low    { @apply inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[rgba(255,255,255,0.06)] text-[#8a8f98]; }
}
```

---

## 3. `AppTable.vue` — przepisanie stylu

Obecna logika i sloty BEZ ZMIAN. Tylko klasy CSS.

```html
<template>
  <div class="crm-card overflow-hidden">
    <caption v-if="caption" class="sr-only">{{ caption }}</caption>
    <table class="w-full text-sm">
      <!-- Header -->
      <thead>
        <tr class="border-b border-[rgba(255,255,255,0.06)]">
          <th
            v-for="col in columns"
            :key="col.key"
            class="px-4 py-3 text-left text-xs font-medium text-[#62666d] uppercase tracking-wider"
          >
            {{ col.label }}
          </th>
          <th v-if="hasActions" class="px-4 py-3" />
        </tr>
      </thead>
      <!-- Body -->
      <tbody>
        <!-- Loading skeleton -->
        <template v-if="loading">
          <tr v-for="i in 5" :key="i" class="border-b border-[rgba(255,255,255,0.04)]">
            <td v-for="col in columns" :key="col.key" class="px-4 py-3">
              <div class="h-4 bg-[rgba(255,255,255,0.06)] rounded animate-pulse" />
            </td>
          </tr>
        </template>
        <!-- Empty state -->
        <tr v-else-if="!rows.length">
          <td :colspan="columns.length + (hasActions ? 1 : 0)" class="crm-empty">
            {{ emptyText ?? 'No data' }}
          </td>
        </tr>
        <!-- Data rows -->
        <tr
          v-else
          v-for="row in rows"
          :key="(row as any).id"
          class="border-b border-[rgba(255,255,255,0.04)] last:border-0 transition-colors duration-100"
          :class="[
            clickable ? 'cursor-pointer hover:bg-[rgba(255,255,255,0.03)]' : '',
          ]"
          :tabindex="clickable ? 0 : undefined"
          :role="clickable ? 'button' : undefined"
          @click="clickable ? $emit('row-click', row) : null"
          @keydown.enter.space.prevent="clickable ? $emit('row-click', row) : null"
        >
          <td
            v-for="col in columns"
            :key="col.key"
            class="px-4 py-3 text-[#d0d6e0]"
          >
            <slot :name="`cell-${col.key}`" :row="row" :value="(row as any)[col.key]">
              <span :class="col.key === columns[0].key ? 'text-[#f7f8f8] font-medium' : ''">
                {{ (row as any)[col.key] ?? '—' }}
              </span>
            </slot>
          </td>
          <td v-if="hasActions" class="px-4 py-3">
            <slot name="actions" :row="row" />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
```

**Nowe props do dodania:** `loading?: boolean` — żeby skeleton działał.

---

## 4. `AppModal.vue` — przepisanie stylu

Obecna logika (focus trap, teleport, ESC) BEZ ZMIAN.

```html
<!-- Backdrop -->
<div class="absolute inset-0 bg-black/70 backdrop-blur-sm" @click="$emit('close')" />

<!-- Panel -->
<div
  ref="modalRef"
  tabindex="-1"
  class="relative z-10 w-full max-w-md bg-[#0f1011] border border-[rgba(255,255,255,0.08)] rounded-xl p-6 shadow-2xl"
>
  <!-- Close button (jeśli jest) -->
  <button
    class="absolute top-4 right-4 text-[#62666d] hover:text-[#d0d6e0] transition-colors"
    @click="$emit('close')"
    aria-label="Close"
  >
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
    </svg>
  </button>
  <slot />
</div>
```

**Tytuł modala** — zamień w KAŻDYM widoku:
```html
<!-- Obecne: -->
<h3 class="text-lg font-semibold text-white mb-4">

<!-- Nowe: -->
<h3 class="text-base font-semibold text-[#f7f8f8] mb-5">
```

---

## 5. `AppPagination.vue` — przepisanie stylu

```html
<div class="flex items-center justify-between pt-4 px-1">
  <p class="text-xs text-[#62666d]">
    Page {{ currentPage }} of {{ totalPages }}
  </p>
  <div class="flex gap-2">
    <button
      :disabled="currentPage <= 1"
      class="btn-ghost px-3 py-1.5 text-xs disabled:opacity-30"
      :aria-label="`Go to page ${currentPage - 1}`"
      @click="$emit('prev')"
    >
      ← Prev
    </button>
    <button
      :disabled="currentPage >= totalPages"
      class="btn-ghost px-3 py-1.5 text-xs disabled:opacity-30"
      :aria-label="`Go to page ${currentPage + 1}`"
      @click="$emit('next')"
    >
      Next →
    </button>
  </div>
</div>
```

---

## 6. `LoginView.vue` — przepisanie

```html
<template>
  <div class="min-h-screen bg-[#08090a] flex items-center justify-center px-4">
    <div class="w-full max-w-sm">
      <!-- Logo -->
      <div class="text-center mb-8">
        <p class="text-2xl font-semibold text-[#f7f8f8] tracking-tight">CRM</p>
        <p class="text-sm text-[#8a8f98] mt-1">Sign in to your account</p>
      </div>

      <!-- Card -->
      <div class="crm-panel p-6">
        <form @submit.prevent="handleLogin" class="space-y-4">
          <div>
            <label class="crm-label">Email</label>
            <input v-model="email" type="email" required class="crm-input" placeholder="you@example.com" />
          </div>
          <div>
            <label class="crm-label">Password</label>
            <input v-model="password" type="password" required class="crm-input" placeholder="••••••••" />
          </div>
          <div v-if="error" class="crm-error">{{ error }}</div>
          <button type="submit" :disabled="loading" class="btn-primary w-full justify-center">
            {{ loading ? 'Signing in…' : 'Sign in' }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>
```

---

## 7. Każdy widok — wspólny szablon (Contacts jako wzorzec)

Zastąp w KAŻDYM widoku:

| Obecne | Nowe |
|--------|------|
| `space-y-4` (root div) | `space-y-5` |
| `<h2 class="text-xl font-semibold text-white">` | `<h2 class="crm-page-title">` |
| `bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-md` | `btn-primary` |
| `bg-neutral-700 hover:bg-neutral-600 text-white text-sm rounded-md` | `btn-ghost` |
| `text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded` | `btn-danger text-xs px-2 py-1` |
| `bg-neutral-800 border border-neutral-700 text-white placeholder-neutral-500 focus:border-blue-500` | `crm-input` |
| `text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-md px-3 py-2` | `crm-error` |
| `text-neutral-500 text-sm py-8 text-center` (Loading) | zastąp skeleton w AppTable (prop `loading`) |
| `bg-neutral-900 border border-neutral-700 rounded-xl p-6` (panel) | `crm-panel p-6` |
| `block text-sm text-neutral-400 mb-1` (label) | `crm-label` |
| `w-full px-3 py-2 rounded-md bg-neutral-800 border border-neutral-700 text-white text-sm focus:border-blue-500` | `crm-input` |

---

## 8. Skeleton loading — zastępuje "Loading…" w każdym widoku

Dodaj prop `loading` do `AppTable`. Kiedy `loading=true` tabela renderuje 5 rows z pulsującymi prostokątami zamiast tekstu "Loading…" (patrz sekcja AppTable powyżej).

W widokach zamień:
```html
<!-- Usuń: -->
<div v-if="loading" class="text-neutral-500 text-sm py-8 text-center">Loading…</div>
<AppTable v-else ...>

<!-- Na: -->
<AppTable :loading="loading" ...>
```

---

## 9. Dodatkowe detale spójności

### Dividers między sekcjami na stronach detali
```html
<!-- Obecne: -->
<div class="border-t border-neutral-800 pt-4">

<!-- Nowe: -->
<div class="border-t border-[rgba(255,255,255,0.06)] pt-5">
```

### Badge'e statusów (listmonk, plugin version itp.)
```html
<!-- Obecne: -->
class="inline-block px-2 py-0.5 text-xs rounded bg-neutral-700 text-neutral-300"

<!-- Nowe: -->
class="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded bg-[rgba(255,255,255,0.06)] text-[#d0d6e0]"
```

### Toggle switch (plugins)
```html
<!-- Enabled: -->
class="bg-[#5e6ad2]"  <!-- zamiast bg-green-600 -->

<!-- Disabled: -->
class="bg-[rgba(255,255,255,0.08)]"  <!-- zamiast bg-neutral-700 -->
```

### Scrollbars (dodaj do style.css)
```css
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
```

---

## 10. Real-time SSE — EventsModule

### Backend — nowy moduł `apps/api/src/core/events/`

**`events.service.ts`:**
```typescript
import { Injectable } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';

export interface CrmEvent {
  type: string;
  data: Record<string, unknown>;
}

@Injectable()
export class EventsService {
  private readonly subject = new Subject<CrmEvent>();

  emit(type: string, data: Record<string, unknown> = {}) {
    this.subject.next({ type, data });
  }

  getStream(): Observable<MessageEvent> {
    return new Observable((observer) => {
      const sub = this.subject.subscribe((event) => {
        observer.next({ data: JSON.stringify(event) } as MessageEvent);
      });
      return () => sub.unsubscribe();
    });
  }
}
```

**`events.controller.ts`:**
```typescript
import { Controller, Sse, UseGuards } from '@nestjs/common';
import { Observable } from 'rxjs';
import { EventsService } from './events.service';
import { SessionGuard } from '../auth/session.guard';

@Controller('events')
@UseGuards(SessionGuard)
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Sse('stream')
  stream(): Observable<MessageEvent> {
    return this.events.getStream();
  }
}
```

**`events.module.ts`:**
```typescript
import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';

@Module({
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
```

**Rejestracja w `app.module.ts`:**
```typescript
imports: [
  ...,
  EventsModule,
]
```

**Emisja eventów w istniejących serwisach:**

W `public-forms.controller.ts` po `createSubmission()`:
```typescript
// wstrzyknij EventsService w konstruktorze
this.events.emit('submission.created', {
  contactId: contact.id,
  formId: form.id,
  formName: form.name,
});
```

W `leads.service.ts` po INSERT leada:
```typescript
this.events.emit('lead.created', { stageId, leadId: inserted.id });
```

W `leads.service.ts` po PATCH stageId:
```typescript
this.events.emit('lead.moved', { leadId, oldStageId, newStageId });
```

### Frontend — composable `useRealtimeEvents.ts`

```typescript
// apps/web/src/composables/useRealtimeEvents.ts
import { onMounted, onUnmounted } from 'vue';
import { usePipelineStore } from '../stores/pipeline.store';
import { useFormsStore } from '../stores/forms.store';

export function useRealtimeEvents() {
  let source: EventSource | null = null;

  const pipelineStore = usePipelineStore();
  const formsStore = useFormsStore();

  onMounted(() => {
    source = new EventSource('/api/events/stream', { withCredentials: true });

    source.onmessage = (e: MessageEvent) => {
      try {
        const { type, data } = JSON.parse(e.data);
        switch (type) {
          case 'lead.created':
          case 'lead.moved':
            // Refetch board — nie push do store żeby nie budować partial state
            pipelineStore.fetchBoard();
            break;
          case 'submission.created':
            // Inkrementuj licznik jeśli widok formularzy jest załadowany
            formsStore.onNewSubmission(data);
            break;
        }
      } catch { /* ignore malformed */ }
    };

    source.onerror = () => {
      // Przeglądarka automatycznie próbuje reconnect dla SSE — nie potrzeba manualnego retry
    };
  });

  onUnmounted(() => {
    source?.close();
    source = null;
  });
}
```

**Wywołaj raz w `AppLayout.vue`:**
```typescript
// <script setup>
import { useRealtimeEvents } from '../../composables/useRealtimeEvents';

useRealtimeEvents(); // globalnie dla całej aplikacji
```

**Dodaj `onNewSubmission` do `forms.store.ts`:**
```typescript
function onNewSubmission(data: { formId: string }) {
  // Jeśli mamy załadowane dane formularzy — inkrementuj submissionCount
  const form = forms.value.find(f => f.id === data.formId);
  if (form && 'submissionCount' in form) {
    (form as any).submissionCount++;
  }
}
```

---

## Kolejność wdrożenia

1. `tailwind.config.js` + `index.html` (Inter) + `style.css` — tokeny i font
2. `AppLayout.vue` — sidebar i topbar
3. `AppTable.vue`, `AppModal.vue`, `AppPagination.vue` — komponenty bazowe
4. `LoginView.vue`
5. Wszystkie widoki (zamień klasy wg tabeli w sekcji 7) — można automatem regex
6. EventsModule backend + `useRealtimeEvents` composable + integracja w AppLayout

---

## Czego NIE zmieniać

- Żadnej logiki TypeScript w `<script setup>` — tylko klasy CSS w `<template>`
- Żadnych props/emitów komponentów (z wyjątkiem dodania `loading` do AppTable)
- Żadnych zmian backendu poza nowym EventsModule
- Żadnych nowych zależności npm
