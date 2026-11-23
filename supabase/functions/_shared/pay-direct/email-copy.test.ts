import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildStudioPaymentProofEmail } from "./email-copy.ts";

Deno.test("studio payment screenshot email: EN names client, what, amount, way and link", () => {
  const e = buildStudioPaymentProofEmail({
    language: "en",
    clientName: "A client",
    what: "Ballet, Sundays",
    totalFormatted: "₪250.00",
    payHow: "by Bit",
    proofsUrl: "https://studio.example/admin/finance/payments",
  });
  assertEquals(e.subject, "Payment screenshot: A client");
  assertStringIncludes(e.body, "their payment by Bit for Ballet, Sundays, ₪250.00 in total");
  assertStringIncludes(e.body, "https://studio.example/admin/finance/payments");
});

Deno.test("studio payment screenshot email: HE", () => {
  const e = buildStudioPaymentProofEmail({
    language: "he",
    clientName: "לקוח",
    what: "בלט",
    totalFormatted: "‏250 ₪",
    payHow: "בביט",
    proofsUrl: "https://studio.example/admin/finance/payments",
  });
  assertStringIncludes(e.subject, "צילום מסך של תשלום");
  assertStringIncludes(e.body, "התשלום בביט עבור בלט");
});
