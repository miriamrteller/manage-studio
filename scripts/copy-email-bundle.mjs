#!/usr/bin/env node
/**
 * Copy packages/shared/dist into supabase/functions/_shared/email-dist
 * so Edge deploys include the React Email renderer (monorepo-safe).
 */
import { cpSync, rmSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'packages/shared/dist');
const dest = join(root, 'supabase/functions/_shared/email-dist');

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });

console.log(`Copied email bundle: ${src} -> ${dest}`);

// Pre-render HTML shells (React Email cannot run reliably in Deno Edge).
await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), 'build-auth-email-shells.mjs')).href);
await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), 'build-payment-email-shells.mjs')).href);
