import { i18n } from '../i18n';
import type { LeadPriority } from '@khirby/types';

/**
 * Money through the named 'currency' format (ADR-0011): the locale decides the
 * punctuation, TENANT_CURRENCY decides the currency. This used to build its own
 * Intl.NumberFormat with the currency hardcoded and the locale left to the
 * browser, so the two disagreed.
 */
export function formatCurrency(value: string | null | undefined): string {
  if (!value) return '';
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return i18n.global.n(num, 'currency');
}

export function getInitials(email: string | null | undefined, name?: string | null): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return '?';
}

/**
 * A DB token mapped to a message key — never `toUpperCase()`, which rendered the
 * raw enum ("HIGH") as a visible label and has no correct casing in every script.
 */
export function priorityLabel(priority: string): string {
  const known: LeadPriority[] = ['low', 'medium', 'high'];
  return known.includes(priority as LeadPriority)
    ? i18n.global.t(`pipeline.priority.${priority as LeadPriority}`)
    : priority;
}

export function priorityBadgeClass(priority: string): string {
  switch (priority) {
    case 'high': return 'badge-high';
    case 'medium': return 'badge-medium';
    default: return 'badge-low';
  }
}
