import { useTranslation } from 'react-i18next';
import type { UpcomingSessionOccurrence } from '@/features/enrolment/lib/upcomingSessions';

interface UpcomingSessionsSectionProps {
  sessions: UpcomingSessionOccurrence[];
  showPersonName: boolean;
}

export function UpcomingSessionsSection({ sessions, showPersonName }: UpcomingSessionsSectionProps) {
  const { t } = useTranslation();

  return (
    <section aria-labelledby="portal-upcoming-heading">
      <h3 id="portal-upcoming-heading" className="text-lg font-semibold text-gray-900 mb-4">
        {t('pages.portal.upcoming_heading')}
      </h3>

      {sessions.length === 0 ? (
        <p className="text-sm text-gray-500">{t('pages.portal.no_upcoming')}</p>
      ) : (
        <ul className="space-y-3">
          {sessions.map((session) => {
            const dateLabel = session.occursAt.toLocaleDateString();
            const timeLabel = session.occursAt.toLocaleTimeString(undefined, {
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <li
                key={session.engagementId}
                className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
              >
                <p className="font-medium text-gray-900">
                  {t('pages.portal.upcoming_on_date', {
                    date: dateLabel,
                    time: timeLabel,
                    className: session.className,
                  })}
                </p>
                {showPersonName && (
                  <p className="mt-1 text-sm text-gray-600">
                    {t('pages.portal.upcoming_for', { personName: session.personName })}
                  </p>
                )}
                {session.classLocation && (
                  <p className="mt-1 text-sm text-gray-500">{session.classLocation}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
