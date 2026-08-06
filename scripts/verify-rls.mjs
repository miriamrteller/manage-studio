/**
 * RLS verification harness.
 *
 * SPEC §7 and the go-live plan both call this out as "the one thing no test
 * covers" and ask for a manual check. Manual checks are not repeatable and do
 * not run in CI, so this automates it.
 *
 * Method: connect as the owner (which bypasses RLS), then for each assertion
 * open a transaction, `SET LOCAL ROLE` to anon/authenticated and set
 * request.jwt.claims so auth.uid() resolves to the user being impersonated.
 * Every policy in this schema keys off auth.uid(), so this exercises the real
 * policies rather than a reimplementation of them.
 *
 * Every "sees nothing" assertion is paired with a POSITIVE CONTROL that must
 * see something. Without that, a broken query or a bad role switch reads as a
 * pass, which is the classic way an RLS suite lies to you.
 *
 * Fixtures: a second family is created in the same tenant, because with only
 * one account "a parent sees only their own family" passes vacuously. They are
 * removed in a finally block.
 *
 *   pnpm verify:rls
 */
import { spawnSync } from 'node:child_process';
import { loadEnv } from './load-env.mjs';
import { resolveConnectableDbUrl } from './lib/psql-dev.mjs';

loadEnv();

const dbUrl = resolveConnectableDbUrl(process.cwd());

const OUTSIDER_PERSON = '11111111-2222-3333-4444-555555555555';
const OUTSIDER_ACCOUNT = '11111111-2222-3333-4444-666666666666';
const FIXTURE = 'rls-harness-outsider';

/** Owner-level query — bypasses RLS. Used for setup and teardown only. */
function sql(statement) {
  const r = spawnSync('psql', ['-d', dbUrl, '-qtAc', statement], {
    encoding: 'utf8',
    shell: false,
  });
  if (r.error) throw new Error(`psql failed to start: ${r.error.message}`);
  if (r.status !== 0) throw new Error((r.stderr || '').trim() || `psql exited ${r.status}`);
  return (r.stdout || '').trim();
}

/**
 * Run a count query with RLS active, impersonating `userId` (null = anon).
 *
 * Returns { rows, denied }. `denied` means the role has no table-level GRANT,
 * so the read was refused before RLS was consulted at all — a *stronger*
 * negative than "RLS filtered it to zero", and it must be reported rather than
 * crashing the run.
 *
 * Multi-statement, so psql emits command tags alongside the result; take the
 * last purely-numeric line.
 */
