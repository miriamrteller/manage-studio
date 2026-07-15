/**
 * Apply specific pending migrations to the linked remote DB when `supabase db push`
 * is unavailable. Records versions in supabase_migrations.schema_migrations.
 */
import { spawnSync } from 'node:child_process';
import { loadEnv } from './load-env.mjs';
import { resolveConnectableDbUrl, runPsqlQuery } from './lib/psql-dev.mjs';

loadEnv();

const dbUrl = resolveConnectableDbUrl();
const migrations = process.argv.slice(2);
if (migrations.length === 0) {
  console.error('Usage: node scripts/apply-pending-migrations.mjs <migration-file> [...]');
  process.exit(1);
}

for (const file of migrations) {
  const version = file.match(/(\d{14})/)?.[1];
  if (!version) {
    console.error('Could not parse version from', file);
    process.exit(1);
  }

  const already = runPsqlQuery(
    dbUrl,
    `SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '${version}';`,
  );
  if (already === '1') {
    console.log('Skip (already applied):', version);
    continue;
  }

  console.log('Applying', version, '...');
  const result = spawnSync('psql', ['-d', dbUrl, '-v', 'ON_ERROR_STOP=1', '-f', file], {
    encoding: 'utf8',
    shell: false,
  });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(1);
  }

  runPsqlQuery(
    dbUrl,
    `INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('${version}') ON CONFLICT DO NOTHING;`,
  );
  console.log('OK', version);
}

console.log('Done.');
