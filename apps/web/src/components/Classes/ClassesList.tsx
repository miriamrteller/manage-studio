import { useTranslation } from 'react-i18next';
import { useClasses } from '@/features/classes/hooks';
import { useTenant } from '@/hooks/useTenant';
import { ClassCard, EmptyState } from '@/components/shared';
import type { PublicClass } from '@/schemas';

/**
 * ClassesList: Smart component for public classes listing
 * - Fetches tenant config to apply branding (currency, etc.)
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
    <section>
      {/* Always render a single <h1> for page hierarchy, even in empty state */}
      <h1 className="text-2xl font-bold mb-6">{t('pages.classes.title')}</h1>

      {/* Loading state */}
      {isLoading && (
        <div role="status" aria-live="polite" className="p-4">
          {t('common.loading')}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div role="alert" className="p-4 text-red-500">
          {t('errors.failed_to_load_classes')}
        </div>
      )}

      {/* Empty state: accessible, positive message with action */}
      {!error && !isLoading && !classes.length && (
        <EmptyState
          title={t('pages.classes.no_classes_title')}
          message={t('pages.classes.no_classes_message')}
          actionLabel={t('pages.classes.contact_support')}
          onAction={() => window.open('mailto:support@creativeballetacademy.com')}
        />
      )}

      {/* Success state: render classes list */}
      {!error && !isLoading && classes.length > 0 && (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {classes.map((classItem) => (
            <li key={classItem.id}>
              <ClassCard class={classItem as unknown as PublicClass} currency={tenant?.currency || 'ILS'} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
