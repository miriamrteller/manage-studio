/**
 * Pure mapping from manage-studio rows to the CRM v1 contact contract.
 * Consumed by the crm-contacts edge function (Deno) and by the vitest
 * contract test in apps/web (Node) — keep this file dependency-free.
 *
 * A CRM "contact" is a billing relationship, not a student:
 *   - one contact per account (the guardian / primary contact person), and
 *   - one contact per adult student who has no account but has enrolments.
 *
 * Stage ← enrolment status of ALL engagements in the contact's unit
 * (the account's students, or the standalone adult), first match wins:
 *
 *   | condition on the unit's engagements                        | stage    |
 *   |------------------------------------------------------------|----------|
 *   | any `active`                                               | Won      |
 *   | else any `pending_payment` / `pending_waiver` /            | Proposal |
 *   |   `pending_offer` (offer made, checkout not finished)      |          |
 *   | else any `admin_review` (interest shown, gated on review)  | Qualified|
 *   | else ≥1 engagement, all `cancelled`/`withdrawn`            | Lost     |
 *   |   (historical-only: the relationship ended — the           |          |
 *   |    previousClient flag records that they once converted)   |          |
 *   | no engagements at all                                      | New      |
 *
 * Fields with no genuine source in phase 1 are null, NEVER fabricated —
 * the app renders null as an em-dash by design:
 *   company, title, nextFollowUpAt, lastProductInquired → null (lead capture
 *   and product-inquiry history are phase 2), note → null (people.medical_notes
 *   and allergy data are deliberately NOT exposed to the CRM).
 * channel is a required enum in the contract (no null allowed); every phase-1
 * contact originates from the tenant's public web enrolment/booking flow, so
 * it is the constant "Website" until lead-source capture lands in phase 2.
 */

import type { ContactsResponseV1, ContactV1, StageV1 } from "./contact.v1.ts";

export interface CrmTenantRow {
  name: string;
  currency: string | null;
}

export interface CrmAccountRow {
  id: string;
  person_id: string;
}

export interface CrmPersonRow {
  id: string;
  account_id: string | null;
  name: string;
  email: string | null;
}

export interface CrmContactPrefsRow {
  person_id: string | null;
  email_opted_in: boolean;
  notify_announcements: boolean;
  whatsapp_number: string | null;
  voice_number: string | null;
}

export interface CrmEngagementRow {
  person_id: string;
  status: string;
  payment_received_at: string | null;
}

export interface CrmPaymentRow {
  account_id: string | null;
  person_id: string | null;
  offering_id: string | null;
  charge_type: string;
  status: string;
  total_amount_minor: number;
  paid_at: string | null;
}

export interface CrmOfferingRow {
  id: string;
  name: string;
}

