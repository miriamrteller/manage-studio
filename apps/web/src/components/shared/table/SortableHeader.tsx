import type { SortOrder } from '@/lib/list-query';

interface SortableHeaderProps<TField extends string> {
  label: string;
  sortKey: TField;
  currentField: TField;
  currentOrder: SortOrder;
  onSort: (field: TField) => void;
  className?: string;
}

export function SortableHeader<TField extends string>({
  label,
  sortKey,
  currentField,
  currentOrder,
  onSort,
  className = 'px-4 py-3 text-start font-medium',
}: SortableHeaderProps<TField>) {
  const isActive = currentField === sortKey;

  return (
    <th
      className={className}
      aria-sort={isActive ? (currentOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 hover:text-[var(--color-primary-default)]"
      >
        {label}
        {isActive && <span aria-hidden="true">{currentOrder === 'asc' ? '↑' : '↓'}</span>}
      </button>
    </th>
  );
}
