/**
 * iCount adapter compliance — Tax Delegation guard (#16).
 *
 * Run: deno test --allow-read supabase/functions/_shared/payments/icount/__tests__/document.test.ts
 */

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  parseIcountDocumentWebhook,
  peekIcountDocumentPaymentRef,
} from "../document.ts";

const fixture = [
  {
    doctype: "invrec",
    docnum: "3006",
    totalwithvat: "3251",
    totalvat: "472.37",
    vat_percent: "17",
    pdf_link: "https://example.com/doc.pdf",
    cc_payments: [{ deal_id: "ref_abc", cc_shovar: "455544545" }],
  },
];

Deno.test("parseIcountDocumentWebhook maps official fields without computing tax", () => {
  const parsed = parseIcountDocumentWebhook(fixture, "tenant-uuid");
  assertEquals(parsed.externalDocumentId, "invrec_3006");
  assertEquals(parsed.providerPaymentRef, "ref_abc");
  assertEquals(parsed.documentUrl, "https://example.com/doc.pdf");
});

Deno.test("peekIcountDocumentPaymentRef prefers deal_id", () => {
  assertEquals(peekIcountDocumentPaymentRef(fixture), "ref_abc");
});

Deno.test("COMPLIANCE — document.ts contains no hardcoded VAT computation expressions", async () => {
  const decoder = new TextDecoder();
  const bytes = await Deno.readFile(new URL("../document.ts", import.meta.url));
  const src = decoder.decode(bytes);

  const forbidden = [
    /\/\s*1\.17/,
    /\*\s*0\.17/,
    /vat_rate\s*=\s*0\./,
    /tax_rate\s*=/,
    /totalvat\s*\*/,
  ];

  for (const pattern of forbidden) {
    if (pattern.test(src)) {
      throw new Error(
        `Tax Delegation Doctrine violation: document.ts contains forbidden pattern ${pattern}`,
      );
    }
  }
});
