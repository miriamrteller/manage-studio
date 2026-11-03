import { useTranslation } from 'react-i18next';
import { tenantOrigin } from '@/lib/tenantUrl';

/**
 * Shown on a studio's own address to the OpalSwift platform owner
 * (super_admin) instead of studio pages: those are for the studio's own
 * admins (owner decision; studio-granted support access is a later item).
 * Never a bounce to /login, which looked like being signed out.
 */
export function PlatformOwnerNotice() {
  const { t } = useTranslation();
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full space-y-4 rounded-md border border-gray-200 bg-white p-6 text-center" role="status">
        <h1 className="text-lg font-semibold">{t('auth.platform_owner_title')}</h1>
        <p className="text-sm text-gray-700">{t('auth.platform_owner_body')}</p>
        <a href={tenantOrigin('app')} className="inline-block text-sm font-medium text-indigo-700 underline">
          {t('auth.platform_owner_back')}
        </a>
      </div>
    </main>
  );
}

/** The platform owner on a studio address without a studio role there. */
export function isPlatformOwnerOnly(user: { role: string[] } | null | undefined): boolean {
  return !!user && user.role.includes('super_admin') && !user.role.includes('tenant_admin');
}
