import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAdminDashboard } from './useAdminDashboard';
import { useEntityLabels } from '@/hooks/useEntityLabels';
import { FinanceHealthCard } from '@/features/finance/components/FinanceHealthCard';
import { AdminOverviewSection } from '@/features/admin-dashboard/components/AdminOverviewSection';
import { useTenant } from '@/hooks/useTenant';
import { getBundledPaymentProviderSlug } from '@/lib/tenantProviderRouting';

/**
 * AdminPanel: Smart component for admin dashboard.
 * Mounts AdminOverviewSection (Phase 1F) above setup nav cards.
 * AdminOverviewSection owns its own loading/error/no-season states.
 */
export function AdminPanel() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { overview, isLoading, error, refetch } = useAdminDashboard();
  const { labels, modules } = useEntityLabels();
  const tenant = useTenant();
  const healthProvider = getBundledPaymentProviderSlug(tenant);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-2xl font-bold text-primary mb-4">
          {t('pages.admin.setup.title')}
        </h2>
        <p className="text-gray-600 mb-8">
          {t('pages.admin.setup.description')}
        </p>
      </section>

      {/* Phase 1F: Operations overview — today's classes, metrics, quick actions */}
      <AdminOverviewSection
        overview={overview}
        isLoading={isLoading}
        error={error}
        onRefresh={refetch}
      />

      {healthProvider && <FinanceHealthCard provider={healthProvider} />}

      {/* Setup Navigation Cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="card border border-gray-200 hover:border-primary hover:shadow-md transition-all">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">
              {t('finance.hub.setup_card')}
            </h3>
            <p className="text-sm text-gray-600">
              {t('finance.hub.setup_card_description')}
            </p>
            <Button
              variant="primary"
              fullWidth
              onClick={() => navigate('/admin/finance')}
              aria-label={t('finance.hub.setup_card')}
            >
              {t('common.manage')} →
            </Button>
          </div>
        </div>

        {/* School settings */}
        <div className="card border border-gray-200 hover:border-primary hover:shadow-md transition-all">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">
              {t('settings.hub.page_title')}
            </h3>
            <p className="text-sm text-gray-600">
              {t('settings.hub.page_description')}
            </p>
            <Button
              variant="primary"
              fullWidth
              onClick={() => navigate('/admin/setup/settings')}
              aria-label={t('settings.hub.page_title')}
            >
              {t('common.manage')} →
            </Button>
          </div>
        </div>

        {/* Waivers Card */}
        <div className="card border border-gray-200 hover:border-primary hover:shadow-md transition-all">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">
              {t('pages.waivers.title')}
            </h3>
            <p className="text-sm text-gray-600">
              {t('pages.waivers.description')}
            </p>
            <Button
              variant="primary"
              fullWidth
              onClick={() => navigate('/admin/setup/waivers')}
              aria-label={t('pages.waivers.title')}
            >
              {t('common.manage')} →
            </Button>
          </div>
        </div>

        {/* Billing Accounts Card */}
        <div className="card border border-gray-200 hover:border-primary hover:shadow-md transition-all">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">
              {t('pages.billing.title')}
            </h3>
            <p className="text-sm text-gray-600">
              {t('pages.billing.description')}
            </p>
            <Button
              variant="primary"
              fullWidth
              onClick={() => navigate('/admin/setup/billing')}
              aria-label={t('pages.billing.title')}
            >
              {t('common.manage')} →
            </Button>
          </div>
        </div>

        {/* Levels Card */}
        {modules.categories && (
          <div className="card border border-gray-200 hover:border-primary hover:shadow-md transition-all">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {labels.category.plural}
              </h3>
              <p className="text-sm text-gray-600">
                {t('pages.levels_terms.levels_description')}
              </p>
              <Button
                variant="primary"
                fullWidth
                onClick={() => navigate('/admin/setup/levels')}
                aria-label={labels.category.plural}
              >
                {t('common.manage')} →
              </Button>
            </div>
          </div>
        )}

        {/* Terms Card */}
        {modules.scheduling && (
          <div className="card border border-gray-200 hover:border-primary hover:shadow-md transition-all">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {labels.season.plural}
              </h3>
              <p className="text-sm text-gray-600">
                {t('pages.levels_terms.terms_description')}
              </p>
              <Button
                variant="primary"
                fullWidth
                onClick={() => navigate('/admin/setup/terms')}
                aria-label={labels.season.plural}
              >
                {t('common.manage')} →
              </Button>
            </div>
          </div>
        )}

        {/* Classes Card */}
        <div className="card border border-gray-200 hover:border-primary hover:shadow-md transition-all">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">
              {`${t('common.manage')} ${labels.offering.plural}`}
            </h3>
            <p className="text-sm text-gray-600">
              {t('pages.admin_classes.description', { entity: labels.offering.plural })}
            </p>
            <Button
              variant="primary"
              fullWidth
              onClick={() => navigate('/admin/setup/classes')}
              aria-label={t('pages.admin_classes.title')}
            >
              {t('common.manage')} →
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
