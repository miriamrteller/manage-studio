import { useCallback, useState } from 'react';
import type { SortOrder } from '@/lib/list-query';

export function useSortState<TField extends string>(
  defaultField: TField,
  defaultOrder: SortOrder = 'asc'
) {
  const [sortField, setSortField] = useState<TField>(defaultField);
  const [sortOrder, setSortOrder] = useState<SortOrder>(defaultOrder);

  const toggleSort = useCallback(
    (field: TField, onChange?: () => void) => {
      if (sortField === field) {
        setSortOrder((current) => (current === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortOrder('asc');
      }
      onChange?.();
    },
    [sortField]
  );

  return { sortField, sortOrder, setSortField, setSortOrder, toggleSort };
}
