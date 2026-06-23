/**
 * VAT Provider Adapter — shared types & Zod schema
 *
 * CNB-001: allocationNumber is z.string().min(1).nullable()
 * Null is legally valid for:
 *   - Sub-₪25,000 B2C invoices (below Tax Authority allocation-number threshold)
 *   - Osek-patur (VAT-exempt) businesses (vat = 0)
 *
 * Source of truth: vat-refactor-plan.md §3.1 (ProviderChargeResult type) and §9.6
 * (Allocation Number Handling).
 */
import { z } from 'zod';

/** Amounts are integer minor units (agorot) to avoid float drift. */
export type Agorot = number;

/**
 * Zod schema for the provider-authoritative charge response.
 * The application NEVER recomputes pretax/vat/total.
 *
 * CNB-001 fix: allocationNumber is z.string().min(1).nullable()
 * An empty string ('') is rejected — the field must be either a non-empty string
 * or null. Null signals the provider determined no allocation number is required
 * for this invoice (e.g. B2C below threshold, or osek-patur).
 */
export const ProviderVatResponseSchema = z.object({
  pretax: z.number().int().nonnegative(),
  vat: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  /** For display only. DO NOT derive any monetary value from this field. */
  vatRateApplied: z.number().min(0).max(1),
  /** מספר סידורי — invoice serial from provider. Always present. */
  serialNumber: z.string().min(1),
  /**
   * מספר הקצאה — Tax Authority allocation number.
   * null = legally valid: provider confirmed no allocation number required
   * (sub-₪25,000 threshold, B2C, or osek-patur).
   * Empty string ('') is NOT valid — use null explicitly.
   */
  allocationNumber: z.string().min(1).nullable(),
  providerChargeId: z.string().min(1),
  issuedAt: z.string().datetime(),
  status: z.enum(['settled', 'pending_allocation', 'failed']),
});

export type ProviderVatResponse = z.infer<typeof ProviderVatResponseSchema>;

// ── Error taxonomy ───────────────────────────────────────────────────────────

export class ProviderValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderValidationError';
  }
}

export class ProviderTimeoutError extends Error {
  constructor(message = 'VAT provider timed out') {
    super(message);
    this.name = 'ProviderTimeoutError';
  }
}

export class ProviderRejectedError extends Error {
  constructor(
    public readonly providerCode: string,
    message: string,
  ) {
    super(message);
    this.name = 'ProviderRejectedError';
  }
}

// ── Adapter function ─────────────────────────────────────────────────────────

/**
 * Issue an invoice through the certified VAT provider.
 * Sends gross amount only; returns provider-authoritative breakdown.
 * Validates the Invariant I2: pretax + vat === total (never recomputes to "fix" it).
 *
 * @throws {ProviderTimeoutError}    Provider did not respond within 8 s
 * @throws {ProviderRejectedError}   Provider returned 422 (e.g. invalid tenant config)
 * @throws {ProviderValidationError} Response shape invalid or breakdown inconsistent
 */
export async function issueProviderInvoice(opts: {
  grossAmount: Agorot;
  tenantId: string;
  idempotencyKey: string;
  signal?: AbortSignal;
}): Promise<ProviderVatResponse> {
  const providerUrl =
    (typeof process !== 'undefined' ? process.env['VAT_PROVIDER_URL'] : undefined) ?? '';
  const providerToken =
    (typeof process !== 'undefined' ? process.env['VAT_PROVIDER_TOKEN'] : undefined) ?? '';

  const res = await fetch(providerUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${providerToken}`,
      'Idempotency-Key': opts.idempotencyKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ gross: opts.grossAmount, tenant: opts.tenantId }),
    signal: opts.signal ?? AbortSignal.timeout(8_000),
  }).catch((e: Error) => {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      throw new ProviderTimeoutError();
    }
    throw e;
  });

  if (res.status === 422) {
    const body = await res.json().catch(() => ({})) as { code?: string; message?: string };
    throw new ProviderRejectedError(
      body.code ?? 'UNKNOWN',
      body.message ?? 'Provider rejected request',
    );
  }

  if (!res.ok) {
    throw new Error(`Provider HTTP ${res.status}`);
  }

  const parsed = ProviderVatResponseSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new ProviderValidationError(parsed.error.message);
  }

  // INVARIANT I2: validate, never "fix".
  const { pretax, vat, total } = parsed.data;
  if (pretax + vat !== total) {
    throw new ProviderValidationError(
      `Provider breakdown inconsistent: ${pretax}+${vat}≠${total}`,
    );
  }

  return parsed.data;
}