export interface CrmNotificationRow {
  recipient_person_id: string | null;
  status: string;
  subject: string | null;
  body_preview: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface CrmContactsInput {
  tenant: CrmTenantRow;
  accounts: CrmAccountRow[];
  people: CrmPersonRow[];
  contactPreferences: CrmContactPrefsRow[];
  engagements: CrmEngagementRow[];
  payments: CrmPaymentRow[];
  offerings: CrmOfferingRow[];
  notifications: CrmNotificationRow[];
}

const OPEN_STATUSES = new Set(["pending_payment", "pending_waiver", "pending_offer"]);
const ENDED_STATUSES = new Set(["cancelled", "withdrawn"]);
const DEAL_PAYMENT_STATUSES = new Set(["succeeded", "partially_refunded"]);
const DELIVERED_NOTIFICATION_STATUSES = new Set(["sent", "delivered", "read"]);

interface ContactUnit {
  id: string;
  contactPersonId: string;
  /** account id for account units; null for standalone adults */
  accountId: string | null;
  personIds: Set<string>;
}

function stageFor(engagements: CrmEngagementRow[]): StageV1 {
  if (engagements.some((e) => e.status === "active")) return "Won";
  if (engagements.some((e) => OPEN_STATUSES.has(e.status))) return "Proposal";
  if (engagements.some((e) => e.status === "admin_review")) return "Qualified";
  if (engagements.length > 0) return "Lost";
  return "New";
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function mapContacts(input: CrmContactsInput): ContactsResponseV1 {
  const peopleById = new Map(input.people.map((p) => [p.id, p]));
  const prefsByPerson = new Map(
    input.contactPreferences
      .filter((p) => p.person_id !== null)
      .map((p) => [p.person_id as string, p]),
  );
  const offeringNameById = new Map(input.offerings.map((o) => [o.id, o.name]));

  const units: ContactUnit[] = [];
  const accountPrimaryPersonIds = new Set(input.accounts.map((a) => a.person_id));

  for (const account of input.accounts) {
    const personIds = new Set<string>([account.person_id]);
    for (const person of input.people) {
      if (person.account_id === account.id) personIds.add(person.id);
    }
    units.push({
      id: account.id,
      contactPersonId: account.person_id,
      accountId: account.id,
      personIds,
    });
  }

  const engagedPersonIds = new Set(input.engagements.map((e) => e.person_id));
  for (const person of input.people) {
    if (person.account_id !== null) continue;
    if (accountPrimaryPersonIds.has(person.id)) continue;
    if (!engagedPersonIds.has(person.id)) continue; // stray rows are not contacts
    units.push({
      id: person.id,
      contactPersonId: person.id,
      accountId: null,
      personIds: new Set([person.id]),
    });
  }

  const currencyRaw = input.tenant.currency ?? "";
  const currency = /^[A-Z]{3}$/.test(currencyRaw) ? currencyRaw : "ILS";

  const contacts: ContactV1[] = [];
  for (const unit of units) {
    const contactPerson = peopleById.get(unit.contactPersonId);
    if (!contactPerson) continue;

    const unitEngagements = input.engagements.filter((e) => unit.personIds.has(e.person_id));
    const unitPayments = input.payments.filter((p) =>
      (unit.accountId !== null && p.account_id === unit.accountId) ||
      (p.person_id !== null && unit.personIds.has(p.person_id))
    );

    const dealPayments = unitPayments.filter((p) => DEAL_PAYMENT_STATUSES.has(p.status));
    // Net of refund rows (charge_type 'refund' carries total_amount_minor <= 0).
    const dealValue = dealPayments.length > 0
      ? Math.round(dealPayments.reduce((sum, p) => sum + p.total_amount_minor, 0)) / 100
      : null;

    const purchases = dealPayments
      .filter((p) => p.charge_type !== "refund" && p.offering_id !== null && p.paid_at !== null)
      .sort((a, b) => (a.paid_at as string) < (b.paid_at as string) ? 1 : -1);
    const lastProductPurchased = purchases.length > 0
      ? offeringNameById.get(purchases[0].offering_id as string) ?? null
      : null;

    const delivered = input.notifications
      .filter((n) =>
        n.recipient_person_id !== null &&
        unit.personIds.has(n.recipient_person_id) &&
        DELIVERED_NOTIFICATION_STATUSES.has(n.status)
      )
      .sort((a, b) => (a.sent_at ?? a.created_at) < (b.sent_at ?? b.created_at) ? 1 : -1);
    const lastNotification = delivered[0] ?? null;

    const prefs = prefsByPerson.get(unit.contactPersonId) ?? null;

    contacts.push({
      id: unit.id,
      name: contactPerson.name,
      company: null,
      title: null,
      email: nonEmpty(contactPerson.email),
      phone: nonEmpty(prefs?.whatsapp_number) ?? nonEmpty(prefs?.voice_number),
      stage: stageFor(unitEngagements),
      channel: "Website",
      dealValue,
      lastContactedAt: lastNotification ? (lastNotification.sent_at ?? lastNotification.created_at) : null,
      nextFollowUpAt: null,
      previousClient: unitEngagements.some(
        (e) => ENDED_STATUSES.has(e.status) && e.payment_received_at !== null,
      ),
      // Defaults mirror resolve_notification_blast_recipients: a missing
      // contact_preferences row means the schema defaults (opted in) apply.
      marketingConsent: (prefs?.email_opted_in ?? true) && (prefs?.notify_announcements ?? true),
      owner: input.tenant.name,
      note: null,
      lastCommunicationNote: lastNotification
        ? nonEmpty(lastNotification.subject) ?? nonEmpty(lastNotification.body_preview)
        : null,
      lastProductPurchased,
      lastProductInquired: null,
    });
  }

  contacts.sort((a, b) => a.name.localeCompare(b.name));

  return { contractVersion: 1, currency, contacts };
}
