import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/hooks/useTenant';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { supabase } from '@/lib/supabase';
import { tenantOrigin } from '@/lib/tenantUrl';
import { enterStudioAsSupport, isSupportLogin } from '@/lib/supportAccess';

/**
 * Shown on a studio's own address to the OpalSwift platform owner
 * (super_admin) before any studio page. Never a bounce to /login, which
 * looked like being signed out. Owner decisions (11 Nov 2026): it is a
 * confirm step (tick "Yes, I want to enter this studio's admin", with the
 * warning that it is all recorded), and entering lets the owner do
 * everything the studio's admin can, as the studio's OpalSwift support
 * login. Also offers to sign out so the studio's own admin can sign in on
 * this device.
 */
export function PlatformOwnerNotice() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const navigate = useNavigate();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canEnter = !!tenant?.id;

  const enter = async () => {
    if (!tenant?.id || !confirmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      await enterStudioAsSupport(tenant.id);
      // A fresh start as the support login: every cached query was the owner's.
      window.location.assign('/admin');
    } catch (err) {
      setError(
        err instanceof Error && err.message === 'two_step_required'
          ? t('auth.support_access_two_step')
          : t('auth.support_access_failed'),
      );
      setBusy(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full space-y-4 rounded-md border border-gray-200 bg-white p-6 text-center" role="status">
        <h1 className="text-lg font-semibold">{t('auth.platform_owner_title')}</h1>
        <p className="text-sm text-gray-700">{t('auth.platform_owner_body')}</p>
        {canEnter && (
          <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-start">
            <p className="text-sm text-amber-900" data-testid="support-access-warning">
              {t('auth.support_access_warning')}
            </p>
            <label className="flex items-start gap-2 text-sm font-medium">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span>{t('auth.support_access_confirm', { studio: tenant?.name ?? '' })}</span>
            </label>
            <Button type="button" className="w-full" disabled={!confirmed || busy} onClick={() => void enter()}>
              {busy ? t('common.loading') : t('auth.support_access_enter')}
            </Button>
            {error && (
              <p className="text-sm text-red-700" role="alert">
                {error}
              </p>
            )}
          </div>
        )}
        <button type="button" onClick={() => void signOut()} className="block w-full text-sm font-medium text-indigo-700 underline">
          {t('auth.platform_owner_sign_out')}
        </button>
        <a href={tenantOrigin('app')} className="inline-block text-sm font-medium text-indigo-700 underline">
          {t('auth.platform_owner_back')}
        </a>
      </div>
    </main>
  );
}

/**
 * Banner across the studio's admin while the platform owner is in it as the
 * studio's OpalSwift support login: says so, that everything is recorded, and
 * Leave signs that login out and goes back to app.opalswift.com.
 */
export function SupportAccessBanner() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const { user } = useCurrentUser();
  if (!isSupportLogin(user)) return null;
  const leave = async () => {
    await supabase.auth.signOut();
    window.location.assign(tenantOrigin('app'));
  };
  return (
    <div
      role="status"
      data-testid="support-access-banner"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-sm text-amber-950"
    >
      <span>{t('auth.support_access_banner', { studio: tenant?.name ?? '' })}</span>
      <button type="button" onClick={() => void leave()} className="font-medium underline">
        {t('auth.support_access_leave')}
      </button>
    </div>
  );
}

/** The platform owner on a studio address without a studio role there. */
export function isPlatformOwnerOnly(user: { role: string[] } | null | undefined): boolean {
  return !!user && user.role.includes('super_admin') && !user.role.includes('tenant_admin');
}
