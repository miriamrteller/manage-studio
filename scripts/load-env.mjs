/**
 * Load repo-root .env (and optional apps/web/.env.local) into process.env.
 * Existing shell env vars take precedence.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return;

  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function loadEnv() {
  parseEnvFile(resolve(repoRoot, '.env'));
  parseEnvFile(resolve(repoRoot, 'apps/web/.env.local'));

  if (!process.env.SUPABASE_URL && process.env.VITE_SUPABASE_URL) {
    process.env.SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  }

  if (!process.env.SUPABASE_PROJECT_REF && process.env.SUPABASE_URL) {
    const match = process.env.SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/);
    if (match) {
      process.env.SUPABASE_PROJECT_REF = match[1];
    }
  }
}
