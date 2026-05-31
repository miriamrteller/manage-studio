#!/usr/bin/env node
/**
 * Render a React Email template to tmp/email-preview.html for local review.
 *
 * Usage:
 *   pnpm email:preview magic_link
 *   pnpm email:preview magic_link --lang he
 *   pnpm email:preview otp --lang en
 *   pnpm email:preview welcome
 *
 * Run `pnpm -C packages/shared build` first if templates changed.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function parseArgs(argv) {
  const positional = [];
  let language = 'en';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--lang' || arg === '-l') {
      language = argv[++i] ?? 'en';
      continue;
    }
    if (arg.startsWith('--lang=')) {
      language = arg.slice('--lang='.length);
      continue;
    }
    if (arg.startsWith('-')) {
      console.error(`Unknown flag: ${arg}`);
      process.exit(1);
    }
    positional.push(arg);
  }

  if (language !== 'en' && language !== 'he') {
    console.error(`Invalid --lang "${language}". Use "en" or "he".`);
    process.exit(1);
  }

  return {
    templateName: positional[0] ?? 'magic_link',
    language,
  };
}

const { templateName, language } = parseArgs(process.argv.slice(2));

const renderModuleUrl = pathToFileURL(
  join(root, 'packages/shared/dist/email/render-template.js'),
).href;

const { EMAIL_TEMPLATE_NAMES, renderEmailTemplate } = await import(renderModuleUrl);

const samples = {
  [EMAIL_TEMPLATE_NAMES.MAGIC_LINK]: {
    schoolName: 'Creative Ballet Academy',
    variables: {
      magicLinkUrl: 'http://localhost:5173/auth/callback?code=preview',
      otpCode: '123456',
      expiresInMinutes: 15,
      recipientName: 'Miriam',
    },
  },
  [EMAIL_TEMPLATE_NAMES.OTP]: {
    schoolName: 'Creative Ballet Academy',
    variables: {
      otpCode: '482910',
      code: '482910',
      expiresInMinutes: 10,
      recipientName: 'Miriam',
      usageContext: 'email_verification',
    },
  },
  [EMAIL_TEMPLATE_NAMES.WELCOME]: {
    schoolName: 'Creative Ballet Academy',
    variables: {
      recipientName: 'Miriam',
      enrolledClassName: 'Ballet Beginners',
      enrolledTermName: 'Spring 2026',
      dashboardUrl: 'http://localhost:5173/dashboard',
    },
  },
  [EMAIL_TEMPLATE_NAMES.PAYMENT_REMINDER]: {
    schoolName: 'Creative Ballet Academy',
    variables: {
      recipientName: 'Miriam',
      amountOutstandingFormatted: '₪450.00',
      enrolledClassName: 'Ballet Beginners',
      dueDate: 'June 1, 2026',
      paymentUrl: 'http://localhost:5173/pay/preview',
    },
  },
  [EMAIL_TEMPLATE_NAMES.CLASS_CANCELLATION]: {
    schoolName: 'Creative Ballet Academy',
    variables: {
      recipientName: 'Miriam',
      cancelledClassName: 'Ballet Beginners',
      cancelledDate: 'May 28, 2026',
      cancellationReason: 'Instructor illness',
    },
  },
  [EMAIL_TEMPLATE_NAMES.WAITING_LIST_OFFER]: {
    schoolName: 'Creative Ballet Academy',
    variables: {
      recipientName: 'Miriam',
      className: 'Ballet Beginners',
      termName: 'Spring 2026',
      availableSlots: 1,
      offerExpiryDate: 'May 29, 2026',
      enrollNowUrl: 'http://localhost:5173/enrol/preview',
    },
  },
};

const sample = samples[templateName];
if (!sample) {
  console.error(
    `Unknown template "${templateName}". Choose one of: ${Object.keys(samples).join(', ')}`,
  );
  process.exit(1);
}

const { html, subject } = await renderEmailTemplate({
  templateName,
  language,
  schoolName: sample.schoolName,
  tenantColors: {
    primary_color: '#76335a',
    accent_color: '#e99ac4',
  },
  variables: sample.variables,
});

const outDir = join(root, 'tmp');
await mkdir(outDir, { recursive: true });
const outPath = join(outDir, `email-preview-${templateName}-${language}.html`);
await writeFile(outPath, html, 'utf8');

console.log(`Language: ${language}`);
console.log(`Subject: ${subject}`);
console.log(`Written: ${outPath}`);
console.log('Open the file in a browser to preview.');
