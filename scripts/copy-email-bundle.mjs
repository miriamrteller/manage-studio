#!/usr/bin/env node
/**
 * Copy packages/shared/dist into supabase/functions/_shared/email-dist
 * so Edge deploys include the React Email renderer (monorepo-safe).
 */
import { cpSync, rmSync, mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'packages/shared/dist');
const dest = join(root, 'supabase/functions/_shared/email-dist');

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });

console.log(`Copied email bundle: ${src} -> ${dest}`);

// Point Deno at each module's emitted .d.ts. Without this, `deno check` sees
// the bundle as untyped JS and type-only exports (EmailLanguage, ...) vanish.
// Comment only; no runtime effect.
function addSelfTypes(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { addSelfTypes(path); continue; }
    if (!entry.name.endsWith('.js')) continue;
    const dts = entry.name.replace(/\.js$/, '.d.ts');
    if (!existsSync(join(dir, dts))) continue;
    const code = readFileSync(path, 'utf8');
    if (code.startsWith('/* @ts-self-types=')) continue;
    writeFileSync(path, `/* @ts-self-types="./${dts}" */\n${code}`);
  }
}
addSelfTypes(dest);

// Pre-render HTML shells (React Email cannot run reliably in Deno Edge).
await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), 'build-auth-email-shells.mjs')).href);
await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), 'build-payment-email-shells.mjs')).href);
await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), 'build-enrolment-confirmation-email-shells.mjs')).href);
await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), 'build-admin-announcement-email-shells.mjs')).href);
await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), 'build-photographer-email-shells.mjs')).href);
