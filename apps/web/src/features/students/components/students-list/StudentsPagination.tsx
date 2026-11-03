import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

/** Previous / next pager under the Students table. */
export function StudentsPagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex justify-between items-center pt-2">
      <Button
        variant="outline"
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page === 1}
      >
        {t('common.previous')}
      </Button>
      <span className="text-sm text-gray-600">
        {t('common.page_n', { page })} — {t('common.showing_results', {
          count: Math.min(pageSize, total - (page - 1) * pageSize),
          total,
        })}
      </span>
      <Button
        variant="outline"
        onClick={() => onPageChange(page + 1)}
        disabled={page * pageSize >= total}
      >
        {t('common.next')}
      </Button>
    </div>
  );
}
