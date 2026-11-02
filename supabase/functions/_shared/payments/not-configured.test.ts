import { assertEquals } from "jsr:@std/assert@^1";
import { isProviderNotConfiguredError } from "./not-configured.ts";

Deno.test("every provider's missing-credentials error is recognised", () => {
  for (const message of [
    "Grow credentials not configured",
    "Grow page code or user id not configured",
    "iCount credentials not configured",
    "Invoice4U credentials not configured",
    "YPay credentials not configured",
    "Tranzila credentials not configured",
    "Payment provider secret not configured",
  ]) {
    assertEquals(isProviderNotConfiguredError(new Error(message)), true, message);
  }
});

Deno.test("other failures are still errors", () => {
  assertEquals(isProviderNotConfiguredError(new Error("Grow createPaymentProcess failed")), false);
  assertEquals(isProviderNotConfiguredError("not configured"), false);
  assertEquals(isProviderNotConfiguredError(undefined), false);
});
