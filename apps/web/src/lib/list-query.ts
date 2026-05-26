export type SortOrder = 'asc' | 'desc';

export interface ListSortState<TField extends string> {
  sortField: TField;
  sortOrder: SortOrder;
}
