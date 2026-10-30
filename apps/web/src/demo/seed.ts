/**
 * Demo fixtures for the photographer beta ("Lumen & Light Photography").
 * Every date is relative to the moment the page loads, so the pipeline always
 * looks current. Prices are ILS in agorot (minor units).
 */
import type { Row, Tables } from './fakeSupabase';
import { demoImages } from './images/manifest';

export const TENANT_ID = 'd0000000-0000-4000-8000-000000000001';
export const ADMIN_USER_ID = 'd0000000-0000-4000-8000-00000000a001';
export const CLIENT_USER_ID = 'd0000000-0000-4000-8000-00000000a002';
export const ADMIN_EMAIL = 'studio@lumen-light.demo';
export const TENANT_SUBDOMAIN = 'lumen';
export const DEMO_GALLERY_HOST = 'https://gallery.lumen-light.demo';
/** Invoice links point here; the demo bar opens the sample invoice instead. */
export const DEMO_INVOICE_HOST = 'https://invoices.lumen-light.demo';

const id = (n: number) => `d0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Package (offering) ids */
export const PKG = {
  family: id(301),
  barMitzvah: id(302),
  event: id(303),
  product: id(304),
  custom: id(305),
} as const;

function at(days: number, hour = 10, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function day(days: number): string {
  return at(days, 12).slice(0, 10);
}

function hoursAfter(iso: string, h: number): string {
  return new Date(new Date(iso).getTime() + h * 3600_000).toISOString();
}

interface ClientSpec {
  n: number;
  name: string;
  email: string;
  phone: string;
}

const CLIENTS: ClientSpec[] = [
  { n: 1, name: 'Avi & Michal Rosen', email: 'rosen.family@example.com', phone: '052-381-4410' },
  { n: 2, name: 'Yossi Ben-David', email: 'yossi.bendavid@example.com', phone: '+972 54-772-1903' },
  { n: 3, name: 'Harbor Tech Ltd. (Eli Mizrahi)', email: 'events@harbortech.example.com', phone: '03-555-0142' },
  { n: 4, name: 'Olive & Stone Ceramics', email: 'hello@oliveandstone.example.com', phone: '058-640-2271' },
  { n: 5, name: 'David Peretz', email: 'david.peretz@example.com', phone: '050-918-3367' },
  { n: 6, name: 'Moshe Shapiro', email: 'moshe.shapiro@example.com', phone: '052-204-7785' },
  { n: 7, name: 'Friedman Family', email: 'friedman.home@example.com', phone: '054-316-9920' },
  { n: 8, name: 'Daniel Avraham', email: 'daniel.avraham@example.com', phone: '053-447-1188' },
];

/** The client the "Client" view signs in as. */
export const DEMO_CLIENT = CLIENTS[7];
export const personId = (n: number) => id(500 + n);
export const accountId = (n: number) => id(400 + n);
export const engagementId = (n: number) => id(700 + n);

interface ShootSpec {
  client: number;
  pkg: string;
  status: 'enquiry' | 'booked' | 'shot' | 'editing' | 'delivered';
  startDays: number | null;
  startHour?: number;
  location: string;
  notes: string;
  signedDaysAgo?: number;
  gallery?: boolean;
  galleryReleased?: boolean;
  createdDaysAgo: number;
  /** label, amount (ILS), dueDays, state */
  requests?: Array<[string, number, number | null, 'paid' | 'sent' | 'pending']>;
}

const SHOOTS: ShootSpec[] = [
  {
    client: 1, pkg: PKG.family, status: 'enquiry', startDays: null, location: 'HaYarkon Park, Tel Aviv',
    notes: 'Three generations, prefer late afternoon light. Waiting on a date.', createdDaysAgo: 2,
  },
  {
    client: 2, pkg: PKG.barMitzvah, status: 'enquiry', startDays: 46, startHour: 17,
    location: 'Beit Hadar Hall, Ramat Gan', notes: 'Quote sent for full evening plus pre-event family photos.',
    createdDaysAgo: 6,
  },
  {
    client: 3, pkg: PKG.event, status: 'booked', startDays: 12, startHour: 18,
    location: 'Harbor Tech offices, Herzliya Pituach', notes: 'Year-end company evening. Stage, awards, venue details.',
    signedDaysAgo: 3, createdDaysAgo: 14,
    requests: [['Deposit', 600, 7, 'sent'], ['Balance', 1400, 19, 'pending']],
  },
  {
    client: 4, pkg: PKG.product, status: 'booked', startDays: 5, startHour: 9,
    location: 'Studio, 12 Yefet St, Jaffa', notes: '24 pieces, white background plus 6 styled table shots.',
    signedDaysAgo: 9, createdDaysAgo: 18,
    requests: [['Deposit', 450, -8, 'paid'], ['Balance', 1050, 12, 'pending']],
  },
  {
    client: 5, pkg: PKG.family, status: 'shot', startDays: -3, startHour: 16,
    location: 'Jaffa Port, Tel Aviv', notes: 'Shot at sunset. 180 frames to cull.',
    signedDaysAgo: 20, createdDaysAgo: 30,
    requests: [['Deposit', 300, -22, 'paid'], ['Balance', 650, 4, 'sent']],
  },
  {
    client: 6, pkg: PKG.barMitzvah, status: 'editing', startDays: -10, startHour: 17,
    location: 'Gan Oranim Events, Petah Tikva', notes: 'Editing in progress, sneak peek sent.',
    signedDaysAgo: 40, createdDaysAgo: 55,
    requests: [['Deposit', 1500, -45, 'paid'], ['Balance', 3300, 10, 'sent']],
  },
  {
    client: 7, pkg: PKG.family, status: 'delivered', startDays: -24, startHour: 9,
    location: 'Park HaMesila, Jerusalem', notes: 'Delivered 64 edited images.',
    signedDaysAgo: 50, gallery: true, galleryReleased: true, createdDaysAgo: 60,
    requests: [['Deposit', 300, -40, 'paid'], ['Balance', 650, -12, 'paid']],
  },
  {
    client: 8, pkg: PKG.event, status: 'delivered', startDays: -18, startHour: 19,
    location: 'Tel Aviv Port, Hangar 11', notes: 'Gallery ready. Released once the balance is paid.',
    signedDaysAgo: 35, gallery: true, galleryReleased: false, createdDaysAgo: 42,
    requests: [['Deposit', 600, -30, 'paid'], ['Balance', 1400, -4, 'sent']],
  },
];

const CONTRACT_TEXT = `Photography Services Agreement / הסכם שירותי צילום

