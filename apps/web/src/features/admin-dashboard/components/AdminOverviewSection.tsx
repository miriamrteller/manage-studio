import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { OverviewStatsGrid } from './OverviewStatsGrid';
import { QuickActionsRow } from './QuickActionsRow';
import { TodaysClassesTable } from './TodaysClassesTable';
import { NoActiveSeasonError } from '../services/adminDashboardService';
import type { AdminDashboardOverview } from '../types';

interface AdminOverviewSectionProps {
  overview: AdminDashboardOverview | undefined;
  isLoading: boolean;
  error: Error | null;
  onRefresh: () => void;
  className?: string;
}

export const AdminOverviewSection = ({
  overview,
  isLoading,
  error,
  onRefresh,
  className = '',
}: AdminOverviewSectionProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // No active season — distinct UI state, not a generic error
  if (error instanceof NoActiveSeasonError) {
    return (
      <div className={`space-y-4 ${className}`}>
        <h2 className="text-xl font-bold text-primary">
          {t('pages.admin.overview.title')}
        </h2>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-blue-800">
            {t('pages.admin.overview.no_active_season')}
          </p>
          <Button
            variant="primary"
            className="mt-3"
            onClick={() => navigate('/admin/setup/terms')}
          >
            {t('pages.admin.overview.go_to_seasons')}
          </Button>
        </div>
      </div>
    );
  }

  // Other errors — show with retry
  if (error) {
    return (
      <div className={`space-y-4 ${className}`}>
        <h2 className="text-xl font-bold text-primary">
          {t('pages.admin.overview.title')}
        </h2>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="mb-3 text-red-800">{t('errors.dashboard_load_failed')}</p>
          <Button variant="primary" onClick={onRefresh}>
            {t('common.try_again')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      <h2 className="text-xl font-bold text-primary">
        {t('pages.admin.overview.title')}
      </h2>

      {/* Stat cards */}
      <OverviewStatsGrid
        termEnrolments={overview?.term_enrolments_count ?? 0}
        outstandingPayments={overview?.pending_payment_count ?? 0}
        adminReviewCount={overview?.admin_review_count ?? 0}
        revenueMTD={overview?.finance?.net_revenue_minor ?? 0}
        isLoading={isLoading}
      />

      {/* Quick actions */}
      {!isLoading && <QuickActionsRow />}

      {/* Today's classes */}
      <section>
        <h3 className="mb-3 text-base font-semibold text-gray-900">
          {t('pages.admin.overview.todays_classes')}
        </h3>
        <TodaysClassesTable
          classes={overview?.today_classes ?? []}
          isLoading={isLoading}
          onClassClick={(classId) => navigate(`/admin/students?class=${classId}`)}
        />
      </section>
    </div>
  );
};
