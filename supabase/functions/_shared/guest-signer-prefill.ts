import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";

/**
 * What a guest signing link (WaiverToken) may prefill on the signing form:
 * the signer's name, email and phone, taken from the person the link was sent
 * to. Never the ID number or the address: a link can be forwarded, so those
 * are always typed by whoever signs.
 */
export interface GuestSignerPrefill {
  full_name: string | null;
  email: string;
  phone: string | null;
}

export interface SignerCandidate {
  name: string | null;
  email: string | null;
  phone: string | null;
}

function clean(value: string | null | undefined): string | null {
  const v = value?.trim() ?? "";
  return v ? v : null;
}

/**
 * The first candidate whose email is the link's email gives the name and phone.
 * A link sent to an address that is no one's on file (an audited admin
 * override) prefills the email only.
 */
export function pickGuestSignerPrefill(
  tokenEmail: string,
  candidates: SignerCandidate[],
): GuestSignerPrefill {
  const email = tokenEmail.trim().toLowerCase();
  const match = candidates.find((c) => clean(c.email)?.toLowerCase() === email);
  return {
    full_name: clean(match?.name),
    email,
    phone: clean(match?.phone),
  };
}

/**
 * Loads the candidates for an engagement's person: the account holder first
 * (a parent signs for a child), then the person themselves. The phone is the
 * one they gave for messages; the emergency contact's phone is someone else's.
 */
export async function loadGuestSignerPrefill(
  service: SupabaseClient,
  params: { tenantId: string; personId: string; tokenEmail: string },
): Promise<GuestSignerPrefill> {
  const { tenantId, personId, tokenEmail } = params;
  const ids: string[] = [];

  const { data: student } = await service
    .from("people")
    .select("id, account_id")
    .eq("id", personId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (student?.account_id) {
    const { data: holder } = await service
      .from("account_members")
      .select("person_id")
      .eq("tenant_id", tenantId)
      .eq("account_id", student.account_id)
      .eq("role", "account_holder")
      .limit(1)
      .maybeSingle();
    if (holder?.person_id && holder.person_id !== personId) ids.push(holder.person_id as string);
  }
  if (student) ids.push(personId);
  if (ids.length === 0) return pickGuestSignerPrefill(tokenEmail, []);

  const [{ data: people }, { data: prefs }] = await Promise.all([
    service.from("people").select("id, name, email").eq("tenant_id", tenantId).in("id", ids),
    service
      .from("contact_preferences")
      .select("person_id, whatsapp_number, voice_number")
      .eq("tenant_id", tenantId)
      .in("person_id", ids),
  ]);

  type PersonRow = { id: string; name: string | null; email: string | null };
  type PrefRow = { person_id: string | null; whatsapp_number: string | null; voice_number: string | null };
  const personRows = (people ?? []) as PersonRow[];
  const prefRows = (prefs ?? []) as PrefRow[];

  const candidates: SignerCandidate[] = ids.map((id) => {
    const p = personRows.find((r) => r.id === id);
    const c = prefRows.find((r) => r.person_id === id);
    return {
      name: p?.name ?? null,
      email: p?.email ?? null,
      phone: clean(c?.whatsapp_number) ?? clean(c?.voice_number),
    };
  });
  return pickGuestSignerPrefill(tokenEmail, candidates);
}
