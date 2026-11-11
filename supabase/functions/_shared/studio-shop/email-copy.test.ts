import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildFamilyShopOrderReadyEmail, buildStudioShopOrderPaidEmail } from "./email-copy.ts";

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
