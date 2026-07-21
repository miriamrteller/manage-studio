import { getEnv } from "../env.ts";

export type MockConfirmProviderSlug = "mock" | "grow" | "icount" | "invoice4u";

export type MockConfirmEligibility =
  | { ok: true; providerSlug: MockConfirmProviderSlug }
  | { ok: false };

/** Which provider slug may use confirm-mock-payment for this tenant. */
export function resolveMockConfirmEligibility(
  paymentProvider: string,
  env?: { growMock?: string; icountMock?: string; invoice4uMock?: string },
): MockConfirmEligibility {
  const growMock = env?.growMock ?? getEnv("GROW_MOCK");
  const icountMock = env?.icountMock ?? getEnv("ICOUNT_MOCK");
  const invoice4uMock = env?.invoice4uMock ?? getEnv("INVOICE4U_MOCK");

  if (paymentProvider === "mock") {
    return { ok: true, providerSlug: "mock" };
  }
  if (paymentProvider === "grow" && growMock === "true") {
    return { ok: true, providerSlug: "grow" };
  }
  if (paymentProvider === "icount" && icountMock === "true") {
    return { ok: true, providerSlug: "icount" };
  }
  if (paymentProvider === "invoice4u" && invoice4uMock === "true") {
    return { ok: true, providerSlug: "invoice4u" };
  }
  return { ok: false };
}
