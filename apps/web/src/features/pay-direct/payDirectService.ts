import { supabase } from '@/lib/supabase';
import {
  PROOF_MAX_BYTES,
  PROOF_TYPES,
  type PayDirectMethod,
  type PayDirectWay,
} from '@/features/jobs/services/clientPhotoShopService';

/**
 * Paying the studio directly, everywhere (owner, 23 Nov 2026): the studio's ways (Bit, bank
 * transfer, cash, cheque) live on Settings › Online payments (tenant_pay_ways) and show on
 * every payment page. The client picks one; for Bit / bank transfer they can send a
 * screenshot of the payment. Asked for, never required.
 */

/** The studio's own ways to be paid directly (Settings › Online payments). */
export interface StudioPayWays {
  accepts_bit: boolean;
  bit_phone: string | null;
  accepts_bank: boolean;
  bank_details: string | null;
  accepts_cash: boolean;
  cash_instructions: string | null;
  accepts_cheque: boolean;
  cheque_instructions: string | null;
}

export const NO_PAY_WAYS: StudioPayWays = {
  accepts_bit: false,
  bit_phone: null,
  accepts_bank: false,
  bank_details: null,
  accepts_cash: false,
  cash_instructions: null,
  accepts_cheque: false,
  cheque_instructions: null,
};

const PAY_WAYS_COLUMNS =
  'accepts_bit, bit_phone, accepts_bank, bank_details, accepts_cash, cash_instructions, accepts_cheque, cheque_instructions';

/** Which payment page is asking: a /pay link, or an enrolment / booking paid at the studio. */
export type PayDirectTarget =
  | { token: string }
  | { enrolment: { offering_id: string; engagement_id: string; enrolment_token?: string } };

export interface PayDirectView {
  ways: PayDirectWay[];
  amountMinor: number;
  currency: string;
  /** False once the studio has recorded the payment (or it can no longer be paid). */
  payable: boolean;
  chosen: PayDirectMethod | null;
  proofSentAt: string | null;
}

/** One screenshot (or chosen way) for the studio's list. */
export interface ClientPaymentProof {
  id: string;
  pay_method: PayDirectMethod | null;
  proof_path: string | null;
  proof_sent_at: string | null;
  updated_at: string;
  payment_request_id: string | null;
  engagement_id: string | null;
  /** Filled in by listProofs. */
  client_name: string | null;
  what: string | null;
  amount_minor: number | null;
  currency: string | null;
  image_url: string | null;
}

export class PayDirectError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

async function errorCode(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response } | null)?.context;
  if (ctx && typeof ctx.json === 'function') {
    const body = await ctx.json().catch(() => null);
    if (body && typeof body.error === 'string') return body.error;
  }
  return 'server_error';
}

function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? '').replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error ?? new Error('read_failed'));
    reader.readAsDataURL(file);
  });
}

/** Pure: the ways a studio's saved settings offer (same rule as the server: Bit needs its phone, bank its details). */
export function waysFromSettings(s: StudioPayWays | null | undefined): PayDirectWay[] {
  if (!s) return [];
  const ways: PayDirectWay[] = [];
  if (s.accepts_bit && s.bit_phone?.trim()) ways.push({ method: 'bit', details: s.bit_phone.trim() });
  if (s.accepts_bank && s.bank_details?.trim()) ways.push({ method: 'bank', details: s.bank_details.trim() });
  if (s.accepts_cash) ways.push({ method: 'cash', details: s.cash_instructions?.trim() || null });
  if (s.accepts_cheque) ways.push({ method: 'cheque', details: s.cheque_instructions?.trim() || null });
  return ways;
}

