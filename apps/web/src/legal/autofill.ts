import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { LegalLang } from './render';
import type { TenantLegalProfile } from './useLegalDocument';

/**
 * Legal details the studio already gave us elsewhere: the studio's name and
 * contact email, the owner's name, the payment and invoicing providers and
 * the business number used for invoices, the owner's phone and the address
 * all the classes share. They fill Settings → Legal so the
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
  /** The owner's own phone (their WhatsApp number, or the phone on their sign-in). */
  ownerPhone?: string | null;
  /** The one location every class with a location shares (offerings.location). */
  classLocation?: string | null;
}

/**
 * Details only the studio can give that the documents need; always shown in
 * Settings → Legal. Everything else sits under "Details we filled in for you",
 * unless it is required and still empty.
 */
export const STUDIO_LEGAL_KEYS = [
  'address',
  'phone',
  'insurance_status',
  'insurance',
  'gallery_service',
  'business_status',
  'business_number',
] as const;

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
  set('phone', src.ownerPhone);
  set('address', src.classLocation);

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

/**
 * The studio's address, if every class that has a location gives the same one
 * (ignoring case and spacing); cancelled classes don't count. Otherwise none.
 */
export function sharedClassLocation(rows: Array<{ location?: string | null; status?: string | null }>): string | null {
  const norm = (v: string) => v.trim().replace(/\s+/g, ' ').toLowerCase();
  let first: string | null = null;
  for (const r of rows) {
    if (r.status === 'cancelled') continue;
    const loc = (r.location ?? '').trim();
    if (!loc) continue;
    if (first === null) first = loc;
    else if (norm(first) !== norm(loc)) return null;
  }
  return first;
}

/** Each source on its own: one that can't be read leaves only its own detail empty. */
async function optional<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch {
    return null;
  }
}

async function loadClassLocation(tenantId: string): Promise<string | null> {
  const { data } = await supabase.from('offerings').select('location, status').eq('tenant_id', tenantId);
  return Array.isArray(data) ? sharedClassLocation(data as Array<{ location?: string | null; status?: string | null }>) : null;
}

/** The signed-in owner's phone: their own WhatsApp number (RLS: own row), else their sign-in phone. */
async function loadOwnerPhone(tenantId: string, userId: string): Promise<string | null> {
  const person = await optional(async () => {
    const { data } = await supabase
      .from('people')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('user_profile_id', userId)
      .limit(1)
      .maybeSingle();
    return (data as { id?: string } | null)?.id ?? null;
  });
  if (person) {
    const whatsapp = await optional(async () => {
      const { data } = await supabase
        .from('contact_preferences')
        .select('whatsapp_number')
        .eq('person_id', person)
        .limit(1)
        .maybeSingle();
      return ((data as { whatsapp_number?: string | null } | null)?.whatsapp_number ?? '').trim() || null;
    });
    if (whatsapp) return whatsapp;
  }
  return optional(async () => {
    const { data } = await supabase.auth.getUser();
    return (data?.user?.phone ?? '').trim() || null;
  });
}

async function loadSources(
  tenantId: string,
  { ownerUserId, studioSuggestions }: { ownerUserId: string | null; studioSuggestions: boolean },
): Promise<Partial<LegalAutofillSources>> {
  const [classLocation, ownerPhone] = await Promise.all([
    studioSuggestions ? optional(() => loadClassLocation(tenantId)) : Promise.resolve(null),
    ownerUserId ? optional(() => loadOwnerPhone(tenantId, ownerUserId)) : Promise.resolve(null),
  ]);
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
    classLocation,
    ownerPhone,
  };
}

/**
 * Loads the sources for one studio (any host: by id) and returns the suggestions.
 * The phone and address are only suggested where the admin sees and edits them
 * (Settings → Legal, `studioSuggestions`): the owner's own number or a class
 * location is never published on Confirm without them having seen it.
 */
export function useLegalAutofill(
  legal: TenantLegalProfile | null | undefined,
  opts: { studioSuggestions?: boolean } = {},
): {
  autofill: Record<string, string>;
  isLoading: boolean;
} {
  const { user } = useCurrentUser();
  const tenantId = legal?.tenantId;
  // The owner's own phone only when they look at their own studio.
  const studioSuggestions = !!opts.studioSuggestions;
  const ownerUserId = studioSuggestions && user && tenantId && user.tenant_id === tenantId ? user.id : null;
  const { data, isLoading } = useQuery({
    queryKey: ['legal-autofill-sources', tenantId, studioSuggestions, ownerUserId],
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
    // Suggestions only: if a source can't be read, the admin simply types the detail.
    queryFn: async () => {
      try {
        return await loadSources(tenantId!, { ownerUserId, studioSuggestions });
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
