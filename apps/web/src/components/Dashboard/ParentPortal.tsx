import { useTranslation } from 'react-i18next';
import { useParentPortal } from './useParentPortal';

/**
 * ParentPortal: Smart component for parent/guardian dashboard
 * - Fetches parent portal data using useParentPortal hook
 * - Manages loading/error states
 * - Renders parent-specific content
 * 
 * WCAG: Semantic structure, proper heading hierarchy
 */

export function ParentPortal() {
  const { t } = useTranslation();
  const { isLoading, error } = useParentPortal();

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
          {t('pages.portal_dashboard')}
        </h2>
        <p className="text-gray-600 mb-6">
          {t('pages.coming_soon_portal')}
        </p>
      </section>

      {/* Placeholder sections for Phase 1B features */}
      <section className="bg-blue-50 border border-blue-200 rounded p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Phase 1B: Coming Soon</h3>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>• Child enrolments</li>
          <li>• Attendance tracking</li>
          <li>• Upcoming classes</li>
          <li>• Payment history</li>
          <li>• Communication preferences</li>
        </ul>
      </section>
    </div>
  );
}
