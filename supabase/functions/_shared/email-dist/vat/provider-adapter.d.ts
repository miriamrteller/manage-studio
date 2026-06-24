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
export declare const ProviderVatResponseSchema: z.ZodObject<{
    pretax: z.ZodNumber;
    vat: z.ZodNumber;
    total: z.ZodNumber;
    /** For display only. DO NOT derive any monetary value from this field. */
    vatRateApplied: z.ZodNumber;
    /** מספר סידורי — invoice serial from provider. Always present. */
    serialNumber: z.ZodString;
    /**
     * מספר הקצאה — Tax Authority allocation number.
     * null = legally valid: provider confirmed no allocation number required
     * (sub-₪25,000 threshold, B2C, or osek-patur).
     * Empty string ('') is NOT valid — use null explicitly.
     */
    allocationNumber: z.ZodNullable<z.ZodString>;
    providerChargeId: z.ZodString;
    issuedAt: z.ZodString;
    status: z.ZodEnum<["settled", "pending_allocation", "failed"]>;
}, "strip", z.ZodTypeAny, {
    status: "failed" | "settled" | "pending_allocation";
    pretax: number;
    vat: number;
    total: number;
    vatRateApplied: number;
    serialNumber: string;
    allocationNumber: string | null;
    providerChargeId: string;
    issuedAt: string;
}, {
    status: "failed" | "settled" | "pending_allocation";
    pretax: number;
    vat: number;
    total: number;
    vatRateApplied: number;
    serialNumber: string;
    allocationNumber: string | null;
    providerChargeId: string;
    issuedAt: string;
}>;
export type ProviderVatResponse = z.infer<typeof ProviderVatResponseSchema>;
export declare class ProviderValidationError extends Error {
    constructor(message: string);
}
export declare class ProviderTimeoutError extends Error {
    constructor(message?: string);
}
export declare class ProviderRejectedError extends Error {
    readonly providerCode: string;
    constructor(providerCode: string, message: string);
}
/**
 * Issue an invoice through the certified VAT provider.
 * Sends gross amount only; returns provider-authoritative breakdown.
 * Validates the Invariant I2: pretax + vat === total (never recomputes to "fix" it).
 *
 * @throws {ProviderTimeoutError}    Provider did not respond within 8 s
 * @throws {ProviderRejectedError}   Provider returned 422 (e.g. invalid tenant config)
 * @throws {ProviderValidationError} Response shape invalid or breakdown inconsistent
 */
export declare function issueProviderInvoice(opts: {
    grossAmount: Agorot;
    tenantId: string;
    idempotencyKey: string;
    signal?: AbortSignal;
}): Promise<ProviderVatResponse>;
//# sourceMappingURL=provider-adapter.d.ts.map