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
  assertEquals(body.mail, false);
  assertEquals(body.rounding, false);
  assertEquals(body.signDoc, true);
  assertEquals(body.details, "מקדמה · #pay-1");
  assertEquals((body.contact as Record<string, unknown>).businessID, "515000000");
  assertEquals((body.items as Record<string, unknown>[])[0].price, 1500.5);
  assertEquals((body.items as Record<string, unknown>[])[0].vatIncluded, true);
  const methods = body[METHOD_FIELD] as Record<string, unknown>[];
  assertEquals(methods.length, 1);
  // v2.1 Payment Methods table: 2 = העברה בנקאית.
  assertEquals(methods[0], { type: 2, total: 1500.5, date: "2026-10-30" });
  assert(!("chargeIdentifier" in body));
  assert(!("closeDoc" in body));
});

Deno.test("cash receipt (108) uses method type 1 and still carries the gross item", () => {
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
  assertEquals((body[METHOD_FIELD] as Record<string, unknown>[])[0].type, 1);
  assertEquals((body.items as Record<string, unknown>[])[0].price, 100);
  assertEquals((body[METHOD_FIELD] as Record<string, unknown>[])[0].total, 100);
  assertEquals(body.details, "Balance · #pay-2");
  assert(!("businessID" in (body.contact as Record<string, unknown>)));
});

Deno.test("document date is the Israel-local day the money arrived", () => {
  // 23:30 UTC on the 30th is already the 31st in Jerusalem.
  assertEquals(ypayDocumentDate("2026-10-30T23:30:00Z"), "2026-10-31");
  assertEquals(ypayDocumentDate("not a date").length, 10);
});

Deno.test("response parser reads the v2.1 shape and the callback spelling", () => {
  assertEquals(
    parseYpayDocumentResponse({
      responseCode: 1,
      url: "https://ypay.co.il/fsrv/business/1658/customers/44/official/12ca76.pdf",
      serial_number: "900061",
    }),
    {
      externalDocumentId: "900061",
      externalDocumentNumber: "900061",
      documentUrl: "https://ypay.co.il/fsrv/business/1658/customers/44/official/12ca76.pdf",
    },
  );
  assertEquals(parseYpayDocumentResponse({ responseCode: 1, document_id: 55, url: "https://d/55" }), {
    externalDocumentId: "55",
    externalDocumentNumber: "55",
    documentUrl: "https://d/55",
  });
  assertEquals(parseYpayDocumentResponse({ responseCode: 1 }), null);
  assertEquals(parseYpayDocumentResponse({ responseCode: 1, serial_number: "0" }), null);
});

Deno.test("retry policy: transient vs permanent YPay failures", () => {
  assertEquals(isRetryableYpayDocumentError({ code: 1004 }), true); // token expired
  assertEquals(isRetryableYpayDocumentError({ code: 2002 }), true); // token already active
  assertEquals(isRetryableYpayDocumentError({ code: 3006 }), true); // document general error
  assertEquals(isRetryableYpayDocumentError({ httpStatus: 503 }), true);
  assertEquals(isRetryableYpayDocumentError({}), true); // network / timeout
  assertEquals(isRetryableYpayDocumentError({ code: 3011 }), false); // payment methods missing
  assertEquals(isRetryableYpayDocumentError({ code: 3013 }), false); // method total invalid
  assertEquals(isRetryableYpayDocumentError({ code: 3022 }), false); // items ≠ methods total
  assertEquals(isRetryableYpayDocumentError({ code: 3001 }), false); // bad docType
  assertEquals(isRetryableYpayDocumentError({ code: 3007 }), false); // Tax Authority rejected
  assertEquals(isRetryableYpayDocumentError({ code: 2001 }), false); // bad credentials
  assertEquals(isRetryableYpayDocumentError({ code: 5003 }), false); // invalid email
  assertEquals(isRetryableYpayDocumentError({ httpStatus: 400 }), false);
});
