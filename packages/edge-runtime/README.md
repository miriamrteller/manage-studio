# @opalswift/edge-runtime

Deno-only infrastructure helpers for Supabase Edge Functions.

**Do not import this package from the React app or any Node.js code.**  
These files use Deno-specific globals (`Deno.env`, `crypto.subtle`, etc.).

## Contents
- `src/cors.ts` — CORS headers + response helpers
- `src/env.ts` — Environment variable reader (Deno + Node compatible)
- `src/hmac.ts` — HMAC-SHA256 signing and SHA-256 hashing
- `src/supabase.ts` — Supabase service + user client factories
