import { ChargeMetadataSchema, type ChargeMetadata } from "../types.ts";

/**
 * Grow exposes four free-text "custom fields" (cField1–cField4) that round-trip through the
 * payment process and back on the notify webhook. We use them to carry our ChargeMetadata so
 * the webhook can rebuild it without a server-side lookup:
 *
 *   cField1 = tenant_id        (also used for per-tenant webhook routing)
 *   cField2 = engagement_id
 *   cField3 = billing_account_id
 *   cField4 = JSON of the remaining metadata (charge_type, schedule, offering, amounts)
 */
export interface GrowCustomFields {
  cField1: string;
  cField2: string;
  cField3: string;
  cField4: string;
}

interface PackedAux {
  ct: ChargeMetadata["charge_type"];
  bs?: string;
  of?: string;
  pe?: string;
  ta?: string;
}

export function toGrowCustomFields(metadata: ChargeMetadata): GrowCustomFields {
  const aux: PackedAux = {
    ct: metadata.charge_type,
    bs: metadata.billing_schedule_id,
    of: metadata.offering_id,
    pe: metadata.person_id,
    ta: metadata.total_amount_minor,
  };
  return {
    cField1: metadata.tenant_id,
    cField2: metadata.engagement_id,
    cField3: metadata.billing_account_id,
    cField4: JSON.stringify(aux),
  };
}

export function fromGrowCustomFields(fields: Partial<GrowCustomFields>): ChargeMetadata {
  let aux: PackedAux;
  try {
    aux = fields.cField4 ? (JSON.parse(fields.cField4) as PackedAux) : ({ ct: "initial" } as PackedAux);
  } catch {
    aux = { ct: "initial" };
  }

  return ChargeMetadataSchema.parse({
    tenant_id: fields.cField1,
    engagement_id: fields.cField2,
    billing_account_id: fields.cField3,
    charge_type: aux.ct ?? "initial",
    billing_schedule_id: aux.bs,
    offering_id: aux.of,
    person_id: aux.pe,
    total_amount_minor: aux.ta,
  });
}

/** Read the tenant id from a Grow notify body before provider dispatch (webhook routing). */
export function peekGrowTenantId(body: Record<string, unknown>): string | undefined {
  const data = (body.data ?? body) as Record<string, unknown>;
  const cField1 = data.cField1 ?? (body as Record<string, unknown>).cField1;
  return typeof cField1 === "string" && cField1.length > 0 ? cField1 : undefined;
}
