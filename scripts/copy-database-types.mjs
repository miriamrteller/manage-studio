#!/usr/bin/env node
/**
 * Copy generated Supabase types into the Edge Functions email-dist bundle.
 */
import { copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'packages/shared/src/database.types.ts');
const dest = join(root, 'supabase/functions/_shared/email-dist/database.types.d.ts');

copyFileSync(src, dest);
console.log(`Copied database types: ${src} -> ${dest}`);
