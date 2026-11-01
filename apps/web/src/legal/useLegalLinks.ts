import { useTenant } from '@/hooks/useTenant';
import { resolveLegalLinks, type LegalLinks } from '@/lib/legalLinks';
import { tenantHasEnrolmentTerms, useTenantLegalProfile } from './useLegalDocument';

/** Legal links for the current site (studio's own URL → its published in-app page → platform on root). */
export function useLegalLinks(): LegalLinks & { isTenant: boolean } {
  const tenant = useTenant();
  const { data: legal } = useTenantLegalProfile();
  const links = resolveLegalLinks(
    tenant as Parameters<typeof resolveLegalLinks>[0],
    import.meta.env,
    tenant
      ? { published: !!legal?.published, hasTerms: legal ? tenantHasEnrolmentTerms(legal.vertical) : true }
      : null,
  );
  return { ...links, isTenant: !!tenant };
}
