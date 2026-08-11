/**
 * Localizing text that arrives from the backend (ADR-0011).
 *
 * NestJS ships no message catalog and no `Accept-Language` handling: it sends
 * **stable identifiers plus the English literal**, and the SPA owns the copy.
 * Every lookup here therefore has the same shape — resolve a key if the bundle
 * knows it, otherwise render what the server sent. That fallback is the point:
 * a third-party plugin this build has never heard of stays readable instead of
 * rendering a raw key.
 *
 * Two sources of such text, with different identifiers:
 *
 * 1. **Plugin metadata** carries its own `*Key` fields, so nothing is mapped
 *    here — see `useServerText()`.
 * 2. **Rows the API seeded into the database** carry no key, so the identifier
 *    is the row itself: a role's `name`, a stage's stored `name`. A seeded row is
 *    localized **only while it still matches the seed literal** — the moment an
 *    operator renames it, their own words win and keep winning. The seed literals
 *    come from `@khirby/types`, shared with the seeder, so the two cannot drift.
 *
 * Deliberately free of vue-i18n imports: these are pure functions with plain
 * input→output units (`.claude/rules/web.md`), and `useServerText()` binds them.
 */
import {
  DEFAULT_PIPELINE_STAGE_NAMES,
  SUPER_ADMIN_ROLE_DESCRIPTION,
  SUPER_ADMIN_ROLE_NAME,
  type DefaultPipelineStageName,
} from '@khirby/types';

/** `t` from `useI18n()`, narrowed to what this module needs. */
export type Translate = (key: string) => string;

/** `te` from `useI18n()` — does the active bundle actually have this key? */
export type HasMessage = (key: string) => boolean;

/**
 * The one resolution rule: a key the bundle knows wins; anything else renders the
 * literal the server sent. `key` is nullable so callers can pass the result of a
 * seed lookup straight through.
 */
export function resolveServerText(
  key: string | null | undefined,
  fallback: string,
  t: Translate,
  te: HasMessage,
): string {
  return key && te(key) ? t(key) : fallback;
}

/**
 * Seeded stage name → message key. `Record<DefaultPipelineStageName, …>` is the
 * enforcement: adding a stage to the shared seed list without adding its key
 * here fails the typecheck instead of silently shipping an English column header.
 *
 * Keyed by the stored name rather than by `position`, on purpose — positions are
 * reorderable, so position 0 stops meaning "New Lead" the first time someone
 * drags a column.
 */
export const SEED_STAGE_NAME_KEYS: Record<DefaultPipelineStageName, string> = {
  'New Lead': 'pipeline.seedStages.newLead',
  'Meeting Set': 'pipeline.seedStages.meetingSet',
  Negotiation: 'pipeline.seedStages.negotiation',
  Won: 'pipeline.seedStages.won',
  Lost: 'pipeline.seedStages.lost',
};

/** Key for a stage still carrying its seeded name; `null` once it was renamed. */
export function seedStageNameKey(storedName: string): string | null {
  return SEED_STAGE_NAME_KEYS[storedName as DefaultPipelineStageName] ?? null;
}

/** True while `storedName` is one of the five names a fresh install ships with. */
export function isSeededStageName(storedName: string): boolean {
  return (DEFAULT_PIPELINE_STAGE_NAMES as readonly string[]).includes(storedName);
}

/**
 * Key for the super-admin role's seeded description. Role **names** are never
 * translated — they are identifiers the operator can create and rename — so only
 * the one description the seeder writes is localized, and only until it is edited.
 */
export function seedRoleDescriptionKey(
  roleName: string,
  storedDescription: string | null,
): string | null {
  if (roleName !== SUPER_ADMIN_ROLE_NAME) return null;
  return storedDescription === SUPER_ADMIN_ROLE_DESCRIPTION
    ? 'roles.seed.superAdmin.description'
    : null;
}
