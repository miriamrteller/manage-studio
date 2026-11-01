import { getEnv } from "../edge-runtime/env.ts";

export type MockConfirmProviderSlug = "mock" | "grow" | "icount" | "invoice4u";

export type MockConfirmEligibility =
  | { ok: true; providerSlug: MockConfirmProviderSlug }
  | { ok: false };

/** Which provider slug may use confirm-mock-payment for this tenant. */
export function resolveMockConfirmEligibility(
  paymentProvider: string,
  env?: { growMock?: string; icountMock?: string; invoice4uMock?: string; ypayMock?: string },
): MockConfirmEligibility {
  const growMock = env?.growMock ?? getEnv("GROW_MOCK");
  const icountMock = env?.icountMock ?? getEnv("ICOUNT_MOCK");
  const invoice4uMock = env?.invoice4uMock ?? getEnv("INVOICE4U_MOCK");
  const ypayMock = env?.ypayMock ?? getEnv("YPAY_MOCK");

  // The "mock" provider confirms a payment without any money moving. Allow it only
  // where mock flags are on (dev/CI). Prod must have none (deploy-prod checks), so a
  // tenant left on "mock" there can never be marked paid by this endpoint.
  const anyMockFlag = [growMock, icountMock, invoice4uMock, ypayMock].some((v) => v === "true");

  if (paymentProvider === "mock" && anyMockFlag) {
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
