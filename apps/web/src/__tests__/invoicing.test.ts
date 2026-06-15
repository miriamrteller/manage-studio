import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  backoffMinutes,
  backoffScheduledFor,
  MAX_DOCUMENT_ATTEMPTS,
  STALE_PROCESSING_MINUTES,
} from "../../../../supabase/functions/_shared/invoicing/backoff.ts";
import { MockInvoicingProvider } from "../../../../supabase/functions/_shared/invoicing/providers/mock.ts";
import { giDocumentTypeForKind } from "./invoicing-gi-mapper.ts";

const InvoicingProviderSlugSchema = z.enum(["green_invoice", "mock"]);

describe("invoicing backoff", () => {
  it("uses exponential delay capped at 60 minutes", () => {
    expect(backoffMinutes(0)).toBe(1);
    expect(backoffMinutes(1)).toBe(2);
    expect(backoffMinutes(5)).toBe(32);
    expect(backoffMinutes(10)).toBe(60);
  });

  it("schedules retry from a fixed timestamp", () => {
    const from = new Date("2026-06-15T12:00:00.000Z");
    expect(backoffScheduledFor(2, from)).toBe("2026-06-15T12:04:00.000Z");
  });

  it("dead-letters after max attempts", () => {
    expect(MAX_DOCUMENT_ATTEMPTS).toBe(5);
    expect(STALE_PROCESSING_MINUTES).toBe(15);
  });
});

describe("MockInvoicingProvider", () => {
  const provider = new MockInvoicingProvider();

  it("returns deterministic mock document ids", async () => {
    const result = await provider.issueDocument({} as never, {
      tenantId: "t1",
      paymentId: "00000000-0000-0000-0000-000000000099",
      documentKind: "sale",
      language: "he",
      currency: "ILS",
      pretaxAmountMinor: 100,
      vatAmountMinor: 17,
      totalAmountMinor: 117,
      vatRate: 0.17,
      payer: { name: "Test Payer" },
    });
    expect(result.externalDocumentNumber).toContain("MOCK-INV");
    expect(result.documentUrl).toContain("mock.invoicing.local");
  });

  it("uses credit-note prefix for refunds", async () => {
    const result = await provider.issueDocument({} as never, {
      tenantId: "t1",
      paymentId: "00000000-0000-0000-0000-000000000088",
      documentKind: "refund",
      language: "en",
      currency: "ILS",
      pretaxAmountMinor: -100,
      vatAmountMinor: -17,
      totalAmountMinor: -117,
      vatRate: 0.17,
      payer: { name: "Test Payer" },
    });
    expect(result.externalDocumentNumber).toContain("MOCK-CN");
  });
});

describe("invoicing registry slugs", () => {
  it("accepts known provider slugs", () => {
    expect(InvoicingProviderSlugSchema.parse("mock")).toBe("mock");
    expect(InvoicingProviderSlugSchema.parse("green_invoice")).toBe("green_invoice");
  });

  it("rejects unknown slugs", () => {
    expect(() => InvoicingProviderSlugSchema.parse("xero")).toThrow();
  });
});

describe("Green Invoice document type mapper", () => {
  it("maps sale and refund kinds", () => {
    expect(giDocumentTypeForKind("sale")).toBe(320);
    expect(giDocumentTypeForKind("refund")).toBe(330);
  });
});
