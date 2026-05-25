import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared';
import { useFamilies } from '../hooks/useFamilies';
import { useNavigate } from 'react-router-dom';

/**
 * FamiliesList: Read-only registry of families.
 *
 * Families are created automatically during the enrolment intake flow (Step 1).
 * No direct creation or deletion is allowed here — that would produce orphan shells
 * or violate data-retention rules (SPEC §D, migration 039 — no DELETE grant).
 */
export const FamiliesList = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);

  const familiesData = useFamilies({ page });

  return (
    <div className="space-y-4 p-4">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">{t('pages.families.title')}</h1>
        <p className="text-gray-600">{t('pages.families.description')}</p>
      </div>

      {familiesData.isLoading && (
        <div className="py-4 text-center">{t('common.loading')}</div>
      )}

      {familiesData.error && (
        <div className="alert-error">
          {t('common.error')}: {familiesData.error.message}
        </div>
      )}

      {!familiesData.isLoading && familiesData.families.length === 0 && (
        <EmptyState
          title={t('pages.families.empty_title')}
          message={t('pages.families.empty_message')}
          actionLabel={t('pages.families.enrol_action')}
          onAction={() => navigate('/enrol')}
        />
      )}

      {familiesData.families.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b" style={{ borderColor: 'var(--color-border-default)' }}>
              <tr>
                <th className="px-4 py-3 text-start font-medium">
                  {t('form.family.name')}
                </th>
                <th className="px-4 py-3 text-start font-medium">
                  {t('form.family.contact_person_name')}
                </th>
                <th className="px-4 py-3 text-start font-medium">
                  {t('form.family.contact_email')}
                </th>
                <th className="px-4 py-3 text-start font-medium">
                  {t('form.family.contact_phone')}
                </th>
                <th className="px-4 py-3 text-center font-medium">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {familiesData.families.map((family) => (
                <tr
                  key={family.id}
                  className="border-b hover:bg-opacity-50"
                  style={{ borderColor: 'var(--color-border-default)' }}
                >
                  <td className="px-4 py-3">
                    {family.name ?? <span className="italic text-gray-400">{t('pages.families.unnamed')}</span>}
                  </td>
                  <td className="px-4 py-3">{family.contact_person_name ?? '—'}</td>
                  <td className="px-4 py-3">{family.contact_email ?? '—'}</td>
                  <td className="px-4 py-3">{family.contact_phone ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => navigate(`/admin/families/${family.id}`)}
                        title={t('common.view')}
                      >
                        {t('common.view')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {familiesData.total > familiesData.pageSize && (
        <div className="flex items-center justify-between pt-4">
          <Button
            variant="outline"
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
          >
            {t('common.previous')}
          </Button>
          <span className="text-sm">
            {t('common.page_n', { page })} —{' '}
            {t('common.showing_results', {
              count: Math.min(
                familiesData.pageSize,
                familiesData.total - (page - 1) * familiesData.pageSize
              ),
              total: familiesData.total,
            })}
          </span>
          <Button
            variant="outline"
            onClick={() => setPage(page + 1)}
            disabled={page * familiesData.pageSize >= familiesData.total}
          >
            {t('common.next')}
          </Button>
        </div>
      )}
    </div>
  );
};
