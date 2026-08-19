/**
 * VENDORED COPY — DO NOT EDIT HERE.
 *
 * Source of truth: the mobile-crm repo, `contracts/contact.v1.ts`
 * (https://github.com/miriamrteller/mobile-crm), with its golden fixture
 * vendored alongside at `fixtures/contacts.v1.json`. Any contract change
 * lands in mobile-crm first and is re-vendored here; a breaking shape change
 * bumps CONTRACT_VERSION in both repos in lockstep.
 *
 * The CRM app validates every response against this schema and treats a
 * mismatch as an error state — never as renderable data. Nullable fields are
 * rendered as "—" by the app; a backend that cannot source a field MUST send
 * null, never a fabricated value or empty string.
 *
 * Differences from the source file (types only, zero runtime change): the
 * app-internal `types/contact` import and its `satisfies z.ZodType<...>`
 * clauses are stripped; the types are exported via z.infer instead.
 */
import { z } from "npm:zod@3.22.4";

export const CONTRACT_VERSION = 1 as const;

export const stageSchemaV1 = z.enum([
  "New",
  "Contacted",
  "Qualified",
  "Proposal",
  "Won",
  "Lost",
]);

export const channelSchemaV1 = z.enum([
  "Email",
  "Website",
  "WhatsApp",
  "LinkedIn",
  "Instagram",
]);

export const contactSchemaV1 = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  company: z.string().nullable(),
  title: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  stage: stageSchemaV1,
  channel: channelSchemaV1,
  dealValue: z.number().nullable(),
  lastContactedAt: z.string().nullable(),
  nextFollowUpAt: z.string().nullable(),
  previousClient: z.boolean(),
  marketingConsent: z.boolean(),
  owner: z.string(),
  note: z.string().nullable(),
  lastCommunicationNote: z.string().nullable(),
  lastProductPurchased: z.string().nullable(),
  lastProductInquired: z.string().nullable(),
});

export const contactsResponseSchemaV1 = z.object({
  contractVersion: z.literal(CONTRACT_VERSION),
  /**
   * ISO 4217 code for ALL dealValue amounts in this response (one currency
   * per data source). Optional; omitted means "USD". Per-contact currencies
   * are a contract-v2 feature (they also require a normalized sort amount).
   */
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  contacts: z.array(contactSchemaV1),
});

export const DEFAULT_CURRENCY = "USD";

export type StageV1 = z.infer<typeof stageSchemaV1>;
export type ChannelV1 = z.infer<typeof channelSchemaV1>;
export type ContactV1 = z.infer<typeof contactSchemaV1>;
export type ContactsResponseV1 = z.infer<typeof contactsResponseSchemaV1>;
