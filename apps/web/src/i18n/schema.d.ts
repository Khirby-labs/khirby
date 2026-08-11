/**
 * Typed t() / d() / n() (ADR-0011).
 *
 * Augmenting vue-i18n's Define* interfaces makes `vue-tsc` reject a key that
 * doesn't exist and a format name that isn't declared — so a renamed key fails
 * the typecheck gate instead of rendering as raw text in production.
 */
import type { MessageSchema } from './index';
import type { DateTimeFormatName, NumberFormatName } from './formats';

declare module 'vue-i18n' {
  /* eslint-disable @typescript-eslint/no-empty-object-type */
  export interface DefineLocaleMessage extends MessageSchema {}
  export interface DefineDateTimeFormat extends Record<
    DateTimeFormatName,
    Intl.DateTimeFormatOptions
  > {}
  export interface DefineNumberFormat extends Record<NumberFormatName, Intl.NumberFormatOptions> {}
  /* eslint-enable @typescript-eslint/no-empty-object-type */
}