Client: {{client_name}}
Package: {{package}}
Shoot date: {{shoot_date}}
Location: {{location}}
Price: {{price}}

1. The service. Lumen & Light Photography will provide the photography described in the package above at the agreed date and location. Rescheduling must be agreed in writing at least 48 hours in advance.

2. Payment. Payment is made against the payment requests sent to the client. The final gallery is released after payment in full.

3. Copyright and use. Copyright in the photographs remains with the photographer. The client receives a licence for personal, non-commercial use of the delivered images.

4. Cancellation. Cancellation up to 7 days before the date: full refund of the deposit. Later cancellation: the deposit is retained.

By signing I confirm that I have read and understood this agreement and accept its terms.`;

export function buildSeed(): Tables {
  const now = new Date().toISOString();
  const tenant: Row = {
    id: TENANT_ID,
    name: 'Lumen & Light Photography',
    subdomain: TENANT_SUBDOMAIN,
    skin: 'photographer',
    business_preset: 'services',
    plan: 'essential',
    primary_color: '#1F5F5B',
    accent_color: '#E8B04B',
    language_default: 'en',
    country: 'IL',
    currency: 'ILS',
    font_pair: null,
    logo_url: null,
    logo_dark_url: null,
    labels: {},
    payment_provider: 'ypay',
    payment_provider_public_key: null,
    payment_provider_secret_configured: true,
    payment_provider_webhook_configured: true,
    payment_provider_updated_at: now,
    invoicing_provider: 'ypay',
    enabled_features: [
      'billing:delivery.gated',
      'media:portfolio.public',
      'media:storage.extended',
      'finance:expenses.basic',
      'comms:reminders.email',
      'ui:theme.photographer',
    ],
    created_at: at(-200),
  };

  const offering = (n: string, name: string, mins: number, ils: number, location: string | null, cover: string, isPublic = true): Row => ({
    id: n,
    tenant_id: TENANT_ID,
    season_id: null,
    category_id: null,
    staff_id: null,
    name,
    offering_type: 'appointment',
    duration_mins: mins,
    day_of_week: null,
    start_time: null,
    end_time: null,
    min_age: null,
    max_age: null,
    max_capacity: 1,
    price_minor: ils * 100,
    setup_fee_minor: 0,
    currency: 'ILS',
    delivery_mode: 'scheduled',
    billing_mode: 'one_time',
    billing_interval: null,
    renewal_policy: 'none',
    is_public: isPublic,
    status: 'active',
    waiver_required: true,
    location,
    cover_image_path: cover,
    created_at: at(-180),
    updated_at: at(-180),
  });

  const offerings = [
    offering(PKG.family, 'Family Session', 60, 950, 'Outdoor location of your choice', demoImages.packageFamily),
    offering(PKG.barMitzvah, 'Bar Mitzvah: Full Evening', 300, 4800, 'Client venue', demoImages.packageBarMitzvah),
    offering(PKG.event, 'Event Coverage (2 hours)', 120, 2000, 'Client venue', demoImages.packageEvent),
    offering(PKG.product, 'Product Shoot (half day)', 240, 1500, 'Studio, 12 Yefet St, Jaffa', demoImages.packageProduct),
    offering(PKG.custom, 'Custom Package', 60, 0, null, demoImages.packageCustom, false),
  ];

  const people: Row[] = [];
  const accounts: Row[] = [];
  const accountMembers: Row[] = [];
  const contactPreferences: Row[] = [];
  for (const c of CLIENTS) {
    people.push({
      id: personId(c.n),
      tenant_id: TENANT_ID,
      account_id: accountId(c.n),
      name: c.name,
      email: c.email,
      status: 'active',
      date_of_birth: null,
      medical_notes: null,
      allergies: null,
      emergency_contact_name: null,
      emergency_contact_phone: null,
      photo_consent: false,
      media_consent: false,
      waiver_accepted_at: null,
      waiver_version: null,
      user_profile_id: c.n === DEMO_CLIENT.n ? CLIENT_USER_ID : null,
      created_at: at(-60 - c.n),
      updated_at: at(-60 - c.n),
    });
    accounts.push({
      id: accountId(c.n),
      tenant_id: TENANT_ID,
      name: c.name,
      person_id: personId(c.n),
      created_at: at(-60 - c.n),
    });
    accountMembers.push({
      id: id(450 + c.n),
      tenant_id: TENANT_ID,
      account_id: accountId(c.n),
      person_id: personId(c.n),
      role: 'account_holder',
      user_profile_id: c.n === DEMO_CLIENT.n ? CLIENT_USER_ID : null,
    });
    contactPreferences.push({
      id: id(600 + c.n),
      tenant_id: TENANT_ID,
      person_id: personId(c.n),
      email_opted_in: true,
      whatsapp_number: c.phone,
      whatsapp_opted_in: false,
      whatsapp_verified: false,
    });
  }

  const engagements: Row[] = [];
  const jobDetails: Row[] = [];
  const waiverEvidence: Row[] = [];
  const payments: Row[] = [];
  const paymentRequests: Row[] = [];

  SHOOTS.forEach((s, i) => {
    const eid = engagementId(i + 1);
    const pkg = offerings.find((o) => o.id === s.pkg) as Row;
    const starts = s.startDays == null ? null : at(s.startDays, s.startHour ?? 10);
    const ends = starts ? hoursAfter(starts, Number(pkg.duration_mins) / 60) : null;
    const evidenceId = s.signedDaysAgo != null ? id(800 + i + 1) : null;
    engagements.push({
      id: eid,
      tenant_id: TENANT_ID,
      person_id: personId(s.client),
      offering_id: s.pkg,
      season_id: null,
      status: 'active',
      booked_starts_at: starts,
      booked_ends_at: ends,
      waiver_evidence_id: evidenceId,
      created_at: at(-s.createdDaysAgo),
      updated_at: at(-s.createdDaysAgo),
    });
    jobDetails.push({
      engagement_id: eid,
      tenant_id: TENANT_ID,
      job_status: s.status,
      location: s.location,
      notes: s.notes,
      lead_id: null,
      gallery_url: s.gallery ? `${DEMO_GALLERY_HOST}/${eid.slice(-4)}` : null,
      gallery_released_at: s.galleryReleased ? at(-6) : null,
      created_at: at(-s.createdDaysAgo),
      updated_at: at(-1),
    });
    if (evidenceId) {
      waiverEvidence.push({
        id: evidenceId,
        tenant_id: TENANT_ID,
        engagement_id: eid,
        person_id: personId(s.client),
        consent_template_id: id(901),
        signer_name: CLIENTS[s.client - 1].name,
        signed_at: at(-(s.signedDaysAgo ?? 0), 20, 15),
        created_at: at(-(s.signedDaysAgo ?? 0), 20, 15),
      });
    }
    (s.requests ?? []).forEach(([label, ils, dueDays, state], j) => {
      const rid = id(1000 + (i + 1) * 10 + j);
      let paymentId: string | null = null;
      if (state === 'paid') {
        paymentId = id(2000 + (i + 1) * 10 + j);
        payments.push({
          id: paymentId,
          tenant_id: TENANT_ID,
          engagement_id: eid,
          person_id: personId(s.client),
          account_id: accountId(s.client),
          offering_id: s.pkg,
          total_amount_minor: ils * 100,
          pretax_amount_minor: Math.round((ils * 100) / 1.18),
          vat_amount_minor: ils * 100 - Math.round((ils * 100) / 1.18),
          vat_rate: 18,
          currency: 'ILS',
          status: 'succeeded',
          charge_type: 'one_time',
          provider: 'ypay',
          payment_method: 'card',
          description: `${pkg.name}: ${label}`,
          paid_at: at((dueDays ?? 0) - 1, 14),
          created_at: at((dueDays ?? 0) - 1, 14),
          external_document_number: String(30410 + payments.length),
          invoice_url: `${DEMO_INVOICE_HOST}/${paymentId}`,
        });
      }
      paymentRequests.push({
        id: rid,
        tenant_id: TENANT_ID,
        engagement_id: eid,
        label,
        amount_minor: ils * 100,
        currency: 'ILS',
        due_date: dueDays == null ? null : day(dueDays),
        status: state,
        payment_id: paymentId,
        sent_at: state === 'pending' ? null : at(Math.min(dueDays ?? 0, 0) - 7, 9),
        paid_at: state === 'paid' ? at((dueDays ?? 0) - 1, 14) : null,
        max_installments: label === 'Balance' ? 3 : 1,
        public_token: `demo${rid.slice(-6)}token`,
        due_reminder_sent_at: null,
        overdue_reminder_sent_at: null,
        refunded_at: null,
        refund_note: null,
        created_by: ADMIN_USER_ID,
        created_at: at(-s.createdDaysAgo + 1),
        updated_at: at(-1),
      });
    });
  });

  const lead = (n: number, name: string, stage: string, channel: string, interest: string, offeringId: string | null, valueIls: number | null, note: string, createdDaysAgo: number, followUpDays: number | null, email: string, phone: string | null): Row => ({
    id: id(1100 + n),
    tenant_id: TENANT_ID,
    name,
    company: null,
    title: null,
    email,
    phone,
    stage,
    channel,
    interest,
    offering_id: offeringId,
    deal_value_minor: valueIls == null ? null : valueIls * 100,
    note,
    next_follow_up_at: followUpDays == null ? null : at(followUpDays, 10),
    last_contacted_at: stage === 'new' ? null : at(-1, 11),
    last_communication_note: stage === 'new' ? null : 'Sent package list and availability.',
    marketing_consent: true,
    converted_account_id: null,
    converted_at: null,
    source_ref: null,
    created_at: at(-createdDaysAgo, 9),
    updated_at: at(-createdDaysAgo, 9),
  });

  const leads = [
    lead(1, 'Ariel Goldberg', 'new', 'website', 'Bar mitzvah in March, evening event plus family photos', PKG.barMitzvah, 4800, 'Found us through the website gallery.', 0, 1, 'ariel.goldberg@example.com', '052-660-1477'),
    lead(2, 'Nir Azoulay', 'contacted', 'whatsapp', 'Product photos for a new coffee brand, about 15 items', PKG.product, 1500, 'Needs photos before a launch in 3 weeks.', 3, 2, 'nir@azoulaycoffee.example.com', '054-118-2090'),
    lead(3, 'Levi Family', 'qualified', 'instagram', 'Outdoor family session in Jerusalem', PKG.family, 950, 'Prefers Friday morning.', 5, 0, 'levi.family@example.com', '050-772-3381'),
    lead(4, 'Tamar Events Agency', 'proposal', 'email', 'Two-hour coverage for a product launch evening', PKG.event, 2000, 'Asked for a quote with a second photographer option.', 8, 3, 'office@tamarevents.example.com', '03-611-8820'),
  ];

  // Quotes: one per status the photographer works with. Totals are filled in
  // by recalcQuote() when the demo client starts (same rules as the SQL).
  const quotes: Row[] = [];
  const quoteLines: Row[] = [];
  const quote = (
    n: number,
    fields: Row,
    lines: Array<[string, number, string | null, boolean, boolean]>,
  ) => {
    const qid = id(1200 + n);
    quotes.push({
      id: qid, tenant_id: TENANT_ID, lead_id: null, account_id: null, engagement_id: null,
      public_token: `${'a1b2c3d4'.repeat(7)}${String(n).padStart(8, '0')}`, currency: 'ILS',
      shoot_date: null, valid_until: day(14), notes: null, deposit_percent: 30, balance_max_installments: 3,
      send_contract_on_accept: true, sent_at: null, sent_via: null, accepted_at: null, accepted_result: null,
      declined_at: null, decline_reason: null, created_by: ADMIN_USER_ID, created_at: at(-7), updated_at: at(-7),
      required_minor: 0, optional_selected_minor: 0, total_minor: 0, deposit_minor: 0, balance_minor: 0,
      ...fields,
    });
    lines.forEach(([description, ils, offeringId, optional, selected], i) => {
      quoteLines.push({
        id: id(1300 + n * 10 + i), tenant_id: TENANT_ID, quote_id: qid, offering_id: offeringId, description,
        qty: 1, unit_price_minor: ils * 100, line_total_minor: ils * 100, is_optional: optional,
        is_selected: !optional || selected, sort_order: i + 1, created_at: at(-7),
      });
    });
  };
  quote(1, {
    status: 'sent', title: 'Bar mitzvah: full evening', engagement_id: engagementId(2), account_id: accountId(2),
    shoot_date: day(46), sent_at: at(-5, 11), sent_via: 'email', created_at: at(-6),
    notes: 'Includes an online gallery with 350+ edited images. Album printed in Jerusalem, about 3 weeks.',
  }, [
    ['Bar Mitzvah: Full Evening (5 hours)', 4800, PKG.barMitzvah, false, true],
    ['Pre-event family session at home', 950, PKG.family, true, false],
    ['Printed album, 30 pages', 1200, null, true, false],
  ]);
  quote(2, {
    status: 'sent', title: 'Product launch evening', lead_id: id(1104), shoot_date: day(21), sent_at: at(-2, 15),
    sent_via: 'whatsapp', created_at: at(-3), valid_until: day(10),
  }, [
    ['Event Coverage (2 hours)', 2000, PKG.event, false, true],
    ['Second photographer', 900, null, true, false],
  ]);
  quote(3, {
    status: 'accepted', title: 'Company year-end evening', engagement_id: engagementId(3), account_id: accountId(3),
    shoot_date: day(12), sent_at: at(-16), sent_via: 'email', accepted_at: at(-15, 18), created_at: at(-17),
    accepted_result: { ok: true, engagement_id: engagementId(3) }, deposit_percent: 30,
  }, [['Event Coverage (2 hours)', 2000, PKG.event, false, true]]);
  quote(4, {
    status: 'draft', title: 'Bar mitzvah in March', lead_id: id(1101), created_at: at(0, 8),
  }, [['Bar Mitzvah: Full Evening (5 hours)', 4800, PKG.barMitzvah, false, true]]);

  return {
    quotes,
    quote_lines: quoteLines,
    tenant_automatic_emails: [],
    automatic_email_log: [],
    tenants: [tenant],
    user_profiles: [
      {
        id: ADMIN_USER_ID,
        tenant_id: TENANT_ID,
        email: ADMIN_EMAIL,
        role: ['tenant_admin'],
        person_id: null,
        language: 'en',
        country: 'IL',
        created_at: at(-200),
        updated_at: at(-200),
      },
      {
        id: CLIENT_USER_ID,
        tenant_id: TENANT_ID,
        email: DEMO_CLIENT.email,
        role: ['account_holder'],
        person_id: personId(DEMO_CLIENT.n),
        language: 'en',
        country: 'IL',
        created_at: at(-40),
        updated_at: at(-40),
      },
    ],
    offerings,
    consent_templates: [
      {
        id: id(901),
        tenant_id: TENANT_ID,
        name: 'Photography Services Agreement',
        content: CONTRACT_TEXT,
        version: 1,
        version_hash: 'demo',
        status: 'active',
        created_at: at(-180),
      },
    ],
    people,
    accounts,
    account_members: accountMembers,
    contact_preferences: contactPreferences,
    engagements,
    job_details: jobDetails,
    waiver_evidence: waiverEvidence,
    payments,
    job_payment_requests: paymentRequests,
    leads,
    audit_log: [],
    notification_log: [],
    seasons: [],
    categories: [],
    staff: [],
  };
}
