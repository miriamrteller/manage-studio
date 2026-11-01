import type { TenantConfig } from '@/types/auth';
import { resolveTenantSite, type TenantSite } from './resolveTenantSubdomain';

/** Host labels that name infrastructure, not the studio (app.example.com, www.example.com). */
const NON_STUDIO_LABELS = new Set(['www', 'app']);

/** "creativeballet" → "Creativeballet"; "creative-ballet" → "Creative ballet". */
export function readableSubdomain(label: string): string {
  const words = label.trim().toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : '';
}

/** The label of a custom host that names the studio: the first one that isn't www/app. */
function studioLabelFromHost(host: string): string {
  const labels = host.split('.').filter(Boolean);
  const meaningful = labels.slice(0, -1).find((l) => !NON_STUDIO_LABELS.has(l));
  return meaningful ?? labels[0] ?? '';
}

/**
 * Studio name for the header and footer. Uses the tenant's name when it has one,
 * otherwise the subdomain (from the tenant row, else from the URL), made readable.
 * Never a vertical-specific word like "Ballet School". Empty only when the host
 * names no studio at all (e.g. a bare IP in dev).
 */
export function studioDisplayName(
  tenant: Pick<TenantConfig, 'name' | 'subdomain'> | null | undefined,
  site: TenantSite | null,
): string {
  const name = tenant?.name?.trim();
  if (name) return name;
  const subdomain = tenant?.subdomain?.trim();
  if (subdomain) return readableSubdomain(subdomain);
  if (site?.kind === 'subdomain') return readableSubdomain(site.subdomain);
  if (site?.kind === 'custom') return readableSubdomain(studioLabelFromHost(site.host));
  return '';
}

/** studioDisplayName for the current page's host. */
export function currentStudioDisplayName(
  tenant: Pick<TenantConfig, 'name' | 'subdomain'> | null | undefined,
): string {
  return studioDisplayName(tenant, resolveTenantSite());
}