export const PayDirectService = {
  async getStudioWays(tenantId: string): Promise<StudioPayWays> {
    const { data, error } = await supabase
      .from('tenant_pay_ways')
      .select(PAY_WAYS_COLUMNS)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error) throw error;
    return (data as StudioPayWays | null) ?? NO_PAY_WAYS;
  },

  async saveStudioWays(tenantId: string, values: StudioPayWays): Promise<void> {
    const { error } = await supabase
      .from('tenant_pay_ways')
      .upsert({ tenant_id: tenantId, ...values }, { onConflict: 'tenant_id' });
    if (error) throw error;
  },

  /** What a payment page shows. Any failure: no ways (the page still works as before). */
  async get(target: PayDirectTarget): Promise<PayDirectView | null> {
    const { data, error } = await supabase.functions.invoke('client-pay-direct', { body: { action: 'get', ...target } });
    if (error || !data) return null;
    return data as PayDirectView;
  },

  async choose(target: PayDirectTarget, method: PayDirectMethod): Promise<void> {
    const { error } = await supabase.functions.invoke('client-pay-direct', { body: { action: 'method', method, ...target } });
    if (error) throw new PayDirectError(await errorCode(error));
  },

  async sendProof(target: PayDirectTarget, file: File, method?: PayDirectMethod): Promise<void> {
    if (!PROOF_TYPES.includes(file.type)) throw new PayDirectError('proof_not_image');
    if (file.size > PROOF_MAX_BYTES) throw new PayDirectError('proof_too_big');
    const image = await fileToBase64(file);
    const { error } = await supabase.functions.invoke('client-pay-direct', {
      body: { action: 'proof', image, ...(method ? { method } : {}), ...target },
    });
    if (error) throw new PayDirectError(await errorCode(error));
  },

  /** Studio admins: the latest screenshots and chosen ways, newest first, with a link to each picture. */
  async listProofs(limit = 100): Promise<ClientPaymentProof[]> {
    const { data, error } = await supabase
      .from('client_payment_proofs')
      .select('id, pay_method, proof_path, proof_sent_at, updated_at, payment_request_id, engagement_id')
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    const rows = (data ?? []) as Array<Omit<ClientPaymentProof, 'client_name' | 'what' | 'amount_minor' | 'currency' | 'image_url'>>;
    const requestIds = rows.map((r) => r.payment_request_id).filter((v): v is string => Boolean(v));
    const { data: requests } = requestIds.length
      ? await supabase.from('job_payment_requests').select('id, engagement_id, label, amount_minor, currency').in('id', requestIds)
      : { data: [] };
    const reqById = new Map((requests ?? []).map((r) => [r.id as string, r]));
    const engagementIds = [
      ...new Set(rows.map((r) => r.engagement_id ?? reqById.get(r.payment_request_id ?? '')?.engagement_id).filter((v): v is string => Boolean(v))),
    ];
    const { data: engagements } = engagementIds.length
      ? await supabase.from('engagements').select('id, person_id, offering_id').in('id', engagementIds)
      : { data: [] };
    const engById = new Map((engagements ?? []).map((e) => [e.id as string, e]));
    const personIds = [...new Set((engagements ?? []).map((e) => e.person_id as string).filter(Boolean))];
    const offeringIds = [...new Set((engagements ?? []).map((e) => e.offering_id as string).filter(Boolean))];
    const [{ data: people }, { data: offerings }] = await Promise.all([
      personIds.length ? supabase.from('people').select('id, name').in('id', personIds) : Promise.resolve({ data: [] }),
      offeringIds.length ? supabase.from('offerings').select('id, name').in('id', offeringIds) : Promise.resolve({ data: [] }),
    ]);
    const nameById = new Map((people ?? []).map((p) => [p.id as string, p.name as string]));
    const offById = new Map((offerings ?? []).map((o) => [o.id as string, o]));
    const paths = rows.map((r) => r.proof_path).filter((p): p is string => Boolean(p));
    const { data: signed } = paths.length
      ? await supabase.storage.from('payment-proofs').createSignedUrls(paths, 60 * 60)
      : { data: [] };
    const urlByPath = new Map((signed ?? []).map((s) => [s.path ?? '', s.signedUrl ?? null]));
    return rows.map((r) => {
      const req = r.payment_request_id ? reqById.get(r.payment_request_id) : undefined;
      const eng = engById.get(r.engagement_id ?? (req?.engagement_id as string | undefined) ?? '');
      const off = eng ? offById.get(eng.offering_id as string) : undefined;
      return {
        ...r,
        client_name: eng ? nameById.get(eng.person_id as string) ?? null : null,
        what: (req?.label as string | undefined) ?? (off?.name as string | undefined) ?? null,
        amount_minor: (req?.amount_minor as number | undefined) ?? null,
        currency: (req?.currency as string | undefined) ?? null,
        image_url: r.proof_path ? urlByPath.get(r.proof_path) ?? null : null,
      };
    });
  },
};
