import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { LegalLang } from './render';
import type { TenantLegalProfile } from './useLegalDocument';

/**
 * Legal details the studio already gave us elsewhere: the studio's name and
 * contact email, the owner's name, the payment and invoicing providers and
 * the business number used for invoices. They fill Settings → Legal so the
 * admin only types what we can't know (each filled detail stays editable).
 */
export interface LegalAutofillSources {
  tenantName: string;
  contactEmail: string;
  ownerName?: string | null;
  paymentProvider?: string | null;
  invoicingProvider?: string | null;
  /** The studio takes payments directly (bank transfer, cash) as well as or instead of online. */
  offlinePayments?: boolean;
  /** The business number the studio gave its invoicing provider. */
  businessNumber?: string | null;
  /** legal_profile.business_status: an unregistered studio is run by a person, named in full. */
  businessStatus?: string | null;
}

/**
 * Details only the studio can give that the documents need; always shown in
 * Settings → Legal. Everything else sits under "Details we filled in for you",
 * unless it is required and still empty.
 */
export const STUDIO_LEGAL_KEYS = ['address', 'phone', 'insurance', 'gallery_service', 'business_status', 'business_number'] as const;

const PROVIDER_NAMES: Record<string, string> = {
  grow: 'Grow',
  ypay: 'YPay',
  stripe: 'Stripe',
  icount: 'iCount',
  invoice4u: 'Invoice4u',
  greeninvoice: 'Green Invoice',
};

const providerName = (id: string | null | undefined) => (id ? PROVIDER_NAMES[id.toLowerCase()] : undefined);

/** Suggested values by legal field key (only keys we can fill). */
export function legalAutofill(src: LegalAutofillSources, lang: LegalLang): Record<string, string> {
  const he = lang === 'he';
  const out: Record<string, string> = {};
  const set = (key: string, value: string | null | undefined) => {
    const v = (value ?? '').trim();
    if (v) out[key] = v;
  };

  // Not yet a business: the legal party is the owner in person, not the studio's name.
  set('legal_name', src.businessStatus === 'not_registered' ? src.ownerName : src.tenantName);
  set('email', src.contactEmail);
  set('privacy_contact_email', src.contactEmail);
  set('accessibility_contact_email', src.contactEmail);
  set('privacy_contact_name', src.ownerName);
  set('accessibility_contact_name', src.ownerName);
  if (src.businessStatus !== 'not_registered') set('business_number', src.businessNumber);

  const online = providerName(src.paymentProvider);
  const invoicing = providerName(src.invoicingProvider);
  const providers = [...new Set([online, invoicing].filter((p): p is string => !!p))];
  const direct = src.offlinePayments || src.paymentProvider === 'offline';
  if (providers.length > 0) set('payment_providers', providers.join(', '));
  else if (direct) set('payment_providers', he ? 'התשלום מתבצע ישירות לסטודיו' : 'payments are made directly to the studio');

  const methods: string[] = [];
  if (online) methods.push(he ? `כרטיס אשראי בעמוד התשלום (${online})` : `card through the payment page (${online})`);
  if (direct) methods.push(he ? 'העברה בנקאית או מזומן, לפי הנחיות הסטודיו' : "bank transfer or cash, as the studio's payment instructions say");
  if (methods.length > 0) set('payment_methods', methods.join('; '));
  return out;
}

/** The profile with empty fields taken from the suggestions (what the documents use). */
export function withLegalAutofill(
  profile: Record<string, string> | null | undefined,
  autofill: Record<string, string>,
): Record<string, string> {
  const merged: Record<string, string> = { ...autofill };
  for (const [k, v] of Object.entries(profile ?? {})) {
    if ((v ?? '').trim()) merged[k] = v;
  }
  return merged;
}

/** Keys the suggestions add to the stored profile (empty there, filled here). */
export function autofilledKeys(profile: Record<string, string> | null | undefined, autofill: Record<string, string>): string[] {
  return Object.keys(autofill).filter((k) => !(profile?.[k] ?? '').trim());
}

async function loadSources(tenantId: string): Promise<Partial<LegalAutofillSources>> {
  const { data } = await supabase
    .from('tenants')
    .select('payment_provider, invoicing_provider, offline_payment_instructions, invoice_license_number')
    .eq('id', tenantId)
    .maybeSingle();
  const t = (data ?? {}) as Record<string, string | null>;
  return {
    paymentProvider: t.payment_provider ?? null,
    invoicingProvider: t.invoicing_provider ?? null,
    offlinePayments: !!(t.offline_payment_instructions ?? '').trim(),
    businessNumber: t.invoice_license_number ?? null,
  };
}

/** Loads the sources for one studio (any host: by id) and returns the suggestions. */
export function useLegalAutofill(legal: TenantLegalProfile | null | undefined): {
  autofill: Record<string, string>;
  isLoading: boolean;
} {
  const { user } = useCurrentUser();
  const tenantId = legal?.tenantId;
  const { data, isLoading } = useQuery({
    queryKey: ['legal-autofill-sources', tenantId],
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
    // Suggestions only: if a source can't be read, the admin simply types the detail.
    queryFn: async () => {
      try {
        return await loadSources(tenantId!);
      } catch {
        return null;
      }
    },
  });
  if (!legal) return { autofill: {}, isLoading: false };
  const ownerName = user && user.tenant_id === legal.tenantId ? user.full_name : null;
  return {
    autofill: legalAutofill(
      {
        tenantName: legal.name,
        contactEmail: legal.contactEmail,
        ownerName,
        businessStatus: legal.profile.business_status ?? null,
        ...(data ?? {}),
      },
      legal.languageDefault,
    ),
    isLoading,
  };
}
