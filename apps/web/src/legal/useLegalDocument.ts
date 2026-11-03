import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import { safeVertical, type VerticalId } from '@shared/config/tenant-presets';
import { isBuiltInSkin } from '@shared/config/skins';
import type { LegalDocId } from './fields';
import { prepareLegalMarkdown, type LegalLang, type LegalRenderContext, type PreparedLegalDoc } from './render';
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
/**
 * Enrolment terms are for studios that teach classes (tenants.teaches_classes;
 * owner decision). Others use the service agreement. Photographers never.
 */
export function tenantHasEnrolmentTerms(vertical: VerticalId, teachesClasses = true): boolean {
  return vertical !== 'photographer' && teachesClasses;
}

/** The legal scope of a studio: its type and whether it teaches classes. */
export function legalHasEnrolmentTerms(legal: Pick<TenantLegalProfile, 'vertical' | 'teachesClasses'>): boolean {
  return tenantHasEnrolmentTerms(legal.vertical, legal.teachesClasses !== false);
}

export interface TenantLegalProfile {
  tenantId: string;
  name: string;
  contactEmail: string;
  vertical: VerticalId;
  /** The skin as stored; `vertical` is its built-in code skin ('generic' for a data skin). */
  skin: string;
  /** A data skin's legal add-on (verticals.legal_addon); null for built-in skins. */
  legalAddon: string | null;
  profile: Record<string, string>;
  published: boolean;
  updatedAt: string | null;
  /** New studios: legal pages and signing wait for the legal pack acknowledgement. */
  packRequired: boolean;
  packAcknowledgedAt: string | null;
  /** The studio's main language (its clients' signing text is written in it). */
  languageDefault: 'he' | 'en';
  /** Documents the admin acknowledged as drafts (the others were lawyer-reviewed then). */
  packAckDrafts: string[];
  /** tenants.teaches_classes: enrolment terms and class fields only when true (unknown = true). */
  teachesClasses?: boolean;
}

/** Studio documents a new studio keeps unpublished until its admin acknowledges the legal pack. */
export const LEGAL_PACK_DOCS: LegalDocId[] = ['studio-privacy', 'enrolment-terms', 'accessibility', 'cookies'];

/** Whether the studio's legal pack is live (old studios always; new ones once acknowledged). */
export function isLegalPackLive(legal: Pick<TenantLegalProfile, 'packRequired' | 'packAcknowledgedAt'>): boolean {
  return !legal.packRequired || Boolean(legal.packAcknowledgedAt);
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

/** One studio's legal profile (by id: works on the platform host too). */
export async function fetchTenantLegalProfile(tenantId: string): Promise<TenantLegalProfile | null> {
  const { data: rows, error } = await supabase.rpc('get_tenant_legal_profile', { p_tenant_id: tenantId });
  if (error) throw error;
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) return null;
  const skin = typeof row.skin === 'string' ? row.skin : 'generic';
  let legalAddon: string | null = null;
  if (!isBuiltInSkin(skin)) {
    const { data: skinRow } = await supabase.from('verticals').select('legal_addon').eq('id', skin).maybeSingle();
    legalAddon = (skinRow as { legal_addon?: string | null } | null)?.legal_addon ?? null;
  }
  return {
    tenantId: row.tenant_id,
    name: row.name,
    contactEmail: row.contact_email,
    vertical: safeVertical(row.skin),
    skin,
    legalAddon,
    profile: toStringRecord(row.legal_profile),
    published: row.legal_pages_published === true,
    updatedAt: row.legal_profile_updated_at ?? null,
    packRequired: row.legal_pack_required === true,
    packAcknowledgedAt: row.legal_pack_acknowledged_at ?? null,
    languageDefault: row.language_default === 'he' ? 'he' : 'en',
    packAckDrafts: Array.isArray(row.legal_pack_ack_drafts) ? (row.legal_pack_ack_drafts as string[]) : [],
    // Older databases (before the column was returned): a studio teaches classes.
    teachesClasses: row.teaches_classes !== false,
  };
}

export function useTenantLegalProfile(): { data: TenantLegalProfile | null; isLoading: boolean } {
  const tenant = useTenant();
  const { data, isLoading } = useQuery({
    queryKey: ['tenant-legal-profile', tenant?.id],
    enabled: !!tenant?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchTenantLegalProfile(tenant!.id),
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
/** The render context for a studio document (drafts and lawyer versions use the same details). */
export function studioRenderContext(legal: TenantLegalProfile, doc: LegalDocId, lang: LegalLang): LegalRenderContext {
  return {
    doc,
    lang,
    vertical: legal.vertical,
    tenantName: legal.name,
    contactEmail: legal.contactEmail,
    profile: legal.profile,
    updatedAt: legal.updatedAt,
    teachesClasses: legal.teachesClasses !== false,
  };
}

export function useLegalDocument(doc: LegalDocId | null, langOverride?: LegalLang) {
  const tenant = useTenant();
  const { data: legal, isLoading: profileLoading } = useTenantLegalProfile();
  const uiLang = useLegalLang();
  const lang = langOverride ?? uiLang;
  const platformDoc = doc ? PLATFORM_DOCS.includes(doc) : false;
  const needsProfile = !!tenant && !platformDoc;

  const query = useQuery({
    queryKey: ['legal-doc', doc, lang, platformDoc ? 'platform' : legal?.tenantId, legal?.updatedAt, legal?.teachesClasses],
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
        teachesClasses: platformDoc || !legal ? true : legal.teachesClasses !== false,
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
