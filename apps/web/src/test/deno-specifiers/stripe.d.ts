// Types for the `https://esm.sh/stripe@...` specifier under tsconfig.test.json.
// Tests never call Stripe (see stripe-esm-stub.ts); Deno checks the real SDK types.
declare class Stripe {
  constructor(...args: any[]);
  [key: string]: any;
}
declare namespace Stripe {
  type PaymentIntent = any;
}
export default Stripe;
