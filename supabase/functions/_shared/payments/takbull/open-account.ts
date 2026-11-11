import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import type { TakbullApi, TakbullCreateAccountRequest, TakbullCreateAccountResult } from "./client.ts";
import { takbullApiForPlatform } from "./index.ts";

/**
 * PR 7 (docs/plans/TAKBULL-INTEGRATION.md, item 8): a studio admin opens the studio's own
 * Takbull account from Settings → Payments. OpalSwift's own keys call CreateAccount with
 * SubscriptionPayer "Parent" (OpalSwift pays the package; the studio pays only its own
 * per-transaction fees). The child account's keys come back at once; they are saved
 * encrypted, never shown or logged, and the studio is switched to Takbull.
 *
 * Owner decisions (2026-11-10): the owner types the Takbull password on our page and we pass
 * it through; the login email is the business email, prefilled and editable. The owner's ID
 * number, bank details and password pass straight through to Takbull and are never stored.
 */

/** Business status (legal profile) → Takbull BusinessType. Unregistered: Takbull can't open card processing. */
export function businessTypeFor(status: string | null | undefined): number | null {
  switch (status) {
    case "osek_murshe":
      return 1;
    case "company":
      return 2;
    case "osek_patur":
      return 3;
    default:
      return null;
  }
}

/** Takbull's password rule: 8+ characters with upper and lower case, a digit and a special character. */
export function passwordProblems(pw: string): string[] {
  const out: string[] = [];
  if (pw.length < 8) out.push("length");
  if (!/[A-Z]/.test(pw)) out.push("upper");
  if (!/[a-z]/.test(pw)) out.push("lower");
  if (!/[0-9]/.test(pw)) out.push("digit");
  if (!/[^A-Za-z0-9]/.test(pw)) out.push("special");
  return out;
}

