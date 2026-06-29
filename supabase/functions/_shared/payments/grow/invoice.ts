import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import {
  applyBundledDocumentNotify,
  type BundledDocumentResult,
  type ParsedBundledDocument,
} from "../bundled-document.ts";

export type { ParsedBundledDocument as ParsedGrowInvoice, BundledDocumentResult as GrowInvoiceResult };

/**
 * Apply a parsed Grow document notify to its payment row, idempotently.
 *
 * @deprecated Prefer applyBundledDocumentNotify — kept for Grow regression tests.
 */
export async function applyGrowInvoiceNotify(
  service: SupabaseClient,
  parsed: ParsedBundledDocument,
): Promise<BundledDocumentResult> {
  return applyBundledDocumentNotify(service, parsed);
}
