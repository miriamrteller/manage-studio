#!/usr/bin/env node
/**
 * STILLS — four full-page PNGs at 2x device scale.
 *
 *   01-parent-portal.png     Dana's portal: Maya + Noa listed (mobile)
 *   02-age-rule-blocked.png  Noa's DOB in the add-child form with Ballet
 *                            preselected → amber age block + "Request studio
 *                            review" form in the same frame (mobile)
 *   03-duplicate-blocked.png Dana re-enrolling Maya in Ballet → blocked at
 *                            checkout before any payment UI (mobile)
 *   04-admin-cash-payment.png Tamar records a walk-in cash payment, then the
 *                            payments log's detail drawer shows Method: Cash +
 *                            the generated invoice document (desktop)
 *
 * Each still runs in a fresh browser context. Test-mode labels (mock payment
 * hints, test-card copy) are deliberately left visible.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BASE_URL, OUTPUT, SEED, STILL_DEVICE_SCALE, UI, VIEWPORT } from './config.mjs';
import {
  chromium,
  ensureDevServer,
  fieldset,
  gotoWarm,
  login,
  pinEnglish,
  signWaiver,
  verifyFixture,
} from './lib/browser.mjs';

const HEADED = process.env.HEADED === '1';

async function newPage(browser, viewport) {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport,
    deviceScaleFactor: STILL_DEVICE_SCALE,
    locale: 'en-US',
    timezoneId: 'Asia/Jerusalem',
  });
  await pinEnglish(context);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  return { context, page };
}

async function shoot(page, filename) {
  const path = join(OUTPUT.stillsDir, filename);
  await page.screenshot({ path, fullPage: true });
  console.log(`Captured ${filename}`);
}

/** From /classes, tap the Ballet card as the signed-in parent. */
async function openBalletWizard(page) {
  await gotoWarm(page, '/classes');
  const listToggle = page.getByRole('button', { name: UI.viewList, exact: true });
  const enrolBtn = page.getByRole('button', { name: UI.enrolCta });
  await Promise.race([listToggle.waitFor(), enrolBtn.waitFor()]);
  if (!(await enrolBtn.isVisible().catch(() => false))) {
    await listToggle.click();
  }
  await enrolBtn.click();
  await page.waitForURL(/\/enrol/);
}

// --- 01: parent portal ------------------------------------------------------
async function captureParentPortal(browser) {
  const { context, page } = await newPage(browser, VIEWPORT.mobile);
  try {
    await login(page, SEED.parent.email, SEED.parent.password);
    await gotoWarm(page, '/dashboard/portal');
    await page.getByText(UI.myChildren).waitFor();
    await page.getByText(SEED.children.maya.name).first().waitFor();
    await page.getByText(SEED.children.noa.name).first().waitFor();
    await page.waitForLoadState('networkidle');
    await shoot(page, '01-parent-portal.png');
  } finally {
    await context.close();
  }
}

// --- 02: age-rule block + request-exception affordance ----------------------
async function captureAgeRuleBlocked(browser) {
  const { context, page } = await newPage(browser, VIEWPORT.mobile);
  try {
    await login(page, SEED.parent.email, SEED.parent.password);
    await openBalletWizard(page);

    // The select-student list shows Maya/Noa; the block + review form live in
    // the add-child form, so open it and enter Noa's details.
    await page.getByRole('button', { name: UI.addNewChild }).click();
    const studentName = page
      .locator('fieldset')
      .first()
      .locator('input[type="text"]')
      .first();
    await studentName.waitFor();
    await studentName.fill(SEED.children.noa.name);
    await page.locator('input[type="date"]').first().fill(SEED.children.noa.dob);

    // Amber block + "Request studio review" must both be in frame.
    await page.getByRole('alert').filter({ hasText: /age|years/i }).first().waitFor();
    await page.getByRole('button', { name: UI.requestReview }).waitFor();
    await shoot(page, '02-age-rule-blocked.png');
  } finally {
    await context.close();
  }
}