/** Pure: "Dana Levi Cohen" → first "Dana", last "Levi Cohen". */
export function splitName(full: string | null | undefined): { first: string; last: string } {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

/** Pure: "Herzl 1, Tel Aviv" → street "Herzl 1", city "Tel Aviv" (the last part after a comma). */
export function splitAddress(address: string | null | undefined): { street: string; city: string } {
  const text = (address ?? "").trim();
  const i = text.lastIndexOf(",");
  if (i < 0) return { street: text, city: "" };
  return { street: text.slice(0, i).trim(), city: text.slice(i + 1).trim() };
}

export interface OpenAccountPrefill {
  opened: boolean;
  openedAt: string | null;
  businessName: string;
  businessNumber: string;
  businessStatus: string | null;
  businessType: number | null;
  businessEmail: string;
  phone: string;
  street: string;
  city: string;
  ownerFirstName: string;
  ownerLastName: string;
}

/** What OpalSwift already knows about the studio, for the form (nothing secret). */
export async function loadOpenAccountPrefill(service: SupabaseClient, tenantId: string, userId: string): Promise<OpenAccountPrefill> {
  const [{ data: tenant }, { data: profile }] = await Promise.all([
    service.from("tenants").select("name, contact_email, legal_profile, takbull_account_opened_at").eq("id", tenantId).single(),
    service.from("user_profiles").select("person_id").eq("id", userId).maybeSingle(),
  ]);
  let personName: string | null = null;
  if (profile?.person_id) {
    const { data: person } = await service.from("people").select("name").eq("id", profile.person_id).maybeSingle();
    personName = (person?.name as string | undefined) ?? null;
  }
  const legal = (tenant?.legal_profile ?? {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const status = text(legal.business_status) || null;
  const { street, city } = splitAddress(text(legal.address));
  const owner = splitName(personName ?? (status === "osek_patur" || status === "osek_murshe" ? text(legal.legal_name) : ""));
  return {
    opened: !!tenant?.takbull_account_opened_at,
    openedAt: (tenant?.takbull_account_opened_at as string | null) ?? null,
    businessName: text(legal.legal_name) || text(tenant?.name),
    businessNumber: text(legal.business_number),
    businessStatus: status,
    businessType: businessTypeFor(status),
    businessEmail: text(legal.email) || text(tenant?.contact_email),
    phone: text(legal.phone),
    street,
    city,
    ownerFirstName: owner.first,
    ownerLastName: owner.last,
  };
}

export interface OpenAccountInput {
  loginEmail: string;
  password: string;
  businessName: string;
  businessNumber: string;
  businessType: number;
  businessEmail: string;
  phone: string;
  street: string;
  city: string;
  ownerFirstName: string;
  ownerLastName: string;
  ownerIdNumber: string;
  bankCode: string;
  branchCode: string;
  accountNumber: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Pure: which fields are missing or wrong (field names only, never their values). */
export function inputProblems(input: Partial<OpenAccountInput>): string[] {
  const out: string[] = [];
  const need = (k: keyof OpenAccountInput) => {
    const v = input[k];
    if (typeof v !== "string" || !v.trim()) out.push(k);
  };
  (["businessName", "businessNumber", "phone", "street", "city", "ownerFirstName", "ownerLastName",
    "ownerIdNumber", "bankCode", "branchCode", "accountNumber"] as const).forEach(need);
  if (typeof input.loginEmail !== "string" || !EMAIL.test(input.loginEmail.trim())) out.push("loginEmail");
  if (typeof input.businessEmail !== "string" || !EMAIL.test(input.businessEmail.trim())) out.push("businessEmail");
  if (![1, 2, 3, 4, 5, 6].includes(Number(input.businessType))) out.push("businessType");
  if (typeof input.password !== "string" || passwordProblems(input.password).length > 0) out.push("password");
  for (const k of ["businessNumber", "ownerIdNumber", "bankCode", "branchCode", "accountNumber"] as const) {
    const v = input[k];
    if (typeof v === "string" && v.trim() && !/^[0-9-]+$/.test(v.trim())) out.push(k);
  }
  return [...new Set(out)];
}

/** Pure: the CreateAccount request (OpalSwift pays; the package is configuration, empty = free). */
export function buildCreateAccountRequest(input: OpenAccountInput, packageId: string | null): TakbullCreateAccountRequest {
  const t = (s: string) => s.trim();
  return {
    Email: t(input.loginEmail),
    Password: input.password,
    FirstName: t(input.ownerFirstName),
    LastName: t(input.ownerLastName),
    Phone: t(input.phone),
    ...(packageId ? { PackageUniqId: packageId } : {}),
    SubscriptionPayer: "Parent",
    MerchantDetails: {
      Name: t(input.businessName),
      BusinessNumber: t(input.businessNumber),
      BusinessType: Number(input.businessType),
      BizRegiEmail: t(input.businessEmail),
      PhoneNumber1: t(input.phone),
      Address1: t(input.street),
      City: t(input.city),
      FirstName: t(input.ownerFirstName),
      LastName: t(input.ownerLastName),
      IdentityNumber: t(input.ownerIdNumber),
      bankcode: t(input.bankCode),
      branchcode: t(input.branchCode),
      accountnumber: t(input.accountNumber),
      Country: "Israel",
    },
  };
}

export type OpenAccountCode =
  | "not_set_up"
  | "already_opened"
  | "invalid_input"
  | "email_taken"
  | "weak_password"
  | "details_rejected"
  | "not_allowed"
  | "clearing_failed"
  | "payment_required"
  | "no_keys"
  | "takbull_error";

export type OpenAccountResult =
  | { ok: true; merchantId: string | null; freePackage: boolean }
  | { ok: false; code: OpenAccountCode; fields?: string[]; message?: string };

/** Pure: Takbull's answer → our outcome. Keys only count when both came back. */
export function accountOutcome(r: TakbullCreateAccountResult): OpenAccountResult & { apiKey?: string; apiSecret?: string } {
  const code = Number(r.ErrorCode);
  const message = typeof r.ErrorMessage === "string" ? r.ErrorMessage.slice(0, 300) : undefined;
  if (code === 0 || code === 1) {
    if (!r.ApiKey || !r.ApiSecret) return { ok: false, code: "no_keys", message };
    return { ok: true, merchantId: r.MerchantId ?? null, freePackage: code === 1, apiKey: r.ApiKey, apiSecret: r.ApiSecret };
  }
  switch (code) {
    case 600106:
    case 600109:
      return { ok: false, code: "email_taken", message };
    case 600107:
      return { ok: false, code: "weak_password", message };
    case 600114:
    case 600128:
      return { ok: false, code: "details_rejected", message };
    case 600104:
    case 600108:
      return { ok: false, code: "not_allowed", message };
    case 600111:
      return { ok: false, code: "clearing_failed", message };
    case 600113:
      return { ok: false, code: "payment_required", message };
    default:
      return { ok: false, code: "takbull_error", message: message ?? `Takbull error ${Number.isFinite(code) ? code : ""}`.trim() };
  }
}

/**
 * Opens the account and, when Takbull returns the child's keys, saves them encrypted and
 * switches the studio to Takbull (save_opened_takbull_account, service role).
 */
export async function openStudioTakbullAccount(
  service: SupabaseClient,
  input: { tenantId: string; userId: string; fields: Partial<OpenAccountInput> },
  deps: { api?: TakbullApi } = {},
): Promise<OpenAccountResult> {
  const problems = inputProblems(input.fields);
  if (problems.length > 0) return { ok: false, code: "invalid_input", fields: problems };

  const { data: tenant } = await service.from("tenants").select("takbull_account_opened_at").eq("id", input.tenantId).single();
  if (tenant?.takbull_account_opened_at) return { ok: false, code: "already_opened" };

  let api: TakbullApi;
  try {
    api = deps.api ?? (await takbullApiForPlatform(service));
  } catch {
    return { ok: false, code: "not_set_up" };
  }
  const { data: settings } = await service.from("platform_billing_settings").select("takbull_child_package_id").maybeSingle();
  const packageId = typeof settings?.takbull_child_package_id === "string" && settings.takbull_child_package_id.trim()
    ? settings.takbull_child_package_id.trim()
    : null;

  let answer: TakbullCreateAccountResult;
  try {
    answer = await api.createAccount(buildCreateAccountRequest(input.fields as OpenAccountInput, packageId));
  } catch (err) {
    // Never pass the request on: it holds the password, ID and bank details.
    return { ok: false, code: "takbull_error", message: err instanceof Error ? err.message.slice(0, 200) : "Takbull error" };
  }
  const outcome = accountOutcome(answer);
  if (!outcome.ok) return outcome;

  const { error } = await service.rpc("save_opened_takbull_account", {
    p_tenant_id: input.tenantId,
    p_actor_id: input.userId,
    p_api_key: outcome.apiKey,
    p_api_secret: outcome.apiSecret,
    p_merchant_id: outcome.merchantId,
  });
  if (error) throw new Error(`save_opened_takbull_account failed: ${error.message}`);
  return { ok: true, merchantId: outcome.merchantId, freePackage: outcome.freePackage };
}
