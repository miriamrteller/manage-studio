// Vitest stub for the Deno `https://esm.sh/stripe@...` specifier used by edge functions.
// The Stripe SDK is only instantiated for slug==='stripe'; tests that import the payment
// factory for other providers just need this module to resolve.
export default class Stripe {
  constructor() {}
}
