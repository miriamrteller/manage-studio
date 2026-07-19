/**
 * seed-yesh-vault.ts — Yesh Invoice vault secret template for Creative Ballet dev tenant
 *
 * USAGE:
 *   1. Copy this file to scripts/seed-yesh-vault.local.ts   (gitignored — never commit)
 *   2. Replace <YESH_USER_KEY> and <YESH_SECRET_KEY> with the real dev credentials
 *   3. Run:
 *        SUPABASE_URL=http://127.0.0.1:54321 \
 *        SUPABASE_SERVICE_ROLE_KEY=<your-local-service-role-key> \
 *        deno run --allow-env --allow-net scripts/seed-yesh-vault.local.ts
 *
 * Vault path convention (mirrors Tranzila pattern):
 *   secret/tenants/{tenantId}/yesh#api_key
 *   secret/tenants/{tenantId}/yesh#secret_key
 *
 * TenantProviderConfig.yesh_config.api_key_ref  → "vault:secret/tenants/{id}/yesh#api_key"
 * TenantProviderConfig.yesh_config.secret_key_ref → "vault:secret/tenants/{id}/yesh#secret_key"
 *
 * DO NOT commit the .local.ts variant — add *.local.ts to .gitignore
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL            = Deno.env.get("SUPABASE_URL")            ?? "http://127.0.0.1:54321";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TENANT_ID               = "00000000-0000-0000-0000-000000000001"; // Creative Ballet

// ─── FILL THESE IN (in your .local.ts copy only) ───────────────────────────
const YESH_API_KEY    = "<YESH_USER_KEY>";   // user_key / api_key for YeshInvoiceAdapter
const YESH_SECRET_KEY = "<YESH_SECRET_KEY>"; // secret_key for request signing
// ────────────────────────────────────────────────────────────────────────────

if (YESH_API_KEY.startsWith("<") || YESH_SECRET_KEY.startsWith("<")) {
  console.error("❌  Fill in YESH_API_KEY and YESH_SECRET_KEY before running this script.");
  Deno.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const secrets = [
  {
    name:        `secret/tenants/${TENANT_ID}/yesh#api_key`,
    secret:      YESH_API_KEY,
    description: "Yesh Invoice API key (user_key) — Creative Ballet dev tenant",
  },
  {
    name:        `secret/tenants/${TENANT_ID}/yesh#secret_key`,
    secret:      YESH_SECRET_KEY,
    description: "Yesh Invoice secret key — Creative Ballet dev tenant",
  },
];

for (const s of secrets) {
  // Check if the secret already exists
  const { data: existing } = await supabase
    .from("vault.secrets")
    .select("id")
    .eq("name", s.name)
    .maybeSingle();

  if (existing) {
    console.log(`⏭  Skipped (already exists): ${s.name}`);
    continue;
  }

  const { error } = await supabase.rpc("vault_upsert_secret", {
    p_name:        s.name,
    p_secret:      s.secret,
    p_description: s.description,
  });

  if (error) {
    // Fallback: try vault.create_secret directly via raw SQL
    const { error: sqlError } = await supabase.rpc("exec_sql", {
      sql: `SELECT vault.create_secret(${supabase.sql`${s.secret}`}, ${supabase.sql`${s.name}`}, ${supabase.sql`${s.description}`});`,
    });
    if (sqlError) {
      console.error(`❌  Failed to insert ${s.name}:`, sqlError.message);
    } else {
      console.log(`✅  Inserted: ${s.name}`);
    }
  } else {
    console.log(`✅  Inserted: ${s.name}`);
  }
}

console.log("\nDone. Re-run seed.sql after this to pick up the updated tenant config.");
