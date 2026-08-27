#!/usr/bin/env node
/**
 * VIDEO — guest enrolment flow, mobile 390x844, visible cursor, MP4 output.
 *
 * Two-take structure inside one recording (the app hard-blocks guest checkout
 * once a registered email is entered — there is no "continue as guest anyway"):
 *
 *   Take 1 (the key beat): type dana.cohen@example.com at human speed, hold on
 *     the inline "We found an account with this email" recognition prompt.
 *   Take 2 (guest completion): clear the email to the unregistered variant
 *     (danacohen@example.com), fill Maya's details, sign the waiver inline,
 *     pay on the pre-signed tokenized pay page with the mock test card, hold
 *     on the confirmation.
 *
 * All state transitions use locator waits; setTimeout appears ONLY as the
 * deliberate on-camera holds defined in config.HOLD.
 */
import { mkdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BASE_URL, HOLD, OUTPUT, SEED, UI, VIEWPORT } from './config.mjs';
import {
  chromium,
  ensureDevServer,
  fieldset,
  gotoWarm,
  hold,
  humanClear,
  humanClick,
  humanType,
  installCursor,
  pinEnglish,
  verifyFixture,
} from './lib/browser.mjs';
import { transcodeToMp4 } from './lib/ffmpeg.mjs';

const HEADED = process.env.HEADED === '1';

export async function captureVideo() {
  mkdirSync(OUTPUT.videoDir, { recursive: true });
  const rawDir = join(OUTPUT.videoDir, '.raw');
  mkdirSync(rawDir, { recursive: true });

  await verifyFixture();
  const stopServer = await ensureDevServer();
  const browser = await chromium.launch({ headless: !HEADED });

  try {
    const context = await browser.newContext({
      baseURL: BASE_URL,
      viewport: VIEWPORT.mobile,
      recordVideo: { dir: rawDir, size: VIEWPORT.mobile },
      locale: 'en-US',
      timezoneId: 'Asia/Jerusalem',
    });
    await installCursor(context);
    await pinEnglish(context);
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);

    // -- 1. Land on the class page, logged out ------------------------------
    await gotoWarm(page, '/classes');
    // The class page defaults to the calendar; the enrol cards are in list
    // view. Wait for whichever surface renders first, then toggle if needed.
    const listToggle = page.getByRole('button', { name: UI.viewList, exact: true });
    const enrolBtn = page.getByRole('button', { name: UI.enrolCta });
    await Promise.race([listToggle.waitFor(), enrolBtn.waitFor()]);
    if (!(await enrolBtn.isVisible().catch(() => false))) {
      await humanClick(page, listToggle);
    }
    await enrolBtn.waitFor();
    await hold(HOLD.landing);
    await humanClick(page, enrolBtn);

    // Guest wizard, person step (guardian + student form).
    const guardianBox = fieldset(page, UI.guardianFieldset);
    const emailInput = guardianBox.locator('input[type="email"]');
    await emailInput.waitFor();

    // -- 2+3. Type Dana's email; HOLD on the recognition prompt (KEY BEAT) --
    await humanType(page, emailInput, SEED.parent.email);
    const recognition = page.getByText(UI.recognitionPrompt);
    await recognition.waitFor();
    await hold(HOLD.emailRecognition);

    // -- 4. Continue as guest: swap to the unregistered email variant -------
    await humanClear(page, emailInput);
    await humanType(page, emailInput, SEED.guestEmail);
    await recognition.waitFor({ state: 'hidden' });
    await hold(HOLD.afterGuestSwitch);

    // -- 5. Guardian + Maya's details ---------------------------------------
    await humanType(page, guardianBox.getByPlaceholder(UI.namePlaceholder), SEED.parent.name);
    await humanType(page, guardianBox.getByPlaceholder(UI.phonePlaceholder), SEED.parent.phone);

    const studentBox = fieldset(page, UI.studentFieldset);
    await humanType(page, studentBox.getByPlaceholder(UI.namePlaceholder), SEED.children.maya.name);
    const dobInput = studentBox.locator('input[type="date"]');
    await humanClick(page, dobInput);
    await dobInput.fill(SEED.children.maya.dob);
    await hold(HOLD.childDetails);

    await humanClick(page, page.getByRole('button', { name: UI.next, exact: true }));

    // -- 6. Waiver: scroll gate, checkbox, typed signature ------------------
    const waiverRegion = page.getByRole('region', { name: UI.waiverRegion });
    await waiverRegion.waitFor();
    await hold(HOLD.waiver / 2);
    // The signing form unlocks when the sentinel at the bottom of the
    // scrollable document region becomes visible.
    await waiverRegion.evaluate((el) => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }));
    const acceptBox = page.getByRole('checkbox', { name: UI.waiverAccept });
    await acceptBox.waitFor();
    await humanClick(page, acceptBox);
    const guardianConfirm = page.getByRole('checkbox', { name: UI.waiverGuardianConfirm });
    if (await guardianConfirm.isVisible().catch(() => false)) {
      await humanClick(page, guardianConfirm);
    }
    await humanType(page, page.getByPlaceholder(UI.waiverNamePlaceholder), SEED.parent.name);
    await hold(HOLD.waiver / 2);
    await humanClick(page, page.getByRole('button', { name: UI.waiverSubmit }));

    // -- 7. Pre-signed tokenized payment page (auto-redirect; the enrolment
    // token moves from the ?t= query into storage, so match the path only) ---
    await page.waitForURL(/\/enrol\/pay\//, { timeout: 45_000 });
    const cardInput = page.getByPlaceholder(SEED.payment.successCard);
    await cardInput.waitFor({ timeout: 45_000 });
    await hold(HOLD.payment);
    await humanType(page, cardInput, SEED.payment.successCard, { delay: 60 });
    await humanClick(page, page.getByRole('button', { name: UI.payNow }));

    // -- 8. Confirmation ----------------------------------------------------
    await page
      .getByText(UI.confirmationTitle)
      .first()
      .waitFor({ timeout: 60_000 });
    await hold(HOLD.confirmation);

    const video = page.video();
    await context.close(); // finalizes the recording
    const webmPath = await video.path();

    const finalWebm = join(OUTPUT.videoDir, 'guest-enrolment-flow.webm');
    const finalMp4 = join(OUTPUT.videoDir, 'guest-enrolment-flow.mp4');
    renameSync(webmPath, finalWebm);
    rmSync(rawDir, { recursive: true, force: true });

    const mp4 = transcodeToMp4(finalWebm, finalMp4);
    console.log(`Video captured: ${mp4 ?? finalWebm}`);
    return mp4 ?? finalWebm;
  } finally {
    await browser.close();
    await stopServer();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  captureVideo().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
