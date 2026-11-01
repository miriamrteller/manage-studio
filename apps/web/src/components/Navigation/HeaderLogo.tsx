import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { TenantConfig } from '@/types/auth';
import { deriveSoftTheme } from '@/lib/theme/deriveSoftTheme';
import { currentStudioDisplayName } from '@/lib/studioDisplayName';
import { analyzeLogo, chooseLogoTreatment, type HeaderSurface, type LogoTone } from '@/lib/theme/logoTone';

const LOGO_HEIGHT = 32;
const LOGO_MAX_WIDTH = 160;

/** Tone stored on the tenant, or measured in the browser when it isn't (null if unreadable). */
function useLogoTone(url: string | null | undefined, stored: LogoTone | null | undefined) {
  const { data } = useQuery({
    queryKey: ['logo-tone', url],
    queryFn: () => analyzeLogo(url as string),
    enabled: Boolean(url) && !stored,
    staleTime: Infinity,
  });
  return stored ?? data ?? null;
}

/** Colours the header logo sits on, for the tenant's chrome style. */
export function headerSurface(tenant: TenantConfig | null, soft: boolean): HeaderSurface {
  const primary = tenant?.white_label?.primary_color ?? '#76335a';
  const accent = tenant?.white_label?.accent_color ?? '#e99ac4';
  const t = deriveSoftTheme(primary, accent);
  return soft
    ? { backgrounds: [t['--tint-2'], t['--tint-accent-2']], recolour: t['--color-primary-ink'], pill: t['--color-primary-fill'] }
    : { backgrounds: [t['--color-primary-fill']], recolour: t['--color-on-primary-fill'], pill: '#ffffff' };
}

/**
 * Tenant logo in the header, kept visible on either header style
 * (photographer-theme-proposal.md 4.4): as uploaded, the other uploaded
 * logo, a logo with its own background, a recoloured one-colour logo, or
 * the logo on a pill.
 */
export function HeaderLogo({ tenant, soft }: { tenant: TenantConfig | null; soft: boolean }) {
  const logoTone = useLogoTone(tenant?.logo_url, tenant?.logo_tone);
  const logoDarkTone = useLogoTone(tenant?.logo_dark_url, tenant?.logo_dark_tone);
  const treatment = useMemo(
    () =>
      chooseLogoTreatment(
        { logoUrl: tenant?.logo_url, logoTone, logoDarkUrl: tenant?.logo_dark_url, logoDarkTone, autofix: tenant?.logo_autofix },
        headerSurface(tenant, soft),
      ),
    [tenant, soft, logoTone, logoDarkTone],
  );
  const name = currentStudioDisplayName(tenant);

  switch (treatment.kind) {
    case 'name':
      // dir="auto": a Latin name in a Hebrew page keeps its own direction, so a
      // long name is cut with an ellipsis at its end, not clipped at its start.
      return (
        <span dir="auto" className={`block min-w-0 truncate ${soft ? 'text-primary' : 'text-on-primary'}`}>
          {name}
        </span>
      );
    case 'recolour': {
      const width = Math.min(LOGO_MAX_WIDTH, Math.round(LOGO_HEIGHT * treatment.aspect));
      const mask = `url("${treatment.src}") center / contain no-repeat`;
      return (
        <span
          role="img"
          aria-label={name}
          className="inline-block shrink-0"
          style={{ width, height: LOGO_HEIGHT, backgroundColor: treatment.color, WebkitMask: mask, mask }}
        />
      );
    }
    case 'pill':
      return (
        <span className="inline-flex items-center rounded-full px-2.5 py-1" style={{ backgroundColor: treatment.background }}>
          <img src={treatment.src} alt={name} className="h-6 max-w-[150px] object-contain" />
        </span>
      );
    default:
      return (
        <img
          src={treatment.src}
          alt={name}
          className={`h-8 max-w-[160px] object-contain ${treatment.plate ? 'rounded-[var(--radius-sm)]' : ''}`}
        />
      );
  }
}
