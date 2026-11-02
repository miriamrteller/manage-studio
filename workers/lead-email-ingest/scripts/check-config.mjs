// Refuses a wrangler.jsonc whose CRM_INGEST_URL is not the prod
// crm-lead-ingest function. Run by deploy-lead-email before any approval.
import { readFileSync } from 'node:fs';

const PROD_URL = 'https://oogxajjanbyqhljxcmql.supabase.co/functions/v1/crm-lead-ingest';
const file = new URL('../wrangler.jsonc', import.meta.url);
const text = readFileSync(file, 'utf8')
  .split('\n')
  .map((line) => line.replace(/^\s*\/\/.*$/, ''))
  .join('\n');

const urls = [...text.matchAll(/"CRM_INGEST_URL"\s*:\s*"([^"]*)"/g)].map((m) => m[1]);
const name = text.match(/"name"\s*:\s*"([^"]*)"/)?.[1];
const errors = [];
if (name !== 'lead-email-ingest') errors.push(`worker name is "${name}", expected "lead-email-ingest"`);
if (urls.length !== 1) errors.push(`expected exactly one CRM_INGEST_URL, found ${urls.length}`);
else if (urls[0] !== PROD_URL) errors.push(`CRM_INGEST_URL is ${urls[0]}, expected the prod function ${PROD_URL}`);
if (/"env"\s*:/.test(text)) errors.push('wrangler "env" blocks are not used for this worker (one environment: prod)');

if (errors.length) {
  for (const e of errors) console.error(`::error::wrangler.jsonc: ${e}`);
  process.exit(1);
}
console.log(`wrangler.jsonc OK: lead-email-ingest → ${PROD_URL}`);
