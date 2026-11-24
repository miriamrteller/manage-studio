import { useWorkModes } from '@/hooks/useWorkModes';
import { useTranslation } from 'react-i18next';
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAdminDashboard } from './useAdminDashboard';
import { FinanceHealthCard } from '@/features/finance/components/FinanceHealthCard';
import { AdminOverviewSection } from '@/features/admin-dashboard/components/AdminOverviewSection';
import { NeedsYouList } from '@/features/admin-dashboard/components/NeedsYouList';
import { useTenant } from '@/hooks/useTenant';
import { getBundledPaymentProviderSlug } from '@/lib/tenantProviderRouting';
import { CashToConfirmNotice } from '@/features/finance-admin/components/CashToConfirm';
import { CelebrationBanner, SetupGuideCard, useCelebrations, useSetupGuide } from '@/features/setup-guide';

/**
 * AdminPanel: Smart component for admin dashboard.
 * "Needs you" list first, then (class studios) the classes overview. No setup cards:
 * every page they linked to is in the menu (owner, 24 Nov 2026).
 * AdminOverviewSection owns its own loading/error/no-season states.
 */
export function AdminPanel() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { overview, isLoading, error, refetch } = useAdminDashboard();
  const { classes: teachesClasses } = useWorkModes();
  const tenant = useTenant();
  const healthProvider = getBundledPaymentProviderSlug(tenant);

  // "Finish setup" checklist: shown until every row is done or skipped, or the owner
  // closes it. The menu's "Setup guide" (?guide=open) brings it back.
  const guide = useSetupGuide();
  const [searchParams, setSearchParams] = useSearchParams();
  const forced = searchParams.get('guide') === 'open';
  const { reopen } = guide;
  useEffect(() => {
    if (!forced) return;
    reopen();
    setSearchParams({}, { replace: true });
  }, [forced, reopen, setSearchParams]);
  const showGuide = guide.visible;
  // Setup finished, first enquiry, first paid client: celebrated once per studio.
  const celebrations = useCelebrations({
    ready: !guide.isLoading,
    setupComplete: guide.progress.complete,
    leads: guide.facts.leads,
    paidClients: guide.facts.paidClients,
  });

  return (
    <div className="space-y-8">
      {celebrations.active && (
        <CelebrationBanner moment={celebrations.active} fewer={celebrations.fewer} onDismiss={celebrations.dismiss} />
      )}
      {teachesClasses && <CashToConfirmNotice onOpen={() => navigate('/admin/finance/payments')} />}
      {showGuide ? (
        guide.isLoading ? (
          <p role="status" className="text-gray-600">{t('common.loading')}</p>
        ) : (
          <SetupGuideCard guide={guide} fewer={celebrations.fewer} onFewerChange={celebrations.setFewer} />
        )
      ) : (
        <>
          {/* What is waiting today (owner, 24 Nov 2026), instead of the old setup cards: */}
          {/* every page they linked to is in the menu. */}
          <NeedsYouList
            enrolments={
              teachesClasses && overview
                ? { awaitingPayment: overview.pending_payment_count ?? 0, toReview: overview.admin_review_count ?? 0 }
                : undefined
            }
          />

          {/* Phase 1F: Operations overview — today's classes, metrics, quick actions */}
          <AdminOverviewSection
            overview={overview}
            isLoading={isLoading}
            error={error}
            onRefresh={refetch}
          />
        </>
      )}

      {healthProvider && <FinanceHealthCard provider={healthProvider} />}
    </div>
  );
}
