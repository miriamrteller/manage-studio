import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import type { LegalLang } from "./render";
import type { TenantLegalProfile } from "./useLegalDocument";

/**
 * Legal details the studio already gave us elsewhere: the studio's name and
 * contact email, the owner's name, the payment and invoicing providers, and
 * the current season. They fill Settings → Legal so the admin only checks
 * them (each stays editable). Prices are never filled in here: they belong to
 * each class.
 */
export interface LegalAutofillSources {
  tenantName: string;
  contactEmail: string;
  ownerName?: string | null;
  paymentProvider?: string | null;
  invoicingProvider?: string | null;
  /** The studio takes payments directly (bank transfer, cash) as well as or instead of online. */
  offlinePayments?: boolean;
  season?: { name: string; start_date: string; end_date: string } | null;
}

/** Filled from the studio's own setup and not shown in Settings → Legal. */
export const HIDDEN_LEGAL_KEYS = ["payment_providers", "email"] as const;

const PROVIDER_NAMES: Record<string, string> = {
  grow: "Grow",
  ypay: "YPay",
  stripe: "Stripe",
  icount: "iCount",
  invoice4u: "Invoice4u",
  greeninvoice: "Green Invoice",
};

const providerName = (id: string | null | undefined) =>
  id ? PROVIDER_NAMES[id.toLowerCase()] : undefined;

/** Suggested values by legal field key (only keys we can fill). */
export function legalAutofill(
  src: LegalAutofillSources,
  lang: LegalLang,
): Record<string, string> {
  const he = lang === "he";
  const out: Record<string, string> = {};
  const set = (key: string, value: string | null | undefined) => {
    const v = (value ?? "").trim();
    if (v) out[key] = v;
  };

  set("legal_name", src.tenantName);
  set("email", src.contactEmail);
  set("privacy_contact_email", src.contactEmail);
  set("accessibility_contact_email", src.contactEmail);
  set("privacy_contact_name", src.ownerName);
  set("accessibility_contact_name", src.ownerName);

  const online = providerName(src.paymentProvider);
  const invoicing = providerName(src.invoicingProvider);
  const providers = [
    ...new Set([online, invoicing].filter((p): p is string => !!p)),
  ];
  const direct = src.offlinePayments || src.paymentProvider === "offline";
  if (providers.length > 0) set("payment_providers", providers.join(", "));
  else if (direct)
    set(
      "payment_providers",
      he
        ? "התשלום מתבצע ישירות לסטודיו"
        : "payments are made directly to the studio",
    );

  const methods: string[] = [];
  if (online)
    methods.push(
      he
        ? `כרטיס אשראי בעמוד התשלום (${online})`
        : `card through the payment page (${online})`,
    );
  if (direct)
    methods.push(
      he
        ? "העברה בנקאית או מזומן, לפי הנחיות הסטודיו"
        : "bank transfer or cash, as the studio's payment instructions say",
    );
  if (methods.length > 0)
    set("payment_methods", methods.join(he ? "; " : "; "));

  if (src.season) {
    set("season_name", src.season.name);
    set("season_start", src.season.start_date);
    set("season_end", src.season.end_date);
  }
  return out;
}

/** The profile with empty fields taken from the suggestions (what the documents use). */
export function withLegalAutofill(
  profile: Record<string, string> | null | undefined,
  autofill: Record<string, string>,
): Record<string, string> {
  const merged: Record<string, string> = { ...autofill };
  for (const [k, v] of Object.entries(profile ?? {})) {
    if ((v ?? "").trim()) merged[k] = v;
  }
  return merged;
}

/** Keys the suggestions add to the stored profile (empty there, filled here). */
export function autofilledKeys(
  profile: Record<string, string> | null | undefined,
  autofill: Record<string, string>,
): string[] {
  return Object.keys(autofill).filter((k) => !(profile?.[k] ?? "").trim());
}

/** Loads the sources for one studio (any host: by id) and returns the suggestions. */
export function useLegalAutofill(
  legal: TenantLegalProfile | null | undefined,
): {
  autofill: Record<string, string>;
  isLoading: boolean;
} {
  const { user } = useCurrentUser();
  const tenantId = legal?.tenantId;
  const { data, isLoading } = useQuery({
    queryKey: ["legal-autofill-sources", tenantId],
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
  const userInTenant =
    user &&
    (user as { tenant_id?: string | null }).tenant_id === legal.tenantId;
  return {
    autofill: legalAutofill(
      {
        tenantName: legal.name,
        contactEmail: legal.contactEmail,
        ownerName: userInTenant ? user?.full_name : null,
        ...(data ?? {}),
      },
      legal.languageDefault,
    ),
    isLoading,
  };
}

async function loadSources(tenantId: string) {
  const [tenantRes, seasonRes] = await Promise.all([
    supabase
      .from("tenants")
      .select(
        "payment_provider, invoicing_provider, offline_payment_instructions",
      )
      .eq("id", tenantId)
      .maybeSingle(),
    supabase
      .from("seasons")
      .select("name, start_date, end_date, status")
      .eq("tenant_id", tenantId)
      .in("status", ["active", "upcoming"])
      .order("start_date", { ascending: true }),
  ]);
  const t = (tenantRes.data ?? {}) as Record<string, string | null>;
  const seasons = (seasonRes.data ?? []) as Array<{
    name: string;
    start_date: string;
    end_date: string;
    status: string;
  }>;
  return {
    paymentProvider: t.payment_provider ?? null,
    invoicingProvider: t.invoicing_provider ?? null,
    offlinePayments: !!(t.offline_payment_instructions ?? "").trim(),
    season: seasons.find((s) => s.status === "active") ?? seasons[0] ?? null,
  };
}