function asUser(userId, query) {
  const claims = userId ? `'{"sub":"${userId}","role":"authenticated"}'` : `'{"role":"anon"}'`;
  const role = userId ? 'authenticated' : 'anon';
  const statement =
    `BEGIN; SET LOCAL ROLE ${role}; SET LOCAL request.jwt.claims = ${claims}; ${query}; ROLLBACK;`;

  const r = spawnSync('psql', ['-d', dbUrl, '-qtAc', statement], {
    encoding: 'utf8',
    shell: false,
  });
  if (r.error) throw new Error(`psql failed to start: ${r.error.message}`);
  if (r.status !== 0) {
    const err = (r.stderr || '').trim();
    if (/permission denied/i.test(err)) return { rows: 0, denied: true };
    throw new Error(err || `psql exited ${r.status}`);
  }
  const numeric = (r.stdout || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^\d+$/.test(l));
  if (numeric.length === 0) throw new Error(`no numeric result from: ${query}`);
  return { rows: Number(numeric[numeric.length - 1]), denied: false };
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  const mark = ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`  ${mark}  ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Assert a role sees no rows. GRANT-level denial counts, and is noted. */
function expectNone(name, res) {
  check(
    name,
    res.rows === 0,
    res.denied ? 'denied at GRANT level (stronger than RLS)' : res.rows ? `LEAKED ${res.rows} row(s)` : undefined,
  );
}

let created = false;

try {
  const tenantId = sql(`SELECT id FROM tenants WHERE subdomain = 'creativeballet'`);
  const otherTenantId = sql(
    `SELECT id FROM tenants WHERE subdomain <> 'creativeballet' ORDER BY subdomain LIMIT 1`,
  );
  const parentId = sql(
    `SELECT id FROM user_profiles WHERE tenant_id = '${tenantId}'
       AND 'account_holder' = ANY(role) LIMIT 1`,
  );
  const otherAdminId = sql(
    `SELECT id FROM user_profiles WHERE tenant_id = '${otherTenantId}'
       AND 'tenant_admin' = ANY(role) AND NOT ('super_admin' = ANY(role)) LIMIT 1`,
  );

  if (!tenantId || !parentId || !otherAdminId) {
    console.error(
      '\nCannot run: dev needs a creativeballet account_holder and a tenant_admin in\n' +
        'another tenant. Run: pnpm seed:dev -- --all-skins --finance\n',
    );
    process.exit(1);
  }

  console.log(`\nTenant under test : ${tenantId}`);
  console.log(`Parent            : ${parentId}`);
  console.log(`Foreign admin     : ${otherAdminId}\n`);

  sql(
    `INSERT INTO people (id, tenant_id, name) VALUES ('${OUTSIDER_PERSON}','${tenantId}','${FIXTURE}') ON CONFLICT (id) DO NOTHING;` +
      `INSERT INTO accounts (id, tenant_id, person_id) VALUES ('${OUTSIDER_ACCOUNT}','${tenantId}','${OUTSIDER_PERSON}') ON CONFLICT (id) DO NOTHING;`,
  );
  created = true;

  // ---- Parent sees only their own family ----------------------------------
  const own = asUser(parentId, `SELECT count(*) FROM people`);
  check(
    'positive control — parent CAN see their own family',
    own.rows > 0 && !own.denied,
    own.denied ? 'denied at GRANT level — parent cannot read people at all' : `${own.rows} visible`,
  );

  expectNone(
    'parent CANNOT see another family in the same tenant',
    asUser(parentId, `SELECT count(*) FROM people WHERE name = '${FIXTURE}'`),
  );

  // The family boundary is people.account_id — children hang off the account,
  // they are not account_members rows. An earlier version of this assertion used
  // account_members.person_id, which matched only the parent themself and so
  // counted their own children as "another family". Test bug, not a leak.
  expectNone(
    "parent CANNOT see other families' engagements",
    asUser(
      parentId,
      `SELECT count(*) FROM engagements WHERE person_id NOT IN (
         SELECT id FROM people WHERE account_id IN (
           SELECT account_id FROM account_members WHERE user_profile_id = '${parentId}'))`,
    ),
  );

  // ---- Cross-tenant isolation ---------------------------------------------
  const adminOwn = asUser(
    otherAdminId,
    `SELECT count(*) FROM offerings WHERE tenant_id = '${otherTenantId}'`,
  );
  check(
    'positive control — tenant_admin CAN see their own tenant',
    adminOwn.rows > 0 && !adminOwn.denied,
    adminOwn.denied ? 'denied at GRANT level' : `${adminOwn.rows} offering(s)`,
  );

  for (const table of ['people', 'engagements', 'payments', 'accounts']) {
    expectNone(
      `foreign tenant_admin CANNOT see this tenant's ${table}`,
      asUser(otherAdminId, `SELECT count(*) FROM ${table} WHERE tenant_id = '${tenantId}'`),
    );
  }

  // ---- Anonymous -----------------------------------------------------------
  const anonCatalogue = asUser(
    null,
    `SELECT count(*) FROM get_public_offerings_by_subdomain('creativeballet')`,
  );
  check(
    'positive control — anon CAN read the public catalogue',
    anonCatalogue.rows > 0 && !anonCatalogue.denied,
    anonCatalogue.denied ? 'denied — public enrolment would be broken' : `${anonCatalogue.rows} offering(s)`,
  );

  for (const table of ['people', 'engagements', 'payments', 'accounts', 'audit_log', 'user_profiles']) {
    expectNone(`anon CANNOT read ${table}`, asUser(null, `SELECT count(*) FROM ${table}`));
  }

  // ---- Encrypted credentials must never reach a client ---------------------
  // Row access to `tenants` is intentionally broad, so this is enforced by
  // column-level grants (002700). Every secret column follows the *_enc
  // convention; each is checked so a regression in the grant is caught.
  const SECRET_COLUMNS = [
    'payment_provider_secret_enc',
    'payment_provider_webhook_enc',
    'invoicing_api_key_enc',
    'invoicing_secret_enc',
    'google_calendar_access_token_enc',
    'google_calendar_refresh_token_enc',
  ];
  for (const [label, uid] of [
    ['anon', null],
    ['parent', parentId],
    ['foreign admin', otherAdminId],
  ]) {
    for (const col of SECRET_COLUMNS) {
      expectNone(
        `${label} CANNOT read tenants.${col}`,
        asUser(uid, `SELECT count(*) FROM tenants WHERE ${col} IS NOT NULL`),
      );
    }
    expectNone(
      `${label} CANNOT read grow_webhook_secrets`,
      asUser(uid, `SELECT count(*) FROM grow_webhook_secrets`),
    );
  }

  // Positive control: the tenant row itself must still be readable, or every
  // settings form and the branding lookup breaks.
  const tenantRow = asUser(parentId, `SELECT count(*) FROM tenants WHERE id = '${tenantId}'`);
  check(
    'positive control — tenant row still readable (branding/config)',
    tenantRow.rows === 1 && !tenantRow.denied,
    tenantRow.denied ? 'denied — settings forms would break' : `${tenantRow.rows} row`,
  );
} finally {
  if (created) {
    try {
      sql(
        `DELETE FROM accounts WHERE id = '${OUTSIDER_ACCOUNT}';` +
          `DELETE FROM people WHERE id = '${OUTSIDER_PERSON}';`,
      );
    } catch (e) {
      console.error(
        `\n\x1b[33mFixture cleanup failed — delete '${FIXTURE}' by hand: ${e.message}\x1b[0m`,
      );
    }
  }
}

const failed = results.filter((r) => !r.ok);
console.log(
  failed.length === 0
    ? `\n\x1b[32mAll ${results.length} RLS checks passed.\x1b[0m\n`
    : `\n\x1b[31m${failed.length} of ${results.length} RLS checks FAILED.\x1b[0m\n`,
);
process.exit(failed.length === 0 ? 0 : 1);
