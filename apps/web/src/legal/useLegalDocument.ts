import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import { safeVertical, type VerticalId } from '@shared/config/tenant-presets';
import type { LegalDocId } from './fields';
import { prepareLegalMarkdown, type LegalLang, type PreparedLegalDoc } from './render';
import { loadLegalTemplate } from './templates';

/** Documents that belong to OpalSwift itself, not to a studio. */
export const PLATFORM_DOCS: LegalDocId[] = ['platform-terms', 'dpa', 'opalswift-privacy'];
/** Studio documents that must be reviewed and published before they go live. */
export const PUBLISHABLE_DOCS: LegalDocId[] = ['studio-privacy', 'enrolment-terms'];

export const ALL_LEGAL_DOCS: LegalDocId[] = [
  'studio-privacy',
  'enrolment-terms',
  'accessibility',
  'cookies',
  'platform-terms',
  'dpa',
  'opalswift-privacy',
];

export function isLegalDocId(value: string | undefined): value is LegalDocId {
  return !!value && (ALL_LEGAL_DOCS as string[]).includes(value);
}

/** Photographers sign a per-job contract instead of general enrolment terms. */
export function tenantHasEnrolmentTerms(vertical: VerticalId): boolean {
  return vertical !== 'photographer';
}

export interface TenantLegalProfile {
  tenantId: string;
  name: string;
  contactEmail: string;
  vertical: VerticalId;
  profile: Record<string, string>;
  published: boolean;
  updatedAt: string | null;
}

function toStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v;
    else if (typeof v === 'number') out[k] = String(v);
  }
  return out;
}

export function useTenantLegalProfile(): { data: TenantLegalProfile | null; isLoading: boolean } {
  const tenant = useTenant();
  const { data, isLoading } = useQuery({
    queryKey: ['tenant-legal-profile', tenant?.id],
    enabled: !!tenant?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<TenantLegalProfile | null> => {
      const { data: rows, error } = await supabase.rpc('get_tenant_legal_profile', { p_tenant_id: tenant!.id });
      if (error) throw error;
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row) return null;
      return {
        tenantId: row.tenant_id,
        name: row.name,
        contactEmail: row.contact_email,
        vertical: safeVertical(row.skin),
        profile: toStringRecord(row.legal_profile),
        published: row.legal_pages_published === true,
        updatedAt: row.legal_profile_updated_at ?? null,
      };
    },
  });
  return { data: data ?? null, isLoading: !!tenant?.id && isLoading };
}

export function useLegalLang(): LegalLang {
  const { i18n } = useTranslation();
  return (i18n.language ?? 'he').startsWith('en') ? 'en' : 'he';
}

/**
 * A legal document as this visitor should see it: studio documents filled
 * with the studio's details, OpalSwift documents as written.
 */
export function useLegalDocument(doc: LegalDocId | null, langOverride?: LegalLang) {
  const tenant = useTenant();
  const { data: legal, isLoading: profileLoading } = useTenantLegalProfile();
  const uiLang = useLegalLang();
  const lang = langOverride ?? uiLang;
  const platformDoc = doc ? PLATFORM_DOCS.includes(doc) : false;
  const needsProfile = !!tenant && !platformDoc;

  const query = useQuery({
    queryKey: ['legal-doc', doc, lang, platformDoc ? 'platform' : legal?.tenantId, legal?.updatedAt],
    enabled: !!doc && (!needsProfile || !!legal),
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<PreparedLegalDoc> => {
      const raw = await loadLegalTemplate(doc!, lang);
      return prepareLegalMarkdown(raw, {
        doc: doc!,
        lang,
        vertical: platformDoc || !legal ? 'generic' : legal.vertical,
        tenantName: platformDoc || !legal ? 'OpalSwift' : legal.name,
        contactEmail: platformDoc || !legal ? '' : legal.contactEmail,
        profile: platformDoc || !legal ? {} : legal.profile,
        updatedAt: platformDoc || !legal ? null : legal.updatedAt,
      });
    },
  });

  return {
    doc: query.data ?? null,
    lang,
    legal,
    isLoading: (needsProfile && profileLoading) || query.isLoading,
    error: query.error as Error | null,
  };
}