// --- 03: duplicate enrolment blocked before payment -------------------------
async function captureDuplicateBlocked(browser) {
  const { context, page } = await newPage(browser, VIEWPORT.mobile);
  try {
    await login(page, SEED.parent.email, SEED.parent.password);
    await openBalletWizard(page);

    // Maya's card already reads "Enrolled in: Ballet"; selecting her walks
    // into the wizard (a waiver step may interpose) and the duplicate guard
    // blocks at checkout — before any payment UI renders.
    const alreadyEnrolled = page.getByText(UI.alreadyEnrolled);
    const mayaCard = page.getByRole('button', { name: new RegExp(SEED.children.maya.name) });
    await Promise.race([
      alreadyEnrolled.waitFor(),
      mayaCard.waitFor(),
    ]);

    if (!(await alreadyEnrolled.isVisible().catch(() => false))) {
      await mayaCard.click();
      // Whichever interposes: a fresh waiver step, a signed-waiver summary,
      // or the checkout block itself.
      const waiverRegion = page.getByRole('region', { name: UI.waiverRegion });
      const continueBtn = page.getByRole('button', { name: UI.waiverContinue });
      await Promise.race([
        alreadyEnrolled.waitFor({ timeout: 30_000 }).catch(() => {}),
        waiverRegion.waitFor({ timeout: 30_000 }).catch(() => {}),
        continueBtn.waitFor({ timeout: 30_000 }).catch(() => {}),
      ]);
      if (await waiverRegion.isVisible().catch(() => false)) {
        await signWaiver(page, UI, SEED.parent.name);
      } else if (await continueBtn.isVisible().catch(() => false)) {
        await continueBtn.click();
      }
      await alreadyEnrolled.waitFor({ timeout: 45_000 });
    }
    await shoot(page, '03-duplicate-blocked.png');
  } finally {
    await context.close();
  }
}

// --- 05: enrolled class disabled in the class list --------------------------
async function captureClassListDisabled(browser) {
  const { context, page } = await newPage(browser, VIEWPORT.mobile);
  try {
    await login(page, SEED.parent.email, SEED.parent.password);
    await gotoWarm(page, '/dashboard/portal');

    // Portal card → per-child Enrol for Maya (deterministic DOM id from seed),
    // which opens the wizard with the STUDENT preselected and no class chosen.
    const mayaCard = page.locator(`#portal-child-${SEED.children.maya.personId}`);
    await mayaCard.getByRole('button', { name: UI.enrolButton, exact: true }).click();
    await page.waitForURL(/\/enrol/);

    // Class step: Ballet renders disabled with the already-enrolled badge.
    await page.getByText(UI.alreadyEnrolledBadge).first().waitFor({ timeout: 30_000 });
    await page.getByText(SEED.class.name, { exact: true }).first().waitFor();
    await shoot(page, '05-class-list-disabled.png');
  } finally {
    await context.close();
  }
}

