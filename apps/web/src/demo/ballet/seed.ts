/**
 * Demo fixtures for the ballet studio demo ("Creative Ballet Academy").
 * Built only with VITE_DEMO_STUDIO=ballet (vite.config.ts swaps ../seed for this
 * module), so it exports the same names as the photographer seed.
 *
 * The studio takes payment in person (payment_provider 'offline') and issues no
 * tax documents (invoicing_provider 'none'). Every date is relative to page load.
 * All people are invented. Prices are ILS in agorot.
 */
import type { Row, Tables } from '../fakeSupabase';

export const TENANT_ID = 'd1000000-0000-4000-8000-000000000001';
export const ADMIN_USER_ID = 'd1000000-0000-4000-8000-00000000a001';
export const CLIENT_USER_ID = 'd1000000-0000-4000-8000-00000000a002';
export const ADMIN_EMAIL = 'office@creative-ballet.demo';
export const TENANT_SUBDOMAIN = 'creativeballet';
/** Placeholder hosts shared with the photographer demo code (unused here). */
export const DEMO_GALLERY_HOST = 'https://gallery.creative-ballet.demo';
export const DEMO_INVOICE_HOST = 'https://invoices.creative-ballet.demo';
export const DEMO_CONTRACT_HOST = 'https://contracts.creative-ballet.demo';

/** Where the demo opens, and where the view switch lands. Never a photographer page (Shoots). */
export const DEMO_HOME = { admin: '#/admin/students', client: '#/dashboard' } as const;

/** Labels for the demo bar's view switch. */
export const DEMO_VIEWS = {
  en: { admin: 'Studio', client: 'Parent' },
  he: { admin: 'סטודיו', client: 'הורה' },
} as const;

/** consent_templates.version_hash is a 64-char sha256 hex; any fixed value works in the demo. */
const TEMPLATE_HASH = 'c7b1d3a0e5f24986b0a1c2d3e4f5061728394a5b6c7d8e9f0a1b2c3d4e5f6071';

