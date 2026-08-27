#!/usr/bin/env bash
# Reseed the local dev database from scratch.
#
# Wipes the local Supabase DB, re-runs all migrations + supabase/seed.sql
# (creativeballet + studioaviv), then applies the optional demo-tenant seeds.
# Run from the repo root. Requires the Supabase CLI and a running local stack.
#
# Dev accounts created (password for ALL: devPassword123):
#   ALL subdomains                 → miriamrteller@gmail.com        (super_admin — platform owner)
#   creativeballet.localhost:5173  → miriamrstern@gmail.com         (account_holder / parent)
#   studioaviv.localhost:5173      → admin@studioaviv.example.com   (tenant_admin)
#   therapist.localhost:5173       → owner@therapist.test           (tenant_admin)
#   artclass.localhost:5173        → owner@artclass.test            (tenant_admin)
#   photographer.localhost:5173    → owner@photographer.test        (tenant_admin)
#   sofer.localhost:5173           → owner@sofer.test               (tenant_admin)
#
# miriamrteller@gmail.com is the ONE platform-owner account (home tenant:
# creativeballet) and signs in on every subdomain. Every OTHER account works
# ONLY on its own subdomain — anywhere else it must be rejected with
# "This account belongs to a different studio".
#
# Magic links / email codes: local emails never reach real inboxes; read them
# (for any address, @gmail.com included) at http://localhost:54324

set -euo pipefail

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

echo "→ Resetting local database (migrations + supabase/seed.sql)…"
supabase db reset

echo "→ Applying demo tenant seeds…"
for f in seed-therapist seed-artclass seed-photographer seed-sofer; do
  echo "   • $f"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "supabase/$f.sql"
done

echo "✓ Done. Accounts (all devPassword123):"
sed -n '/^# Dev accounts/,/^# Each account/p' "$0" | sed 's/^# \{0,3\}//'
