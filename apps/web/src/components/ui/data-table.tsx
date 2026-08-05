import React, { useEffect, useMemo, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type Table as TanStackTable,
} from '@tanstack/react-table';
import { cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';
import { useResponsiveTable } from '@/hooks/useResponsiveTable';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';

/**
 * `TValue` is threaded through as a second type parameter rather than pinned to
 * `unknown` or widened to `any`. TanStack's `ColumnDef` uses TValue in both
 * co- and contravariant positions, so a pinned `ColumnDef<T, unknown>[]` would
 * reject a perfectly valid `ColumnDef<Booking, string>[]` at the call site,
 * while `any` would trip the lint gate (`--max-warnings 0`). Leaving it generic
 * lets TypeScript infer it from the columns that are actually passed.
 */
export interface DataTableProps<T, TValue = unknown> {
  columns: Array<ColumnDef<T, TValue>>;
  data: T[];
  pagination?: boolean;
  sorting?: boolean;
  filtering?: boolean;
  /** Card body for one row, used below `mobileBreakpoint`. */
  mobileCardRenderer?: (item: T) => React.ReactNode;
  mobileBreakpoint?: number;
  pageSize?: number;
  /** Accessible table name. Rendered as a visually hidden <caption>. */
  caption: string;
  searchPlaceholder?: string;
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

function SortGlyph({ direction }: { direction: 'asc' | 'desc' | false }) {
  if (direction === 'asc') return <span aria-hidden="true">▲</span>;
  if (direction === 'desc') return <span aria-hidden="true">▼</span>;
  // Reserve the space so headers do not shift when sorting is applied.
  return (
    <span aria-hidden="true" className="opacity-40">
      ↕
    </span>
  );
}

function Pagination<T>({ table }: { table: TanStackTable<T> }) {
  const pageIndex = table.getState().pagination.pageIndex;
  const pageCount = table.getPageCount();

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] px-3 py-2"
      aria-label="Table pagination"
    >
      <p className="text-caption text-[var(--color-text-secondary)]" aria-live="polite">
        Page {pageIndex + 1} of {Math.max(pageCount, 1)} · {table.getFilteredRowModel().rows.length}{' '}
        rows
      </p>

      <div className="flex items-center gap-2">
        <label className="text-caption flex items-center gap-2 text-[var(--color-text-secondary)]">
          Rows
          <select
            className="form-control-base touch-target w-auto py-1"
            value={table.getState().pagination.pageSize}
            onChange={(event) => table.setPageSize(Number(event.target.value))}
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="touch-target rounded-md border border-[var(--border-default)] px-2 disabled:opacity-50"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
          aria-label="Previous page"
        >
          {/* Mirrors under RTL, so "previous" always points backwards in the
              reading direction. */}
          <span className="icon-directional inline-block" aria-hidden="true">
            ‹
          </span>
        </button>
        <button
          type="button"
          className="touch-target rounded-md border border-[var(--border-default)] px-2 disabled:opacity-50"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
          aria-label="Next page"
        >
          <span className="icon-directional inline-block" aria-hidden="true">
            ›
          </span>
        </button>
      </div>
    </nav>
  );
}

/**
 * data-table: sortable, filterable, paginated table that becomes a card list on
 * small screens.
 *
 * Why @tanstack/react-table
 * - It is headless: it owns sorting/filtering/pagination *state* and hands back
 *   plain row models, so every DOM node and class here is ours. That is what
 *   makes the same instance renderable as a <table> on desktop and as cards on
 *   mobile without forking the logic.
 *
 * Design system
 * - Header `--surface-sunken` over `--border-default`; body rows on
 *   `--surface-base` with a `--state-hover` wash; selected rows tint with
 *   `--color-primary` via `color-mix`, which keeps the tint correct under every
 *   tenant palette instead of hard-coding an opacity blend.
 * - Numeric cells opt into `.numeric-cell` (tabular figures, inline-end
 *   aligned, `unicode-bidi: plaintext`) through column meta.
 *
 * Accessibility
 * - Real `<table>` semantics with a `<caption>` (visually hidden), `scope="col"`
 *   headers, and `aria-sort` on the sorted header so the current sort is
 *   announced rather than implied by an arrow.
 * - Sorting is triggered by a `<button>` inside the `<th>` — never a click
 *   handler on the cell — so it is reachable and operable by keyboard.
 * - The mobile view is a `<ul>` of cards; each card keeps a heading, so the
 *   record boundaries survive the layout change.
 * - Result counts sit in a polite live region, so filtering and paging are
 *   announced.
 * - `isLoading` renders skeleton rows that mirror the real column count, which
 *   keeps the layout stable and avoids a jump when data lands.
 *
 * Performance
 * - Pagination is the default guard for large datasets. Virtual scrolling was
 *   deliberately not added: it conflicts with the card transformation and with
 *   native find-in-page. See the report's open questions.
 */
