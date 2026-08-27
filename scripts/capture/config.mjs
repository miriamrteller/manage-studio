/**
 * Portfolio-capture configuration — every knob in one place.
 *
 * Edit here, not in the capture scripts. All seed values below are mirrored in
 * seed-capture.sql; if you change names/emails/DOBs here, change them there too
 * (the SQL is the source of truth for what exists in the DB — these constants
 * are what the Playwright scripts type and assert on).
 */
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const BASE_URL = 'http://studioaviv.localhost:5173'; // *.localhost resolves to loopback in Chromium; the app parses the subdomain

/** Hard pin: captures + seeding may only ever touch this Supabase project. */
export const DEV_PROJECT_REF = 'acmujrhavgbamdilzuew';

export const OUTPUT = {
  videoDir: join(repoRoot, 'captures', 'video'),
  stillsDir: join(repoRoot, 'captures', 'stills'),
};

export const VIEWPORT = {
  /** Mobile — used for the video and the parent-facing stills. */
  mobile: { width: 390, height: 844 },
  /** Desktop — used for the admin payments-log still (04). */
  desktop: { width: 1280, height: 800 },
};

/** 2x device scale factor for stills, per the brief. */
export const STILL_DEVICE_SCALE = 2;

/** Human-ish typing delay for pressSequentially, ms per key. */
export const TYPE_DELAY_MS = 90;

/** Deliberate on-camera holds (ms). These are the ONLY sleep()s in the flow. */
export const HOLD = {
  landing: 2000,
  emailRecognition: 3000, // THE key beat
  afterGuestSwitch: 1500,
  childDetails: 2000,
  waiver: 3000,
  payment: 4000,
  confirmation: 3000,
};

export const SEED = {
  studio: {
    name: 'Studio Aviv',
    tenantId: '00000000-0000-0000-00c0-000000000001',
    subdomain: 'studioaviv', // own tenant — creativeballet keeps its base-seed identity
  },
  class: {
    name: 'Ballet — Ages 6-9',
    offeringId: '00000000-0000-0000-00c0-000000000301',
    seasonId: '00000000-0000-0000-00c0-000000000101',
    seasonName: 'Fall 2026',
    seasonStart: '2026-09-01',
  },
  parent: {
    name: 'Dana Cohen',
    email: 'dana.cohen@example.com', // registered — triggers the recognition beat
    phone: '050-000-0000',
    password: 'devPassword123',
  },
  /**
   * Take 2 of the video continues as a true guest, which requires an email the
   * system does NOT know (the app hard-blocks guest checkout on a registered
   * email). Visually near-identical to Dana's real address.
   */
  guestEmail: 'danacohen@example.com',
  children: {
    maya: {
      name: 'Maya Cohen',
      dob: '2019-04-10', // age 7 at season start
      personId: '00000000-0000-0000-00c0-000000000501', // portal card DOM id
    },
    noa: { name: 'Noa Cohen', dob: '2022-03-05' }, // age 4 — below the 6-9 band
  },
  admin: {
    name: 'Tamar Levi',
    email: 'admin@studioaviv.example.com',
    password: 'devPassword123',
  },
  /** Walk-in family Tamar enrols in the admin cash-payment capture. */
  walkIn: {
    guardianName: 'Yael Peretz',
    guardianEmail: 'yael.peretz@example.com',
    childName: 'Shira Peretz',
    childDob: '2019-06-20', // age 7 — inside the band, no override needed
  },
  payment: {
    successCard: '4580458045804580', // mock provider's success test card
  },
};

/** Exact UI strings the selectors key on (tenant language_default = 'en'). */
export const UI = {
  viewList: 'List', // /classes defaults to the calendar view; cards live behind this toggle
  enrolCta: `Enrol - ${SEED.class.name}`, // ClassCard aria-label
  guardianFieldset: 'Guardian / parent details',
  studentFieldset: 'Student details',
  namePlaceholder: 'Full Name',
  emailPlaceholder: 'Email',
  phonePlaceholder: 'Phone',
  recognitionPrompt: 'We found an account with this email',
  signInAction: 'Sign in',
  next: 'Next',
  requestReview: 'Request studio review',
  addNewChild: /Add a new child|Create new student/,
  waiverRegion: 'Waiver document',
  waiverAccept: 'I have read and accept this waiver',
  waiverGuardianConfirm: /I confirm I am the parent or legal guardian/,
  waiverNamePlaceholder: 'Type your full legal name',
  waiverSubmit: 'Sign and Continue',
  waiverContinue: 'Continue to Payment',
  payNow: 'Pay now',
  confirmationTitle: /Payment complete|Enrolment Successful/i,
  alreadyEnrolled: 'already enrolled in the selected class',
  alreadyEnrolledBadge: 'Already enrolled for this term',
  enrolButton: 'Enrol',
  myChildren: 'My children',
  enrolNewStudent: 'Enrol new student',
  addChildToFamily: 'Add new child to a family',
  offlinePanel: 'Record offline payment',
  offlineConfirm: 'Confirm enrolment as paid',
  offlineRecorded: 'Enrolment recorded as active with offline payment.',
  paymentDetailTitle: 'Payment details',
};
