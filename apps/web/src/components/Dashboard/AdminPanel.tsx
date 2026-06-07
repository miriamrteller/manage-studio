import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAdminDashboard } from './useAdminDashboard';
import { useEntityLabels } from '@/hooks/useEntityLabels';

/**
 * AdminPanel: Smart component for admin dashboard
 * - Fetches admin data using useAdminDashboard hook
 * - Manages loading/error states
 * - Renders admin setup navigation cards
 * 
 * WCAG: Semantic structure, proper heading hierarchy, focus management
 */
export function AdminPanel() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isLoading, error } = useAdminDashboard();
  const { labels, modules } = useEntityLabels();

  if (isLoading) {
    return (
      <div role="status" aria-live="polite">
        {t('common.loading')}
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="bg-red-50 border border-red-200 rounded p-4 text-red-700">
        {t('errors.dashboard_load_failed')}
      </div>
    );
  }

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

      {/* Setup Navigation Cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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

        {/* Tax / VAT Card */}
        <div className="card border border-gray-200 hover:border-primary hover:shadow-md transition-all">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">
              {t('settings.tax.title')}
            </h3>
            <p className="text-sm text-gray-600">
              {t('settings.tax.description')}
            </p>
            <Button
              variant="primary"
              fullWidth
              onClick={() => navigate('/admin/setup/tax')}
              aria-label={t('settings.tax.title')}
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
              {t('pages.admin_classes.description')}
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
