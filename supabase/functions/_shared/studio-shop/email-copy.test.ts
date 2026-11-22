import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildBuyerShopOrderPlacedEmail,
  buildFamilyShopOrderReadyEmail,
  buildStudioShopOrderPaidEmail,
  buildStudioShopOrderSentInEmail,
} from "./email-copy.ts";

const lines = [
  { name: "Black leotard", size: "Age 4-6", quantity: 2 },
  { name: "Hair net", size: "One size", quantity: 1 },
];

Deno.test("studio email lists the items with sizes and quantities, and the shop link", () => {
  const e = buildStudioShopOrderPaidEmail({
    language: "en", forName: "Noa", totalFormatted: "₪255.00", lines, shopUrl: "https://studio.example/admin/shop",
  });
  assertEquals(e.subject, "New shop order: Noa");
  assert(e.body.includes("• Black leotard (Age 4-6) ×2\n• Hair net\n"));
  assert(e.body.includes("₪255.00"));
  assert(e.body.endsWith("https://studio.example/admin/shop"));
  const he = buildStudioShopOrderPaidEmail({ language: "he", forName: "נועה", totalFormatted: "₪255", lines, shopUrl: "u" });
  assertEquals(he.subject, "הזמנה חדשה מהחנות: נועה");
  assert(he.body.includes("• Black leotard (מידה Age 4-6) ×2"));
});

Deno.test("family email says where to collect and links to the account", () => {
  const e = buildFamilyShopOrderReadyEmail({
    language: "en", studioName: "Creative Dance", forName: "Noa", lines, portalUrl: "https://studio.example/dashboard/portal",
  });
  assertEquals(e.subject, "Your order is ready to collect");
  assert(e.body.startsWith("The order for Noa is ready to collect at Creative Dance."));
  assert(e.body.endsWith("https://studio.example/dashboard/portal"));
  const he = buildFamilyShopOrderReadyEmail({ language: "he", studioName: "סטודיו", forName: "נועה", lines, portalUrl: "p" });
  assertEquals(he.subject, "ההזמנה שלך מוכנה לאיסוף");
});

Deno.test("public Shop page buyer, card: the pay link and the 48-hour hold", () => {
  const e = buildBuyerShopOrderPlacedEmail({
    language: "en", studioName: "Studio", buyerName: "Test Buyer", totalFormatted: "₪255.00", lines,
    payByCash: false, payUrl: "https://studio.example/pay/tok",
  });
  assertEquals(e.subject, "Your order from Studio");
  assert(e.body.includes("https://studio.example/pay/tok"));
  assert(e.body.includes("48 hours"));
  assert(e.body.includes("• Black leotard (Age 4-6) ×2"));
});

Deno.test("public Shop page buyer, paying the studio directly: how to pay, no pay link", () => {
  for (const language of ["en", "he"] as const) {
    const e = buildBuyerShopOrderPlacedEmail({
      language, studioName: "Studio", buyerName: "Test Buyer", totalFormatted: "₪255.00", lines,
      payByCash: true, payUrl: null,
    });
    assert(!e.body.includes("/pay/"));
    assert(!e.body.includes("48"));
    assert(e.body.includes(language === "he" ? "ישירות לסטודיו" : "pay the studio directly"));
  }
});

Deno.test("studio email for a direct-payment order: buyer's contact details and the button to press", () => {
  const e = buildStudioShopOrderSentInEmail({
    language: "en", buyerName: "Test Buyer", buyerEmail: "buyer@example.test", buyerPhone: "050-0000000",
    totalFormatted: "₪255.00", lines, shopUrl: "https://studio.example/admin/shop/studio",
  });
  assertEquals(e.subject, "New shop order: Test Buyer");
  assert(e.body.includes("buyer@example.test, 050-0000000"));
  assert(e.body.includes('"Record cash payment"'));
  const he = buildStudioShopOrderSentInEmail({
    language: "he", buyerName: "Test Buyer", buyerEmail: "buyer@example.test", buyerPhone: null,
    totalFormatted: "₪255.00", lines, shopUrl: "https://studio.example/admin/shop/studio",
  });
  assert(he.body.includes("(buyer@example.test)"));
  assert(he.body.includes("רישום תשלום במזומן"));
});