// --- 04: admin cash payment → invoice in the payments log -------------------
async function captureAdminCashPayment(browser) {
  const { context, page } = await newPage(browser, VIEWPORT.desktop);
  try {
    await login(page, SEED.admin.email, SEED.admin.password);

    // Enrol a walk-in: new family with one in-band child.
    await gotoWarm(page, '/admin/students');
    await page.getByRole('button', { name: UI.enrolNewStudent }).first().click();
    await page.waitForURL(/\/enrol/);

    await page.getByRole('button', { name: UI.addChildToFamily }).click();
    await page.locator('input[type="email"]').first().fill(SEED.walkIn.guardianEmail);

    // The debounced guardian lookup resolves to one of two states: a fresh
    // family (hint text + guardian fields) or a linked family from a previous
    // run (summary box with a "Change family" action).
    const changeFamily = page.getByRole('button', { name: /Change family/i });
    const freshFamilyHint = page.getByText(/No existing family for this email/i);
    await Promise.race([
      changeFamily.waitFor({ timeout: 20_000 }).catch(() => {}),
      freshFamilyHint.waitFor({ timeout: 20_000 }).catch(() => {}),
    ]);
    if (!(await changeFamily.isVisible().catch(() => false))) {
      await fieldset(page, UI.guardianFieldset)
        .locator('input[type="text"]')
        .first()
        .fill(SEED.walkIn.guardianName);
    }
    const studentBox = fieldset(page, UI.studentFieldset);
    await studentBox.locator('input[type="text"]').first().fill(SEED.walkIn.childName);
    await studentBox.locator('input[type="date"]').first().fill(SEED.walkIn.childDob);
    await page.getByRole('button', { name: UI.next, exact: true }).click();

    // Class step: pick Ballet, advance. A waiver step may interpose for the
    // walk-in student before the admin payment choices.
    await page.getByText(SEED.class.name, { exact: true }).first().click();
    await page.getByRole('button', { name: UI.next, exact: true }).click();

    const offlinePanel = page.getByText(UI.offlinePanel).first();
    const waiverRegion = page.getByRole('region', { name: UI.waiverRegion });
    await Promise.race([
      offlinePanel.waitFor({ timeout: 45_000 }).catch(() => {}),
      waiverRegion.waitFor({ timeout: 45_000 }).catch(() => {}),
    ]);
    if (await waiverRegion.isVisible().catch(() => false)) {
      await signWaiver(page, UI, SEED.walkIn.guardianName);
    }
    await offlinePanel.waitFor({ timeout: 45_000 });

    // Record offline payment — method defaults to Cash.
    await page.getByRole('button', { name: UI.offlineConfirm }).click();
    await page.getByText(UI.offlineRecorded).waitFor({ timeout: 45_000 });

    // Payments log: open the newest payment for the walk-in family and wait
    // for the invoicing pipeline to attach a document number.
    await gotoWarm(page, '/admin/finance/payments');
    const row = page
      .getByRole('row')
      .filter({ hasText: new RegExp(`${SEED.walkIn.guardianName}|${SEED.walkIn.childName}`) })
      .first();
    await row.waitFor({ timeout: 30_000 });
    await row.click();
    const drawer = page.getByRole('dialog');
    await drawer.getByText(UI.paymentDetailTitle).waitFor();

    // The document number is written asynchronously; reload-and-reopen until
    // it shows (cap 90s), then screenshot either way — cash + method are the
    // load-bearing facts, the document link is the bonus.
    const docDeadline = Date.now() + 90_000;
    while (Date.now() < docDeadline) {
      const hasDoc = await drawer
        .locator('a')
        .first()
        .isVisible()
        .catch(() => false);
      if (hasDoc) break;
      await page.waitForTimeout(5_000); // polling an external pipeline, not UI state
      await page.reload();
      await row.waitFor({ timeout: 30_000 });
      await row.click();
      await drawer.getByText(UI.paymentDetailTitle).waitFor();
    }

    await shoot(page, '04-admin-cash-payment.png');
  } finally {
    await context.close();
  }
}

export async function captureStills(only = []) {
  mkdirSync(OUTPUT.stillsDir, { recursive: true });
  await verifyFixture();
  const stopServer = await ensureDevServer();
  const browser = await chromium.launch({ headless: !HEADED });
  const want = (id) => only.length === 0 || only.includes(id);
  try {
    if (want('01')) await captureParentPortal(browser);
    if (want('02')) await captureAgeRuleBlocked(browser);
    if (want('03')) await captureDuplicateBlocked(browser);
    if (want('05')) await captureClassListDisabled(browser);
    if (want('04')) await captureAdminCashPayment(browser);
  } finally {
    await browser.close();
    await stopServer();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  // e.g. `node capture-stills.mjs --only=04` or `--only=02,03`
  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const only = onlyArg ? onlyArg.slice('--only='.length).split(',') : [];
  captureStills(only).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
