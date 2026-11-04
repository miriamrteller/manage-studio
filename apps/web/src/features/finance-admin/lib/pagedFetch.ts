/**
 * Fetch every row of a paged query, page by page. The API returns at most 1,000 rows per
 * request, so exports page through instead of asking for one big page (no row cap).
 */
export const EXPORT_PAGE_SIZE = 1000;

export async function fetchAllPages<T>(
  fetchPage: (page: number, pageSize: number) => Promise<{ rows: T[]; totalCount: number }>,
  options: { pageSize?: number; onProgress?: (fetched: number, total: number) => void } = {},
): Promise<T[]> {
  const pageSize = options.pageSize ?? EXPORT_PAGE_SIZE;
  const all: T[] = [];
  for (let page = 1; ; page += 1) {
    const { rows, totalCount } = await fetchPage(page, pageSize);
    all.push(...rows);
    options.onProgress?.(all.length, totalCount);
    if (rows.length < pageSize || all.length >= totalCount) return all;
  }
}
