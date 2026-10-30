# Browser-only demo build

A clickable demo of the photographer version that runs entirely in the browser:
no Supabase, no Cloudflare, no emails, no payments.

```sh
VITE_DEMO_MODE=true pnpm --filter web build   # output: apps/web/dist-demo/
```

`dist-demo/` is a static site with relative asset paths and hash routing, so it
works from any URL (it is published as a claude.ai Artifact).

## How it works

`vite.config.ts` only adds the `demo-mode` plugin when `VITE_DEMO_MODE=true`:

- imports of `src/lib/supabase.ts` resolve to `src/demo/supabase.ts`, an
  in-memory client (`fakeSupabase.ts`) seeded from `seed.ts`;
- `src/lib/resolveTenantSubdomain.ts` resolves to a version that always returns
  the demo photographer tenant;
- `react-router-dom`'s `createBrowserRouter` becomes `createHashRouter`, and
  `window.location.href = '/…'` navigations become hash navigations;
- `@stripe/stripe-js` is stubbed, so the page makes no external requests;
- the HTML entry becomes `src/demo/main.tsx`, which adds the demo bar
  (banner, Photographer/Client switch, sent-messages outbox, gallery and
  invoice previews).

Without the flag nothing in `src/demo/` is imported, and the production build
output is byte-identical.

## Files

| File | Purpose |
|---|---|
| `fakeSupabase.ts` | Query builder (filters, embeds, counts, writes), auth, rpc, functions |
| `seed.ts` | Studio, packages, clients, shoots at every stage, leads, payment requests (dates relative to today) |
| `rpcs.ts`, `functions.ts` | In-browser versions of the RPCs and Edge Functions the photographer screens call |
| `extensions.ts` | Later features (payment requests, gallery gating, quotes) |
| `rls.ts` | Simulated row-level security for the client view |
| `images/` | Demo photos, `manifest.ts`, `CREDITS.md` (Unsplash License; no people) |

Append `?demo-debug` before the `#` to log every fake query to the console.
