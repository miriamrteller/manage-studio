import type { SortOrder } from '@/lib/list-query';

export type PersonSortField = 'name' | 'date_of_birth' | 'status' | 'created_at';

export const DEFAULT_PERSON_SORT: { field: PersonSortField; order: SortOrder } = {
  field: 'name',
  order: 'asc',
};

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Convert min/max age filters to date_of_birth bounds (YYYY-MM-DD). */
export function ageRangeToDobBounds(
  minAge: number | null | undefined,
  maxAge: number | null | undefined,
  reference = new Date()
): { minDob?: string; maxDob?: string } {
  const bounds: { minDob?: string; maxDob?: string } = {};

  if (minAge != null && !Number.isNaN(minAge)) {
    const d = new Date(reference);
    d.setFullYear(d.getFullYear() - minAge);
    bounds.maxDob = formatDate(d);
  }

  if (maxAge != null && !Number.isNaN(maxAge)) {
    const d = new Date(reference);
    d.setFullYear(d.getFullYear() - maxAge - 1);
    d.setDate(d.getDate() + 1);
    bounds.minDob = formatDate(d);
  }

  return bounds;
}

/** When sorting by age in the UI, invert order so asc = youngest first. */
export function personSortOrderForField(
  field: PersonSortField,
  order: SortOrder
): SortOrder {
  if (field === 'date_of_birth') {
    return order === 'asc' ? 'desc' : 'asc';
  }
  return order;
}
