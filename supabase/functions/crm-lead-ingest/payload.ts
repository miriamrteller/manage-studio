import { z } from "npm:zod@3.22.4";
import { parseLeadEmail } from "../_shared/crm-contract/parse-lead-email.ts";

/** What crm-lead-ingest accepts, and how each kind becomes a lead (see index.ts). */
const emailPayload = z.object({
  tenantSubdomain: z.string().min(1),
  message: z.object({
    messageId: z.string().min(1),
    fromName: z.string().nullable(),
    fromEmail: z.string().nullable(),
    subject: z.string().nullable(),
    text: z.string().nullable(),
    receivedAt: z.string().datetime({ offset: true }).nullable(),
  }),
});

/** A website contact-form enquiry, already validated by the form's own function. */
const contactPayload = z.object({
  tenantSubdomain: z.string().min(1),
  contact: z.object({
    /** One id per submission: a retried call is a duplicate, not a second lead. */
    submissionId: z.string().uuid(),
    name: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(320),
    message: z.string().max(5000),
  }),
});

export const payloadSchema = z.union([emailPayload, contactPayload]);

export type IngestPayload = z.infer<typeof payloadSchema>;

/** Lead fields and write options for either caller. */
export function leadFromPayload(payload: IngestPayload, now: string) {
  if ("contact" in payload) {
    const c = payload.contact;
    return {
      fields: {
        name: c.name,
        email: c.email.toLowerCase(),
        phone: null,
        interest: null,
        lastCommunicationNote: c.message.trim() || null,
      },
      opts: { channel: "website" as const, sourceRef: `contact:${c.submissionId}`, receivedAt: now },
    };
  }
  return {
    fields: parseLeadEmail(payload.message),
    opts: {
      channel: "email" as const,
      sourceRef: payload.message.messageId,
      receivedAt: payload.message.receivedAt ?? now,
    },
  };
}
