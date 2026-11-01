import { assertEquals, assertNotEquals } from "jsr:@std/assert@^1";
import {
  buildManualPaymentCompletion,
  buildOfflineRequestRow,
  isOfflinePaymentMethod,
  offlineRequestPaymentRef,
} from "./manual-payment.ts";
import { isOfflinePaymentProvider, parsePaymentProviderSlug } from "./registry.ts";

const target = {
  tenantId: "t1",
  engagementId: "e1",
  personId: "p1",
  accountId: null,
  offeringId: "o1",
  billingAccountId: "b1",
  totalMinor: 35000,
  currency: "ils",
};

Deno.test("'none' is a valid, offline-only payment provider slug", () => {
  assertEquals(parsePaymentProviderSlug("none"), "none");
  assertEquals(isOfflinePaymentProvider("none"), true);
  assertEquals(isOfflinePaymentProvider("grow"), false);
  assertEquals(parsePaymentProviderSlug(null), "grow");
});

Deno.test("offline request row is a pending manual payment, one per engagement", () => {
  const row = buildOfflineRequestRow(target, "cash");
  assertEquals(row.provider, "manual");
  assertEquals(row.status, "pending");
  assertEquals(row.payment_method, "cash");
  assertEquals(row.currency, "ILS");
  assertEquals(row.total_amount_minor, 35000);
  assertEquals(row.provider_payment_ref, offlineRequestPaymentRef("e1"));
  assertNotEquals(offlineRequestPaymentRef("e1"), offlineRequestPaymentRef("e2"));
});

Deno.test("completing a request records the admin on the row", () => {
  const patch = buildManualPaymentCompletion({
    method: "bank_transfer",
    actorUserId: "admin",
    paidAt: "2026-11-01T00:00:00.000Z",
    totalMinor: 35000,
  });
  assertEquals(patch.status, "succeeded");
  assertEquals(patch.created_by, "admin");
  assertEquals(patch.approved_by, "admin");
});

Deno.test("only cash and bank_transfer are offline methods", () => {
  assertEquals(isOfflinePaymentMethod("cash"), true);
  assertEquals(isOfflinePaymentMethod("bank_transfer"), true);
  assertEquals(isOfflinePaymentMethod("card"), false);
});
