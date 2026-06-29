import { getEnv } from "../env.ts";

export type MockConfirmProviderSlug = "mock" | "grow" | "icount";

export type MockConfirmEligibility =
  | { ok: true; providerSlug: MockConfirmProviderSlug }
  | { ok: false };

/** Which provider slug may use confirm-mock-payment for this tenant (mock / GROW_MOCK / ICOUNT_MOCK). */
export function resolveMockConfirmEligibility(
  paymentProvider: string,
  env?: { growMock?: string; icountMock?: string },
): MockConfirmEligibility {
  const growMock = env?.growMock ?? getEnv("GROW_MOCK");
  const icountMock = env?.icountMock ?? getEnv("ICOUNT_MOCK");

  if (paymentProvider === "mock") {
    return { ok: true, providerSlug: "mock" };
  }
  if (paymentProvider === "grow" && growMock === "true") {
    return { ok: true, providerSlug: "grow" };
  }
  if (paymentProvider === "icount" && icountMock === "true") {
    return { ok: true, providerSlug: "icount" };
  }
  return { ok: false };
}
