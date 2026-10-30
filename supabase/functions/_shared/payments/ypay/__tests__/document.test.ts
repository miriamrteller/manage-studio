/**
 * YPay standalone document helpers — pure, no network.
 *
 * Run: deno test --allow-read supabase/functions/_shared/payments/ypay/__tests__/document.test.ts
 */
import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  buildYpayDocumentPayload,
  isRetryableYpayDocumentError,
  METHOD_FIELD,
  parseYpayDocumentResponse,
  YPAY_DOC_TYPE_INVOICE_RECEIPT,
  YPAY_DOC_TYPE_RECEIPT,
  ypayDocTypeForVatType,
  ypayDocumentDate,
} from "../document.ts";

Deno.test("docType follows the tenant's VAT status", () => {
  assertEquals(ypayDocTypeForVatType(1), YPAY_DOC_TYPE_INVOICE_RECEIPT);
  assertEquals(ypayDocTypeForVatType(2), YPAY_DOC_TYPE_INVOICE_RECEIPT);
  assertEquals(ypayDocTypeForVatType("3"), YPAY_DOC_TYPE_RECEIPT);
  assertEquals(ypayDocTypeForVatType(3), YPAY_DOC_TYPE_RECEIPT);
  assertEquals(ypayDocTypeForVatType(null), YPAY_DOC_TYPE_INVOICE_RECEIPT);
  assertEquals(ypayDocTypeForVatType(undefined), YPAY_DOC_TYPE_INVOICE_RECEIPT);
});

Deno.test("payload carries the offline method, gross item and our payment id", () => {
  const body = buildYpayDocumentPayload({
    docType: YPAY_DOC_TYPE_INVOICE_RECEIPT,
    paymentId: "pay-1",
    paymentMethod: "bank_transfer",
    totalAmountMinor: 150050,
    currency: "ils",
    language: "he",
    paidAt: "2026-10-30T20:30:00Z",
    contact: { name: "Dana", email: "dana@example.com", businessId: "515000000" },
    lineName: "תשלום",
    lineDescription: "מקדמה",
  });

  assertEquals(body.docType, 109);
  assertEquals(body.currency, "ILS");
  assertEquals(body.chargeIdentifier, "pay-1");
  assertEquals(body.mail, false);
  assertEquals(body.signDoc, true);
  assertEquals((body.contact as Record<string, unknown>).businessID, "515000000");
  assertEquals((body.items as Record<string, unknown>[])[0].price, 1500.5);
  assertEquals((body.items as Record<string, unknown>[])[0].vatIncluded, true);
  const methods = body[METHOD_FIELD] as Record<string, unknown>[];
  assertEquals(methods.length, 1);
  assertEquals(methods[0].sum, 1500.5);
  assertEquals(methods[0].date, "2026-10-30");
  assertEquals(body.description, "מקדמה");
});

Deno.test("receipt (108) omits the free-text description", () => {
  const body = buildYpayDocumentPayload({
    docType: YPAY_DOC_TYPE_RECEIPT,
    paymentId: "pay-2",
    paymentMethod: "cash",
    totalAmountMinor: 10000,
    currency: "ILS",
    language: "en",
    contact: { name: "Dana", email: "dana@example.com" },
    lineName: "Payment",
    lineDescription: "Balance",
  });
  assertEquals(body.docType, 108);
  assertEquals("description" in body, false);
  assert(!("businessID" in (body.contact as Record<string, unknown>)));
});

Deno.test("document date is the Israel-local day the money arrived", () => {
  // 23:30 UTC on the 30th is already the 31st in Jerusalem.
  assertEquals(ypayDocumentDate("2026-10-30T23:30:00Z"), "2026-10-31");
  assertEquals(ypayDocumentDate("not a date").length, 10);
});

Deno.test("response parser tolerates the documented field spellings", () => {
  assertEquals(parseYpayDocumentResponse({ responseCode: 1, document_id: "55", url: "https://d/55" }), {
    externalDocumentId: "55",
    externalDocumentNumber: "55",
    documentUrl: "https://d/55",
  });
  assertEquals(
    parseYpayDocumentResponse({ responseCode: 1, document: { documentId: 7, documentNumber: "A-7", pdfUrl: "https://d/7" } }),
    { externalDocumentId: "7", externalDocumentNumber: "A-7", documentUrl: "https://d/7" },
  );
  assertEquals(parseYpayDocumentResponse({ responseCode: 1 }), null);
  assertEquals(parseYpayDocumentResponse({ responseCode: 1, document_id: "0" }), null);
});

Deno.test("retry policy: transient vs permanent YPay failures", () => {
  assertEquals(isRetryableYpayDocumentError({ code: 1004 }), true); // token expired
  assertEquals(isRetryableYpayDocumentError({ code: 3001 }), true); // token race
  assertEquals(isRetryableYpayDocumentError({ httpStatus: 503 }), true);
  assertEquals(isRetryableYpayDocumentError({}), true); // network / timeout
  assertEquals(isRetryableYpayDocumentError({ code: 3013 }), false); // payment methods rejected
  assertEquals(isRetryableYpayDocumentError({ code: 3011 }), false); // bad docType
  assertEquals(isRetryableYpayDocumentError({ code: 2003 }), false); // bad credentials
  assertEquals(isRetryableYpayDocumentError({ httpStatus: 400 }), false);
});
