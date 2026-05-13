import { useTranslation } from 'react-i18next';
import { useClasses } from './useClasses';
import { useTenant } from '../../hooks/useTenant';
import { ClassCard } from './ClassCard';

/**
 * ClassesList: Smart component for public classes listing
 * - Fetches classes using useClasses hook
 * - Manages loading/error/empty states
 * - Delegates card rendering to ClassCard (presentational)
 * 
 * WCAG:
 * - Semantic list structure (role="list")
 * - Loading state with role="status"
 * - Error state with role="alert"
 * - Empty state messaging
 */

export function ClassesList() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const { classes, isLoading, error } = useClasses();

  return (
    <div className="max-w-4xl mx-auto px-4 py-16">
      {/* Hero */}
      <div className="mb-12">
        <h1 className="text-4xl font-bold text-primary mb-4">
          {t('pages.classes.title')}
        </h1>
        <p className="text-lg text-gray-600">
          {t('pages.classes.subtitle')}
        </p>
      </div>

      {/* Classes List */}
      {isLoading ? (
        <div
          className="text-center py-8"
          role="status"
          aria-live="polite"
          aria-label={t('common.loading')}
        >
          <p>{t('common.loading')}</p>
        </div>
      ) : error ? (
        <div
          className="bg-red-50 border border-red-200 rounded p-4 text-red-700"
          role="alert"
          aria-live="assertive"
        >
          {t('error.fetch_classes')}
        </div>
      ) : classes.length === 0 ? (
        <div className="text-center py-8 text-gray-600" role="status">
          {t('pages.classes.no_classes')}
        </div>
      ) : (
        <div className="space-y-4" role="list">
          {classes.map((cls) => (
            <div key={cls.id} role="listitem">
              <ClassCard
                class={cls}
                locale={tenant?.locale || 'he-IL'}
                currency={tenant?.currency || 'ILS'}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
