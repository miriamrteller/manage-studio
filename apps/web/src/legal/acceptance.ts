import { supabase } from '@/lib/supabase';
import { loadLegalTemplate } from './templates';
import { legalTextVersion, type LegalLang } from './render';

export type AcceptedDocument = 'platform_terms' | 'dpa' | 'opalswift_privacy' | 'enrolment_terms' | 'studio_privacy';

/**
 * Version of the OpalSwift platform terms + DPA, from the Hebrew text (the
 * version that governs). Changing either file means admins accept again.
 */
export async function platformTermsVersion(): Promise<string> {
  const [terms, dpa] = await Promise.all([
    loadLegalTemplate('platform-terms', 'he'),
    loadLegalTemplate('dpa', 'he'),
  ]);
  return legalTextVersion(terms + '\n' + dpa);
}

export async function recordLegalAcceptance(input: {
  tenantId: string;
  documents: AcceptedDocument[];
  version: string;
  language: LegalLang;
  engagementId?: string | null;
  role?: 'self' | 'guardian' | 'tenant_admin';
}): Promise<void> {
  const { error } = await supabase.rpc('record_legal_acceptance', {
    p_tenant_id: input.tenantId,
    p_documents: input.documents,
    p_version: input.version,
    p_language: input.language,
    p_engagement_id: input.engagementId ?? null,
    p_role: input.role ?? 'self',
  });
  if (error) throw error;
}

export async function hasAcceptedPlatformTerms(tenantId: string, version: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('get_platform_terms_acceptance', {
    p_tenant_id: tenantId,
    p_version: version,
  });
  if (error) throw error;
  // Only an explicit false blocks: the function always returns a boolean, and
  // anything else (an older backend, a test double) must not lock admins out.
  return data !== false;
}
