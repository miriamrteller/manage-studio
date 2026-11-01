import { assertEquals } from "jsr:@std/assert@^1";
import { resolveMockConfirmEligibility } from "./mock-confirm-eligibility.ts";

const off = { growMock: "", icountMock: "", invoice4uMock: "", ypayMock: "" };

Deno.test("mock provider is refused when no mock flag is on (prod)", () => {
  assertEquals(resolveMockConfirmEligibility("mock", off), { ok: false });
});

Deno.test("mock provider is allowed when a mock flag is on (dev)", () => {
  assertEquals(resolveMockConfirmEligibility("mock", { ...off, ypayMock: "true" }), {
    ok: true,
    providerSlug: "mock",
  });
});

Deno.test("grow needs GROW_MOCK", () => {
  assertEquals(resolveMockConfirmEligibility("grow", off), { ok: false });
  assertEquals(resolveMockConfirmEligibility("grow", { ...off, growMock: "true" }).ok, true);
});
