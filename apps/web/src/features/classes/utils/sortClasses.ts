import type { Class } from '@shared/schemas';

export type ClassSortField = 'schedule' | 'name' | 'max_capacity' | 'price_minor' | 'status';
export type ClassSortOrder = 'asc' | 'desc';

export const DEFAULT_CLASS_SORT: { field: ClassSortField; order: ClassSortOrder } = {
  field: 'schedule',
  order: 'asc',
};

type SortableClass = Pick<
  Class,
  'name' | 'day_of_week' | 'start_time' | 'max_capacity' | 'price_minor' | 'status'
>;

export function compareClasses(
  a: SortableClass,
  b: SortableClass,
  field: ClassSortField,
  order: ClassSortOrder
): number {
  const dir = order === 'asc' ? 1 : -1;

  switch (field) {
    case 'schedule': {
      const dayA = a.day_of_week ?? 99;
      const dayB = b.day_of_week ?? 99;
      if (dayA !== dayB) return (dayA - dayB) * dir;
      const timeCmp = (a.start_time ?? '').localeCompare(b.start_time ?? '');
      if (timeCmp !== 0) return timeCmp * dir;
      return a.name.localeCompare(b.name) * dir;
    }
    case 'name':
      return a.name.localeCompare(b.name) * dir;
    case 'max_capacity':
      return (a.max_capacity - b.max_capacity) * dir;
    case 'price_minor':
      return (a.price_minor - b.price_minor) * dir;
    case 'status':
      return (a.status ?? '').localeCompare(b.status ?? '') * dir;
    default:
      return 0;
  }
}

export function sortClasses<T extends SortableClass>(
  classes: T[],
  field: ClassSortField = DEFAULT_CLASS_SORT.field,
  order: ClassSortOrder = DEFAULT_CLASS_SORT.order
): T[] {
  return [...classes].sort((a, b) => compareClasses(a, b, field, order));
}
