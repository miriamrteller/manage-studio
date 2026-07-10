import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FEATURES } from '@shared/index';
import { useClasses } from '@/features/classes/hooks';
import { useTenant } from '@/hooks/useTenant';
import { useEntityLabels } from '@/hooks/useEntityLabels';
import { ClassCard, EmptyState } from '@/components/shared';
import { PublicScheduleCalendar } from '@/features/scheduling/components/PublicScheduleCalendar';
import { cn } from '@/lib/utils';
import type { PublicOffering } from '@/schemas';

type ClassesView = 'calendar' | 'list';

/**
 * ClassesList: Smart component for public classes listing
 * - Fetches tenant config to apply branding (currency, etc.)
 * - Fetches classes using useClasses hook
 * - Manages loading/error/empty states
 * - Delegates card rendering to ClassCard (presentational)
 *
 * When the tenant has the scheduling calendar feature enabled, a calendar view
 * is shown by default (the primary way clients browse the timetable), with a
 * toggle to the card/list view. Without the feature, only the list is shown.
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
  const { labels } = useEntityLabels();
  const { classes, isLoading, error } = useClasses();

  const calendarEnabled = tenant?.enabled_features?.includes(FEATURES.scheduling.calendarView) ?? false;
  const [view, setView] = useState<ClassesView>('calendar');
  const activeView: ClassesView = calendarEnabled ? view : 'list';

  const offerings = useMemo(() => (classes as PublicOffering[]) ?? [], [classes]);

  return (
    <section>
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        {/* Always render a single <h1> for page hierarchy, even in empty state */}
        <h1 className="text-2xl font-bold">{labels.offering.plural}</h1>

        {calendarEnabled && (
          <div
            role="group"
            aria-label={t('pages.classes.view_toggle_label')}
            className="inline-flex rounded-lg border border-gray-300 overflow-hidden"
          >
            <ViewToggleButton
              active={activeView === 'calendar'}
              onClick={() => setView('calendar')}
            >
              {t('pages.classes.view_calendar')}
            </ViewToggleButton>
            <ViewToggleButton active={activeView === 'list'} onClick={() => setView('list')}>
              {t('pages.classes.view_list')}
            </ViewToggleButton>
          </div>
        )}
      </div>

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

      {/* Calendar view: client-facing timetable with details popover */}
      {!error && !isLoading && activeView === 'calendar' && (
        <PublicScheduleCalendar offerings={offerings} />
      )}

      {/* Empty state: accessible, positive message with action */}
      {!error && !isLoading && activeView === 'list' && !offerings.length && (
        <EmptyState
          title={t('pages.classes.no_classes_title', { entity: labels.offering.plural })}
          message={t('pages.classes.no_classes_message', { entity: labels.offering.plural.toLowerCase() })}
          actionLabel={t('pages.classes.contact_support')}
          onAction={() => window.open('mailto:support@creativeballetacademy.com')}
        />
      )}

      {/* List view: render classes as cards */}
      {!error && !isLoading && activeView === 'list' && offerings.length > 0 && (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {offerings.map((classItem) => (
            <li key={classItem.id}>
              <ClassCard class={classItem} currency={tenant?.currency || 'ILS'} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ViewToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'px-4 py-2 text-sm font-medium transition-colors',
        active ? 'bg-primary text-white' : 'bg-white text-gray-700 hover:bg-gray-50',
      )}
    >
      {children}
    </button>
  );
}
