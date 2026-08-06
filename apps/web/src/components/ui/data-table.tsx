import { useState, useEffect } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type PaginationState,
} from '@tanstack/react-table';
import { Skeleton } from '@/components/ui/skeleton';

interface DataTableProps<TData> {
  columns: ColumnDef<TData>[];
  data: TData[];
  isLoading?: boolean;
  pagination?: boolean;
  sorting?: boolean;
  filtering?: boolean;
}

export function DataTable<TData>({
  columns,
  data,
  isLoading = false,
  pagination = true,
  sorting = true,
  filtering = true,
}: DataTableProps<TData>) {
  const [sortingState, setSortingState] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [paginationState, setPaginationState] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const [globalFilter, setGlobalFilter] = useState('');
  const [debouncedFilter, setDebouncedFilter] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFilter(globalFilter);
    }, 300);

    return () => clearTimeout(timer);
  }, [globalFilter]);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting: sortingState,
      columnFilters,
      pagination: paginationState,
      globalFilter: debouncedFilter,
    },
    onSortingChange: setSortingState,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPaginationState,
    onGlobalFilterChange: setDebouncedFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: sorting ? getSortedRowModel() : undefined,
    getFilteredRowModel: filtering ? getFilteredRowModel() : undefined,
    getPaginationRowModel: pagination ? getPaginationRowModel() : undefined,
    enableSorting: sorting,
    enableFilters: filtering,
  });

  const getAriaSortValue = (
    columnId: string
  ): 'ascending' | 'descending' | 'none' => {
    const sortedColumn = sortingState.find((s) => s.id === columnId);
    if (!sortedColumn) return 'none';
    return sortedColumn.desc ? 'descending' : 'ascending';
  };

  const pageCount = table.getPageCount();
  const currentPage = paginationState.pageIndex + 1;

  return (
    <div style={{ width: '100%' }}>
      {filtering && (
        <div style={{ marginBottom: '16px' }}>
          <input
            type="text"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Search..."
            style={{
              width: '100%',
              maxWidth: '300px',
              padding: '8px 12px',
              fontSize: '14px',
              border: '1px solid var(--border-default)',
              borderRadius: '6px',
              backgroundColor: 'var(--surface-overlay)',
              color: 'var(--color-text-primary)',
              outline: 'none',
            }}
          />
        </div>
      )}

      <div
        style={{
          border: '1px solid var(--border-default)',
          borderRadius: '8px',
          overflow: 'hidden',
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '14px',
          }}
        >
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr
                key={headerGroup.id}
                style={{
                  borderBottom: '1px solid var(--border-default)',
                  backgroundColor: 'var(--surface-overlay)',
                }}
              >
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const ariaSortValue = sorting
                    ? getAriaSortValue(header.column.id)
                    : undefined;

                  return (
                    <th
                      key={header.id}
                      aria-sort={ariaSortValue}
                      onClick={
                        canSort && sorting
                          ? header.column.getToggleSortingHandler()
                          : undefined
                      }
                      style={{
                        padding: '12px 16px',
                        textAlign: 'left',
                        fontWeight: 600,
                        color: 'var(--color-text-primary)',
                        cursor: canSort && sorting ? 'pointer' : 'default',
                        userSelect: canSort && sorting ? 'none' : 'auto',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                        }}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                        {sorting && canSort && (
                          <span style={{ color: 'var(--color-text-secondary)' }}>
                            {ariaSortValue === 'ascending' && '↑'}
                            {ariaSortValue === 'descending' && '↓'}
                            {ariaSortValue === 'none' && '↕'}
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, rowIndex) => (
                <tr
                  key={`skeleton-${rowIndex}`}
                  style={{
                    borderBottom: '1px solid var(--border-default)',
                  }}
                >
                  {columns.map((_, colIndex) => (
                    <td
                      key={`skeleton-${rowIndex}-${colIndex}`}
                      style={{
                        padding: '12px 16px',
                      }}
                    >
                      <Skeleton
                        style={{
                          height: '20px',
                          width: '100%',
                          borderRadius: '4px',
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  style={{
                    padding: '24px 16px',
                    textAlign: 'center',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  No data available
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  style={{
                    borderBottom: '1px solid var(--border-default)',
                    transition: 'background-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--state-hover)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      style={{
                        padding: '12px 16px',
                        color: 'var(--color-text-primary)',
                      }}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination && !isLoading && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '16px',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span
              style={{
                fontSize: '14px',
                color: 'var(--color-text-secondary)',
              }}
            >
              Rows per page:
            </span>
            <select
              value={paginationState.pageSize}
              onChange={(e) => {
                table.setPageSize(Number(e.target.value));
              }}
              style={{
                padding: '6px 8px',
                fontSize: '14px',
                border: '1px solid var(--border-default)',
                borderRadius: '4px',
                backgroundColor: 'var(--surface-overlay)',
                color: 'var(--color-text-primary)',
                cursor: 'pointer',
              }}
            >
              {[10, 25, 50].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <span
              style={{
                fontSize: '14px',
                color: 'var(--color-text-secondary)',
              }}
            >
              Page {currentPage} of {pageCount || 1}
            </span>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                style={{
                  padding: '6px 12px',
                  fontSize: '14px',
                  border: '1px solid var(--border-default)',
                  borderRadius: '4px',
                  backgroundColor: 'var(--surface-overlay)',
                  color: table.getCanPreviousPage()
                    ? 'var(--color-text-primary)'
                    : 'var(--color-text-secondary)',
                  cursor: table.getCanPreviousPage()
                    ? 'pointer'
                    : 'not-allowed',
                  opacity: table.getCanPreviousPage() ? 1 : 0.5,
                }}
              >
                Prev
              </button>
              <button
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                style={{
                  padding: '6px 12px',
                  fontSize: '14px',
                  border: '1px solid var(--border-default)',
                  borderRadius: '4px',
                  backgroundColor: 'var(--surface-overlay)',
                  color: table.getCanNextPage()
                    ? 'var(--color-text-primary)'
                    : 'var(--color-text-secondary)',
                  cursor: table.getCanNextPage() ? 'pointer' : 'not-allowed',
                  opacity: table.getCanNextPage() ? 1 : 0.5,
                }}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
