import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildClientPaymentProofReminderEmail, buildStudioPaymentProofEmail } from "./email-copy.ts";

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

Deno.test("client screenshot reminder: EN and HE carry the ways and the link", () => {
  const en = buildClientPaymentProofReminderEmail({
    language: "en",
    studioName: "Studio",
    what: "Class card",
    totalFormatted: "₪300.00",
    ways: "• By Bit to 000-000-0000",
    payUrl: "https://studio.example/pay/abc",
  });
  assertEquals(en.subject, "Payment screenshot for Studio");
  assertStringIncludes(en.body, "(Class card, ₪300.00)");
  assertStringIncludes(en.body, "• By Bit to 000-000-0000");
  assertStringIncludes(en.body, "https://studio.example/pay/abc");
  const he = buildClientPaymentProofReminderEmail({
    language: "he",
    studioName: "סטודיו",
    what: "",
    totalFormatted: "",
    ways: "",
    payUrl: "https://studio.example/pay/abc",
  });
  assertStringIncludes(he.body, "עדיין לא קיבלנו צילום מסך של התשלום.");
  assertStringIncludes(he.body, "https://studio.example/pay/abc");
});
