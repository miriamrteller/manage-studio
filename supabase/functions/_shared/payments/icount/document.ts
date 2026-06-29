import type { ParsedBundledDocument } from "../bundled-document.ts";

type IcountDocumentRecord = Record<string, unknown>;

function normalizeIcountDocumentArray(body: unknown): IcountDocumentRecord[] {
  if (Array.isArray(body)) {
    return body.filter((item): item is IcountDocumentRecord =>
      typeof item === "object" && item !== null
    );
  }
  if (typeof body === "object" && body !== null) {
    return [body as IcountDocumentRecord];
  }
  return [];
}

/**
 * Risk #22 — official document webhook has no tenant_id. Peek payment correlation from
 * `cc_payments[].deal_id` (preferred) or `cc_payments[].cc_shovar` (confirmation code).
 */
export function peekIcountDocumentPaymentRef(body: unknown): string | undefined {
  const docs = normalizeIcountDocumentArray(body);
  if (!docs.length) return undefined;

  const ccPayments = docs[0].cc_payments;
  if (!Array.isArray(ccPayments) || !ccPayments.length) return undefined;

  const cc = ccPayments[0] as Record<string, unknown>;
  const dealId = String(cc.deal_id ?? "").trim();
  if (dealId) return dealId;

  const shovar = String(cc.cc_shovar ?? "").trim();
  if (shovar) return shovar;

  return undefined;
}

/**
 * Parse an iCount document webhook JSON array into bundled document fields.
 * Pure — no network — fixture-driven for I2a.
 */
export function parseIcountDocumentWebhook(
  body: unknown,
  tenantId: string,
): ParsedBundledDocument {
  const docs = normalizeIcountDocumentArray(body);
  if (!docs.length) {
    throw new Error("iCount document webhook expected non-empty document array");
  }

  const doc = docs[0];
  const doctype = String(doc.doctype ?? "").trim();
  const docnum = String(doc.docnum ?? "").trim();
  if (!doctype || !docnum) {
    throw new Error("iCount document webhook missing doctype or docnum");
  }

  const providerPaymentRef = peekIcountDocumentPaymentRef(body);
  if (!providerPaymentRef) {
    throw new Error("iCount document webhook missing payment correlation in cc_payments");
  }

  const pdfLink = doc.pdf_link != null ? String(doc.pdf_link) : undefined;
  const docLink = doc.doc_link != null ? String(doc.doc_link) : undefined;

  return {
    tenantId,
    providerPaymentRef,
    externalDocumentId: `${doctype}_${docnum}`,
    externalDocumentNumber: docnum,
    documentUrl: pdfLink ?? docLink,
  };
}

/** Build a mock iCount document webhook body for CI after confirm-mock-payment. */
export function buildMockIcountDocumentWebhookBody(params: {
  providerPaymentRef: string;
  doctype?: string;
  docnum?: string;
}): unknown[] {
  return [
    {
      doctype: params.doctype ?? "invrec",
      docnum: params.docnum ?? "3006",
      doc_link: "https://mock.icount.local/docs/example",
      pdf_link: "https://mock.icount.local/docs/example.pdf",
      cc_payments: [
        {
          deal_id: params.providerPaymentRef,
          cc_shovar: params.providerPaymentRef,
        },
      ],
    },
  ];
}
