import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import type { ChromeStyle } from '@/types/auth';
import { analyzeLogo, chooseLogoTreatment, type LogoTone } from '@/lib/theme/logoTone';
import { HeaderLogo, headerSurface } from '@/components/Navigation/HeaderLogo';

type TenantPatch = {
  chrome_style?: ChromeStyle;
  logo_autofix?: boolean;
  logo_tone?: LogoTone | null;
  logo_dark_tone?: LogoTone | null;
};

/**
 * Header & footer style (Soft / Solid) and the logo contrast note
 * (photographer-theme-proposal.md, T13 + T14). Also measures existing logos
 * once if they were uploaded before logo tones were stored.
 */
export function ChromeStyleSettings() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  const save = async (patch: TenantPatch, quiet = false) => {
    if (!tenant) return;
    const { error } = await supabase.from('tenants').update(patch).eq('id', tenant.id);
    if (!quiet) setStatus(error ? 'error' : 'saved');
    if (!error) queryClient.invalidateQueries({ queryKey: ['tenant'] });
  };

  // One-off backfill: logos uploaded before tones were measured.
  useEffect(() => {
    if (!tenant) return;
    let cancelled = false;
    (async () => {
      const patch: TenantPatch = {};
      if (tenant.logo_url && !tenant.logo_tone) patch.logo_tone = await analyzeLogo(tenant.logo_url);
      if (tenant.logo_dark_url && !tenant.logo_dark_tone) patch.logo_dark_tone = await analyzeLogo(tenant.logo_dark_url);
      const measured = Object.fromEntries(Object.entries(patch).filter(([, v]) => v));
      if (!cancelled && Object.keys(measured).length > 0) await save(measured, true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per logo change
  }, [tenant?.id, tenant?.logo_url, tenant?.logo_dark_url]);

  const style: ChromeStyle = tenant?.chrome_style ?? 'soft';
  const note = useMemo(() => {
    if (!tenant || tenant.logo_autofix === false) return null;
    const tr = chooseLogoTreatment(
      { logoUrl: tenant.logo_url, logoTone: tenant.logo_tone, logoDarkUrl: tenant.logo_dark_url, logoDarkTone: tenant.logo_dark_tone },
      headerSurface(tenant, style === 'soft'),
    );
    if (tr.kind === 'recolour') return 'logo_fixed_recolour';
    if (tr.kind === 'pill') return 'logo_fixed_pill';
    if (tr.kind === 'image' && tr.plate) return 'logo_fixed_plate';
    if (tr.kind === 'image' && tr.src !== tenant.logo_url) return 'logo_fixed_other';
    return null;
  }, [tenant, style]);

  if (!tenant) return null;

  const option = (value: ChromeStyle) => (
    <label key={value} className="flex-1 min-w-[220px] cursor-pointer rounded-surface border border-[var(--border-card)] p-3 has-[:checked]:ring-2 has-[:checked]:ring-primary">
      <span className="flex items-center gap-2 font-medium">
        <input type="radio" name="chrome_style" value={value} checked={style === value} onChange={() => save({ chrome_style: value })} />
        {t(`settings.chrome.${value}`)}
      </span>
      <span
        aria-hidden="true"
        className={`mt-3 flex h-12 items-center rounded-control px-3 ${value === 'soft' ? 'app-header-soft' : 'bg-primary text-on-primary'}`}
      >
        <HeaderLogo tenant={tenant} soft={value === 'soft'} />
      </span>
    </label>
  );

  return (
    <section className="pt-6 border-t border-[var(--border-subtle)]" aria-labelledby="chrome-style-title">
      <h2 id="chrome-style-title" className="text-lg font-semibold text-[var(--color-text-primary)] mb-1">
        {t('settings.chrome.title')}
      </h2>
      <p className="text-sm text-[var(--color-text-secondary)] mb-4">{t('settings.chrome.intro')}</p>
      <fieldset className="flex flex-wrap gap-3">
        <legend className="sr-only">{t('settings.chrome.title')}</legend>
        {option('soft')}
        {option('solid')}
      </fieldset>
      {note && <p className="mt-3 text-sm text-[var(--color-text-secondary)]">{t(`settings.chrome.${note}`)}</p>}
      {(tenant.logo_url || tenant.logo_dark_url) && (
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={tenant.logo_autofix === false} onChange={(e) => save({ logo_autofix: !e.target.checked })} />
          {t('settings.chrome.autofix_off')}
        </label>
      )}
      <p role="status" aria-live="polite" className="mt-2 text-sm">
        {status === 'saved' && <span className="text-[var(--color-success)]">{t('settings.chrome.saved')}</span>}
        {status === 'error' && <span className="text-[var(--color-error)]">{t('settings.chrome.save_failed')}</span>}
      </p>
    </section>
  );
}
