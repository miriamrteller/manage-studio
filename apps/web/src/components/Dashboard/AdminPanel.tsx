import { useTranslation } from 'react-i18next';
import { useAdminDashboard } from './useAdminDashboard';

/**
 * AdminPanel: Smart component for admin dashboard
 * - Fetches admin data using useAdminDashboard hook
 * - Manages loading/error states
 * - Renders admin-specific content
 * 
 * WCAG: Semantic structure, proper heading hierarchy
 */

export function AdminPanel() {
  const { t } = useTranslation();
  const { isLoading, error } = useAdminDashboard();

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
        {t('error.dashboard_load_failed')}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-2xl font-bold text-primary mb-4">
          {t('pages.admin_dashboard')}
        </h2>
        <p className="text-gray-600 mb-6">
          {t('pages.coming_soon_admin')}
        </p>
      </section>

      {/* Placeholder sections for Phase 1B features */}
      <section className="bg-blue-50 border border-blue-200 rounded p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Phase 1B: Coming Soon</h3>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>• Class management</li>
          <li>• Enrolment overview</li>
          <li>• Payment tracking</li>
          <li>• Teacher payroll</li>
          <li>• Analytics and reports</li>
        </ul>
      </section>
    </div>
  );
}
