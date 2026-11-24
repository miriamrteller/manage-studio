/**
 * How clients pay the studio directly (owner, 22 Nov 2026; every checkout since 23 Nov).
 *
 * The studio switches on the ways it takes on Settings > Online payments
 * (tenant_pay_ways, every checkout): Bit (with its Bit phone), bank transfer (with its details),
 * cash and cheque (each with optional instructions, e.g. "Pay at the studio"). Card is its
 * own switch (card_payments). Clients see only the ways that are on, on the order's payment
 * page and in the emails. None on: null, and the standard "Pay the studio directly" wording
 * stays. Wording only: it never stops an order. Plain text; the page and the email escape it.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";

export const BIT_PHONE_MAX = 30;
export const DETAILS_MAX = 500;

export type PayDirectMethod = "bit" | "bank" | "cash" | "cheque";
export const PAY_DIRECT_METHODS: readonly PayDirectMethod[] = ["bit", "bank", "cash", "cheque"];
/** Ways that ask for a payment screenshot. */
export const PROOF_METHODS: readonly PayDirectMethod[] = ["bit", "bank"];

export interface PayDirectWay {
  method: PayDirectMethod;
  /** Bit: the phone. Bank: the transfer details. Cash / cheque: instructions, or null. */
  details: string | null;
}

export interface PayDirect {
  ways: PayDirectWay[];
}

/** Pure: a phone safe to show (digits, spaces, + - ( ) only), else null. */
export function cleanBitPhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const phone = raw.replace(/\s+/g, " ").trim();
  if (!phone || phone.length > BIT_PHONE_MAX || !/^[0-9+\-() ]+$/.test(phone) || !/\d/.test(phone)) return null;
  return phone;
}

/** Pure: studio text as plain text: no control characters, at most 10 lines, capped length. */
export function cleanDetails(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const lines = raw
    .replace(/\r\n?/g, "\n")
    // deno-lint-ignore no-control-regex
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 10);
  const text = lines.join("\n").slice(0, DETAILS_MAX).trim();
  return text || null;
}

export interface PayDirectSettingsRow {
  accepts_bit?: unknown;
  bit_phone?: unknown;
  accepts_bank?: unknown;
  bank_details?: unknown;
  accepts_cash?: unknown;
  cash_instructions?: unknown;
  accepts_cheque?: unknown;
  cheque_instructions?: unknown;
}

export const PAY_DIRECT_COLUMNS =
  "accepts_bit, bit_phone, accepts_bank, bank_details, accepts_cash, cash_instructions, accepts_cheque, cheque_instructions";

/** Pure: the ways clients see, from the studio's settings row; null when none is on. */
export function payDirectFromSettings(row: PayDirectSettingsRow | null | undefined): PayDirect | null {
  if (!row) return null;
  const ways: PayDirectWay[] = [];
  const bit = row.accepts_bit === true ? cleanBitPhone(row.bit_phone) : null;
  if (bit) ways.push({ method: "bit", details: bit });
  const bank = row.accepts_bank === true ? cleanDetails(row.bank_details) : null;
  if (bank) ways.push({ method: "bank", details: bank });
  if (row.accepts_cash === true) ways.push({ method: "cash", details: cleanDetails(row.cash_instructions) });
  if (row.accepts_cheque === true) ways.push({ method: "cheque", details: cleanDetails(row.cheque_instructions) });
  return ways.length ? { ways } : null;
}

/** Pure: does any way on offer ask for a payment screenshot (Bit, bank transfer)? */
export function asksForProof(pay: PayDirect | null): boolean {
  return Boolean(pay?.ways.some((w) => PROOF_METHODS.includes(w.method)));
}

export function isPayDirectMethod(v: unknown): v is PayDirectMethod {
  return typeof v === "string" && (PAY_DIRECT_METHODS as readonly string[]).includes(v);
}

/**
 * The studio's pay-direct ways, read fresh for a page or an email. Studio-wide since 23 Nov
 * 2026 (tenant_pay_ways): the same ways for every checkout, not only the photo shop.
 */
export async function studioPayDirect(service: SupabaseClient, tenantId: string): Promise<PayDirect | null> {
  const { data } = await service
    .from("tenant_pay_ways")
    .select(PAY_DIRECT_COLUMNS)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return payDirectFromSettings(data as PayDirectSettingsRow | null);
}

type Lang = "en" | "he";

const BY: Record<Lang, Record<PayDirectMethod, string>> = {
  en: { bit: "by Bit", bank: "by bank transfer", cash: "in cash", cheque: "by cheque" },
  he: { bit: "בביט", bank: "בהעברה בנקאית", cash: "במזומן", cheque: "בצ'ק" },
};

/** Pure: "by Bit, by bank transfer or in cash" (he: "בביט, בהעברה בנקאית או במזומן"). */
export function payDirectHow(language: Lang, methods: readonly PayDirectMethod[]): string {
  const parts = methods.map((m) => BY[language][m]);
  if (parts.length <= 1) return parts[0] ?? "";
  const or = language === "he" ? " או " : " or ";
  return `${parts.slice(0, -1).join(", ")}${or}${parts[parts.length - 1]}`;
}

/** Pure: each way with its details, one paragraph each, for emails. */
export function payDirectWaysText(language: Lang, pay: PayDirect | null): string {
  if (!pay) return "";
  return pay.ways
    .map((w) => {
      const by = BY[language][w.method];
      const head = language === "he" ? `• ${by}` : `• ${by.charAt(0).toUpperCase()}${by.slice(1)}`;
      if (!w.details) return head;
      if (w.method === "bit") return language === "he" ? `${head} למספר ${w.details}` : `${head} to ${w.details}`;
      return `${head}:\n${w.details}`;
    })
    .join("\n\n");
}