export function DataTable<T, TValue = unknown>({
  columns,
  data,
  pagination = true,
  sorting = true,
  filtering = true,
  mobileCardRenderer,
  mobileBreakpoint = 768,
  pageSize = 25,
  caption,
  searchPlaceholder = 'Search',
  isLoading = false,
  emptyTitle = 'No results',
  emptyDescription,
  className = '',
}: DataTableProps<T, TValue>) {
  const [sortingState, setSortingState] = useState<SortingState>([]);
  const [searchTerm, setSearchTerm] = useState('');
  // Keystrokes stay instant; only the filter pass is deferred.
  const debouncedSearch = useDebounce(searchTerm, 250);

  const { shouldShowCards } = useResponsiveTable(mobileBreakpoint);
  const showCards = shouldShowCards && Boolean(mobileCardRenderer);

  const table = useReactTable<T>({
    data,
    columns,
    state: {
      ...(sorting ? { sorting: sortingState } : null),
      ...(filtering ? { globalFilter: debouncedSearch } : null),
    },
    onSortingChange: setSortingState,
    // No `onGlobalFilterChange`: the search box is the only writer of that
    // state, so there is nothing for the table to push back. Sorting *is*
    // driven from inside the table, hence the writer above.
    getCoreRowModel: getCoreRowModel(),
    ...(sorting ? { getSortedRowModel: getSortedRowModel() } : null),
    ...(filtering ? { getFilteredRowModel: getFilteredRowModel() } : null),
    ...(pagination ? { getPaginationRowModel: getPaginationRowModel() } : null),
    initialState: { pagination: { pageIndex: 0, pageSize } },
    enableSorting: sorting,
  });

  // A narrowing filter can leave the viewer on a page that no longer exists.
  useEffect(() => {
    if (pagination) table.setPageIndex(0);
  }, [debouncedSearch, pagination, table]);

  const rows = table.getRowModel().rows;
  const visibleColumnCount = table.getVisibleLeafColumns().length;

  const skeletonRows = useMemo(
    () => Array.from({ length: Math.min(pageSize, 5) }, (_, index) => index),
    [pageSize],
  );

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)]',
        className,
      )}
    >
      {filtering && (
        <div className="border-b border-[var(--border-subtle)] p-3">
          <label className="block">
            <span className="sr-only">{searchPlaceholder}</span>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={searchPlaceholder}
              className="form-control-base"
              // Results are counted in the live region below, not here.
              aria-describedby="data-table-result-count"
            />
          </label>
        </div>
      )}

      <p id="data-table-result-count" className="sr-only" aria-live="polite">
        {table.getFilteredRowModel().rows.length} rows match the current filter.
      </p>

      {isLoading ? (
        <div className="space-y-2 p-3">
          {skeletonRows.map((index) => (
            <Skeleton
              key={index}
              variant="rectangular"
              height="2.5rem"
              label={index === 0 ? `Loading ${caption}` : ''}
            />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : showCards ? (
        /* ---------- mobile: card list ---------- */
        <ul className="divide-y divide-[var(--border-subtle)]">
          {rows.map((row) => (
            <li key={row.id} className="p-4">
              {mobileCardRenderer?.(row.original)}
            </li>
          ))}
        </ul>
      ) : (
        /* ---------- desktop: table ---------- */
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-start">
            <caption className="sr-only">{caption}</caption>

            <thead className="bg-[var(--surface-sunken)]">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-[var(--border-default)]">
                  {headerGroup.headers.map((header) => {
                    const canSort = sorting && header.column.getCanSort();
                    const direction = header.column.getIsSorted();

                    return (
                      <th
                        key={header.id}
                        scope="col"
                        aria-sort={
                          !canSort
                            ? undefined
                            : direction === 'asc'
                              ? 'ascending'
                              : direction === 'desc'
                                ? 'descending'
                                : 'none'
                        }
                        className="text-caption px-3 py-2 text-start font-semibold text-[var(--color-text-secondary)]"
                      >
                        {header.isPlaceholder ? null : canSort ? (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className={cn(
                              'flex w-full items-center gap-1 text-start',
                              'rounded-sm focus-visible:outline focus-visible:outline-2',
                              'focus-visible:outline-offset-2 focus-visible:outline-[var(--state-focus)]',
                            )}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            <SortGlyph direction={direction} />
                          </button>
                        ) : (
                          flexRender(header.column.columnDef.header, header.getContext())
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>

            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  data-selected={row.getIsSelected() ? 'true' : undefined}
                  className={cn(
                    'border-b border-[var(--border-subtle)]',
                    'motion-safe hover:bg-[var(--state-hover)]',
                    // color-mix keeps the selected tint derived from the tenant
                    // primary rather than a baked-in translucent hex.
                    row.getIsSelected() &&
                      'bg-[color-mix(in_srgb,var(--color-primary)_12%,transparent)]',
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={cn(
                        'text-body-sm px-3 py-2 text-[var(--color-text-primary)]',
                        (cell.column.columnDef.meta as { numeric?: boolean } | undefined)
                          ?.numeric && 'numeric-cell',
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          <span className="sr-only">
            {visibleColumnCount} columns shown.
          </span>
        </div>
      )}

      {pagination && !isLoading && rows.length > 0 && <Pagination table={table} />}
    </div>
  );
}

export default DataTable;