const id = (n: number) => `d1000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function at(days: number, hour = 10, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function day(days: number): string {
  return at(days, 12).slice(0, 10);
}

/** A date of birth for someone who is `years` old and has a birthday in `monthsAgo` months' time. */
function dob(years: number, monthsAgo: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setMonth(d.getMonth() - monthsAgo);
  d.setDate(12);
  return d.toISOString().slice(0, 10);
}

/** First day of the month `months` from now (negative = past). */
function monthStart(months: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export const SEASON_ID = id(101);
const NEXT_SEASON_ID = id(102);

const CAT = { mini: id(201), primary: id(202), grade1: id(203), grade2: id(204), grade3: id(205), adult: id(206) };
const STAFF = { a: id(251), b: id(252) };

export const CLASS = {
  miniSun: id(301),
  primarySun: id(302),
  grade1Sun: id(303),
  grade2Sun: id(304),
  grade3Sun: id(305),
  primaryWed: id(306),
  grade1Wed: id(307),
  grade2Wed: id(308),
  grade3Wed: id(309),
  pilatesMon: id(310),
} as const;

interface Family {
  n: number;
  name: string;
  guardian: string;
  email: string;
  phone: string;
  children: { n: number; name: string; age: number; months: number }[];
}

const FAMILIES: Family[] = [
  {
    n: 1, name: 'Levi family', guardian: 'Noa Levi', email: 'noa.levi@example.com', phone: '052-418-2290',
    children: [
      { n: 1, name: 'Maya Levi', age: 6, months: 3 },
      { n: 2, name: 'Ari Levi', age: 9, months: 7 },
    ],
  },
  {
    n: 2, name: 'Cohen family', guardian: 'Yael Cohen', email: 'yael.cohen@example.com', phone: '054-771-3302',
    children: [{ n: 3, name: 'Shira Cohen', age: 4, months: 5 }],
  },
  {
    n: 3, name: 'Mizrahi family', guardian: 'Dana Mizrahi', email: 'dana.mizrahi@example.com', phone: '050-662-1184',
    children: [{ n: 4, name: 'Lia Mizrahi', age: 5, months: 2 }],
  },
  {
    n: 4, name: 'Peretz family', guardian: 'Avi Peretz', email: 'avi.peretz@example.com', phone: '053-209-8841',
    children: [
      { n: 5, name: 'Eitan Peretz', age: 7, months: 9 },
      { n: 6, name: 'Hila Peretz', age: 11, months: 1 },
    ],
  },
  {
    n: 5, name: 'Ben-Ami family', guardian: 'Michal Ben-Ami', email: 'michal.benami@example.com', phone: '058-330-7715',
    children: [{ n: 7, name: 'Noga Ben-Ami', age: 8, months: 4 }],
  },
  {
    n: 6, name: 'Katz family', guardian: 'Orly Katz', email: 'orly.katz@example.com', phone: '054-118-6620',
    children: [{ n: 8, name: 'Tom Katz', age: 5, months: 8 }],
  },
];

/** The family the "Parent" view signs in as. */
export const DEMO_FAMILY = FAMILIES[0];
export const DEMO_CLIENT = { n: DEMO_FAMILY.n, name: DEMO_FAMILY.guardian, email: DEMO_FAMILY.email };

const accountId = (n: number) => id(400 + n);
const guardianId = (n: number) => id(500 + n);
const childId = (n: number) => id(550 + n);
const engagementId = (n: number) => id(700 + n);
const billingId = (n: number) => id(650 + n);

/**
 * Enrolments in the current season: [child, class, status, paid?].
 * Covers every state the coordinator asked for.
 */
const ENROLMENTS: [number, string, 'active' | 'pending_payment' | 'pending_waiver' | 'admin_review', 'cash' | 'bank_transfer' | null][] = [
  [1, CLASS.grade1Sun, 'active', 'cash'],
  [2, CLASS.grade3Wed, 'pending_payment', null],
  [3, CLASS.primarySun, 'active', 'bank_transfer'],
  [4, CLASS.primaryWed, 'pending_waiver', null],
  [5, CLASS.grade2Sun, 'admin_review', null],
  [6, CLASS.grade3Sun, 'active', 'cash'],
  [7, CLASS.grade2Wed, 'active', 'cash'],
  [8, CLASS.miniSun, 'pending_payment', null],
];

/** docs/legal/07b-health-declaration-child (as in the demo), Hebrew then English. */
export const HEALTH_DECLARATION = `הצהרת בריאות לשיעורי מחול — תלמיד/ה קטין/ה
Health Declaration for Dance Classes — Child

הסטודיו (Creative Ballet Academy) אוסף מידע זה כדי לשמור על בטיחות התלמיד/ה בשיעור. רק מנהל/ת הסטודיו והמורים של התלמיד/ה יכולים לראות אותו. אין חובה חוקית למסור את המידע, אך לא נוכל לקבל את התלמיד/ה לשיעור ללא הצהרה מלאה. נשמור את המידע לעונה הנוכחית ועוד שנה לאחר מכן, ואז נמחק אותו. אפשר לעיין בו ולתקנו בכל עת.

1. שאלות (אם התשובה "כן", נא לעדכן את הסטודיו בהערה קצרה)
1. האם רופא/ה אמר/ה אי פעם שלתלמיד/ה יש בעיה בלב, או שעליו/ה לעסוק בפעילות גופנית רק בהשגחה רפואית?
2. האם בחצי השנה האחרונה היו לתלמיד/ה כאבים בחזה, התעלפות או איבוד שיווי משקל בגלל סחרחורת, בזמן מאמץ או אחריו?
3. האם יש לתלמיד/ה אסתמה, אפילפסיה, סוכרת או מצב אחר שעשוי לדרוש תגובה במהלך השיעור?
4. האם בחצי השנה האחרונה הייתה לתלמיד/ה פציעה, שבר או ניתוח, או שיש בעיה במפרקים, בגב או בעצמות?
5. האם יש לתלמיד/ה אלרגיה (למזון, לתרופות, לעקיצות) שהצוות צריך לדעת עליה? האם התלמיד/ה נושא/ת מזרק אפיפן או משאף?
6. האם התלמיד/ה נוטל/ת תרופות באופן קבוע שעשויות להשפיע על פעילות גופנית?
7. האם יש משהו נוסף (גופני, רגשי או לימודי) שיעזור למורה לתמוך בתלמיד/ה? (רשות)

2. הצהרה
- למיטב ידיעתי התשובות נכונות ומלאות.
- אם עניתי "כן" על שאלות 1–4, אתייעץ עם הרופא/ה של התלמיד/ה, והסטודיו רשאי לבקש אישור רפואי לפני ההשתתפות.
- אעדכן את הסטודיו בהקדם על כל שינוי במצב הבריאות של התלמיד/ה.

3. חירום
- במקרה חירום, אם לא ניתן להשיג אותי, אני מתיר/ה לצוות הסטודיו להזעיק שירותי חירום (מד"א 101) ולתת עזרה ראשונה בסיסית עד להגעת עזרה.

4. חתימה
אני מאשר/ת שאני ההורה או האפוטרופוס החוקי של התלמיד/ה ומוסמך/ת לחתום בשמו/ה.

———

The studio (Creative Ballet Academy) collects this information to keep the student safe in class. Only the studio manager and the student's teachers can see it. You are not legally required to give it, but we cannot accept the student into class without a completed declaration. We keep it for the season and 1 year after, then delete it. You may see and correct it at any time.

1. Questions (if the answer is "yes", please tell the studio in a short note)
1. Has a doctor ever said the student has a heart condition, or should only do physical activity under medical supervision?
2. In the last 6 months, has the student had chest pain, fainting, or loss of balance from dizziness during or after exercise?
3. Does the student have asthma, epilepsy, diabetes or another condition that may need a response during class?
4. Has the student had an injury, fracture or surgery in the last 6 months, or have a joint, back or bone problem?
5. Does the student have an allergy (food, medication, insect stings) that teachers should know about? Does the student carry an EpiPen or inhaler?
6. Does the student take regular medication that may affect physical activity?
7. Is there anything else (physical, emotional or learning-related) that would help the teacher support the student? (optional)

2. Declaration
- To the best of my knowledge the answers are correct and complete.
- If I answered "yes" to questions 1–4, I will consult the student's doctor, and the studio may ask for a doctor's note before the student takes part.
- I will tell the studio promptly about any change in the student's health.

3. Emergency
- In an emergency, if I cannot be reached, I authorise the studio staff to call emergency services (מד"א 101) and to give basic first aid until help arrives.

4. Signature
I confirm that I am the parent or legal guardian of the student and am authorised to sign for them.`;

export function buildSeed(): Tables {
  const tenant: Row = {
    id: TENANT_ID,
    name: 'Creative Ballet Academy',
    subdomain: TENANT_SUBDOMAIN,
    skin: 'dance-studio',
    business_preset: 'programs',
    plan: 'professional',
    primary_color: '#76335A',
    accent_color: '#E99AC4',
    language_default: 'en',
    // Enquiry-form questions (Settings → Enquiry form): a dance studio's ready-made set.
    lead_form: {
      presets: {
        child_name: { enabled: true, required: true },
        child_age: { enabled: true, required: true },
        class_interest: { enabled: true, required: false },
        preferred_days: { enabled: true, required: false },
      },
      custom: [],
    },
    country: 'IL',
    currency: 'ILS',
    phone_region: 'IL',
    font_pair: 'elegant',
    logo_url: null,
    logo_dark_url: null,
    chrome_style: 'soft',
    logo_tone: null,
    logo_dark_tone: null,
    logo_autofix: true,
    labels: {},
    contact_email: ADMIN_EMAIL,
    waiver_require_otp: false,
    // Pays at the studio, no tax documents (GO-LIVE-PLAN: offline + none).
    payment_provider: 'offline',
    payment_provider_public_key: null,
    payment_provider_secret_configured: false,
    payment_provider_webhook_configured: false,
    payment_provider_updated_at: null,
    invoicing_provider: 'none',
    offline_payment_instructions:
      'Pay at the studio office before your first class (cash or bank transfer). Ask the office for the bank details.\nאפשר לשלם במשרד הסטודיו לפני השיעור הראשון (מזומן או העברה בנקאית).',
    enabled_features: [
      'people:families.manage',
      'offerings:structure.configure',
      'finance:expenses.basic',
      'finance:reports.realtime',
      'comms:reminders.email',
      'ui:theme.dance-studio',
    ],
    created_at: at(-400),
  };

  const seasons: Row[] = [
    { id: SEASON_ID, tenant_id: TENANT_ID, name: 'Season 2026–27', start_date: monthStart(-2), end_date: day(240), status: 'active', created_at: at(-120) },
    { id: NEXT_SEASON_ID, tenant_id: TENANT_ID, name: 'Summer intensive', start_date: day(250), end_date: day(290), status: 'upcoming', created_at: at(-20) },
  ];

  const categories: Row[] = [
    { id: CAT.mini, tenant_id: TENANT_ID, name: 'Mini', sort_order: 1, created_at: at(-120) },
    { id: CAT.primary, tenant_id: TENANT_ID, name: 'Primary', sort_order: 2, created_at: at(-120) },
    { id: CAT.grade1, tenant_id: TENANT_ID, name: 'Grade 1', sort_order: 3, created_at: at(-120) },
    { id: CAT.grade2, tenant_id: TENANT_ID, name: 'Grade 2', sort_order: 4, created_at: at(-120) },
    { id: CAT.grade3, tenant_id: TENANT_ID, name: 'Grade 3', sort_order: 5, created_at: at(-120) },
    { id: CAT.adult, tenant_id: TENANT_ID, name: 'Adults', sort_order: 6, created_at: at(-120) },
  ];

  const staff: Row[] = [
    { id: STAFF.a, tenant_id: TENANT_ID, user_profile_id: null, name: 'Tali Aharon', email: 'tali@creative-ballet.demo', phone: null, contract_type: 'hourly', hourly_rate_minor: null, created_at: at(-300), updated_at: at(-300) },
    { id: STAFF.b, tenant_id: TENANT_ID, user_profile_id: null, name: 'Gal Ronen', email: 'gal@creative-ballet.demo', phone: null, contract_type: 'hourly', hourly_rate_minor: null, created_at: at(-300), updated_at: at(-300) },
  ];

  const cls = (
    oid: string, name: string, cat: string, dow: number, start: string, end: string,
    minAge: number, maxAge: number | null, teacher: string, ils = 240, cap = 14,
  ): Row => ({
    id: oid,
    tenant_id: TENANT_ID,
    season_id: SEASON_ID,
    category_id: cat,
    staff_id: teacher,
    name,
    offering_type: 'class',
    duration_mins: null,
    day_of_week: dow,
    start_time: start,
    end_time: end,
    min_age: minAge,
    max_age: maxAge,
    max_capacity: cap,
    price_minor: ils * 100,
    setup_fee_minor: 0,
    currency: 'ILS',
    delivery_mode: 'scheduled',
    billing_mode: 'recurring',
    billing_interval: 'monthly',
    renewal_policy: 'none',
    is_public: true,
    status: 'active',
    waiver_required: true,
    location: 'Studio A, 8 HaNevi\'im St, Haifa',
    cover_image_path: null,
    description: null,
    created_at: at(-110),
    updated_at: at(-110),
  });

  const offerings: Row[] = [
    cls(CLASS.miniSun, 'Mini ballet (ages 3–4)', CAT.mini, 0, '16:00:00', '16:40:00', 3, 4, STAFF.a, 200, 10),
    cls(CLASS.primarySun, 'Primary (ages 4–5)', CAT.primary, 0, '16:45:00', '17:30:00', 4, 5, STAFF.a),
    cls(CLASS.grade1Sun, 'Grade 1 (ages 6–7)', CAT.grade1, 0, '17:30:00', '18:15:00', 6, 7, STAFF.a),
    cls(CLASS.grade2Sun, 'Grade 2 (ages 8–9)', CAT.grade2, 0, '18:15:00', '19:00:00', 8, 9, STAFF.b),
    cls(CLASS.grade3Sun, 'Grade 3 (ages 10–12)', CAT.grade3, 0, '19:00:00', '20:00:00', 10, 12, STAFF.b, 260),
    cls(CLASS.primaryWed, 'Primary (ages 4–5)', CAT.primary, 3, '16:30:00', '17:15:00', 4, 5, STAFF.a),
    cls(CLASS.grade1Wed, 'Grade 1 (ages 6–7)', CAT.grade1, 3, '17:15:00', '18:00:00', 6, 7, STAFF.a),
    cls(CLASS.grade2Wed, 'Grade 2 (ages 8–9)', CAT.grade2, 3, '18:00:00', '18:45:00', 8, 9, STAFF.b),
    cls(CLASS.grade3Wed, 'Grade 3 (ages 10–12)', CAT.grade3, 3, '18:45:00', '19:45:00', 9, 12, STAFF.b, 260),
    cls(CLASS.pilatesMon, 'Adult ballet fitness', CAT.adult, 1, '10:00:00', '11:00:00', 18, null, STAFF.b, 280, 15),
  ];

  const people: Row[] = [];
  const accounts: Row[] = [];
  const accountMembers: Row[] = [];
  const contactPreferences: Row[] = [];
  for (const f of FAMILIES) {
    const isDemo = f.n === DEMO_FAMILY.n;
    people.push({
      // Like supabase/seed.sql: the guardian's own person row is not in the
      // family account (that holds the children); they reach it via user_profile_id.
      id: guardianId(f.n), tenant_id: TENANT_ID, account_id: null, name: f.guardian, email: f.email,
      date_of_birth: null, status: 'active', medical_notes: null, allergies: null,
      emergency_contact_name: null, emergency_contact_phone: f.phone, photo_consent: false, media_consent: false,
      waiver_accepted_at: null, waiver_version: null, user_profile_id: isDemo ? CLIENT_USER_ID : null,
      created_at: at(-90 - f.n), updated_at: at(-90 - f.n),
    });
    accounts.push({ id: accountId(f.n), tenant_id: TENANT_ID, name: f.name, person_id: guardianId(f.n), created_at: at(-90 - f.n) });
    accountMembers.push({
      id: id(450 + f.n), tenant_id: TENANT_ID, account_id: accountId(f.n), person_id: guardianId(f.n),
      role: 'account_holder', user_profile_id: isDemo ? CLIENT_USER_ID : null, created_at: at(-90 - f.n),
    });
    contactPreferences.push({
      id: id(600 + f.n), tenant_id: TENANT_ID, person_id: guardianId(f.n), account_member_id: null,
      email_opted_in: true, whatsapp_number: f.phone, whatsapp_opted_in: false, whatsapp_verified: false,
      voice_number: null, voice_opted_in: false, preferred_channel: 'email', language: f.n % 2 ? 'he' : 'en',
      created_at: at(-90), updated_at: at(-90),
    });
    for (const c of f.children) {
      people.push({
        id: childId(c.n), tenant_id: TENANT_ID, account_id: accountId(f.n), name: c.name, email: null,
        date_of_birth: dob(c.age, c.months), status: 'active',
        medical_notes: c.n === 3 ? 'Mild asthma; carries an inhaler.' : null,
        allergies: c.n === 6 ? 'Peanuts' : null,
        emergency_contact_name: f.guardian, emergency_contact_phone: f.phone, photo_consent: false, media_consent: false,
        waiver_accepted_at: null, waiver_version: null, user_profile_id: null,
        created_at: at(-85 - c.n), updated_at: at(-85 - c.n),
      });
    }
  }

  // _shared/ensure-billing-account.ts: the payer is the account holder (the guardian).
  const billingAccounts: Row[] = FAMILIES.map((f) => ({
    id: billingId(f.n), tenant_id: TENANT_ID, account_id: null, person_id: guardianId(f.n),
    business_tax_id: null, business_name: null, status: 'active', created_at: at(-90), updated_at: at(-90),
  }));

  const engagements: Row[] = [];
  const waiverEvidence: Row[] = [];
  const payments: Row[] = [];
  const childFamily = (n: number) => FAMILIES.find((f) => f.children.some((c) => c.n === n))!;
  ENROLMENTS.forEach(([child, offeringId, status, paidBy], i) => {
    const eid = engagementId(i + 1);
    const f = childFamily(child);
    const offering = offerings.find((o) => o.id === offeringId)!;
    const signed = status === 'active' || status === 'pending_payment' || status === 'admin_review';
    const evidenceId = signed ? id(800 + i + 1) : null;
    const created = -40 + i * 3;
    engagements.push({
      id: eid, tenant_id: TENANT_ID, person_id: childId(child), offering_id: offeringId, season_id: SEASON_ID,
      billing_account_id: billingId(f.n), waiver_evidence_id: evidenceId, status,
      billing_status: status === 'active' ? 'current' : null,
      payment_received_at: paidBy ? at(created + 2, 17) : null,
      age_review_note: status === 'admin_review' ? 'Turns 8 in a few months and already dances with older cousins in Grade 2.' : null,
      age_at_season_start: null,
      waiver_deadline: status === 'pending_waiver' ? at(5) : null,
      payment_dunning_attempt_count: 0,
      booked_starts_at: null, booked_ends_at: null,
      created_at: at(created), updated_at: at(created + 1),
    });
    if (evidenceId) {
      waiverEvidence.push({
        id: evidenceId, tenant_id: TENANT_ID, person_id: childId(child), account_member_id: id(450 + f.n),
        offering_id: offeringId, consent_template_id: id(901), consent_version: 1, consent_version_hash: TEMPLATE_HASH,
        wording_snapshot: HEALTH_DECLARATION, pdf_storage_path: '', pdf_sha256: '', record_hmac: '',
        signed_by_name: f.guardian, signed_by_email: f.email, signed_by_role: 'guardian',
        signature_method: 'typed_name_checkbox', guardian_confirmed: true, status: 'signed',
        signed_at: at(created, 20, 10), viewed_at: at(created, 20, 8), created_at: at(created, 20, 10),
      });
    }
    if (paidBy) {
      const total = Number(offering.price_minor);
      payments.push({
        id: id(2000 + i + 1), tenant_id: TENANT_ID, engagement_id: eid, person_id: childId(child),
        account_id: accountId(f.n), offering_id: offeringId, billing_account_id: billingId(f.n),
        total_amount_minor: total, pretax_amount_minor: total, vat_amount_minor: 0, vat_rate: 0, currency: 'ILS',
        status: 'succeeded', charge_type: 'initial', provider: 'manual', payment_method: paidBy,
        description: `${String(offering.name)}: monthly fee`,
        paid_at: at(created + 2, 17), created_at: at(created + 2, 17),
        external_document_number: null, invoice_url: null, refunded_at: null, refund_note: null,
        created_by: ADMIN_USER_ID, updated_at: at(created + 2, 17),
      });
    }
  });
  // One payment from today, so Finance "This month" is never empty.
  const latest = payments[payments.length - 1];
  if (latest) {
    const now = Date.now();
    const midnight = new Date(now);
    midnight.setHours(0, 1, 0, 0);
    latest.paid_at = new Date(Math.max(midnight.getTime(), now - 2 * 3_600_000)).toISOString();
    latest.created_at = latest.paid_at;
  }

  return {
    tenants: [tenant],
    user_profiles: [
      {
        id: ADMIN_USER_ID, tenant_id: TENANT_ID, email: ADMIN_EMAIL, role: ['tenant_admin'], person_id: null,
        language: 'en', country: 'IL', created_at: at(-400), updated_at: at(-400),
      },
      {
        id: CLIENT_USER_ID, tenant_id: TENANT_ID, email: DEMO_FAMILY.email, role: ['account_holder'],
        person_id: guardianId(DEMO_FAMILY.n), language: 'en', country: 'IL', created_at: at(-90), updated_at: at(-90),
      },
    ],
    seasons,
    categories,
    staff,
    offerings,
    consent_templates: [
      {
        id: id(901), tenant_id: TENANT_ID, name: 'Health declaration (child)', content: HEALTH_DECLARATION,
        version: 1, version_hash: TEMPLATE_HASH, status: 'active', created_at: at(-120), updated_at: at(-120),
      },
    ],
    people,
    accounts,
    billing_accounts: billingAccounts,
    account_members: accountMembers,
    contact_preferences: contactPreferences,
    engagements,
    waiver_evidence: waiverEvidence,
    waiver_events: [],
    payments,
    job_payment_requests: [],
    job_details: [],
    quotes: [],
    quote_lines: [],
    leads: [],
    waitlist: [],
    expenses: [],
    expense_categories: [],
    audit_log: [],
    notification_log: [],
    tenant_automatic_emails: [],
    automatic_email_log: [],
    tenant_scheduling_settings: [],
    tenant_scheduling_hours: [],
  };
}
