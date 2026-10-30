/**
 * In-browser versions of the database RPCs the photographer screens call.
 * They mirror the SQL in supabase/migrations closely enough for the demo:
 * same arguments, same return shapes, same main validation errors.
 */
import { DemoRpcError, type DemoContext, type RpcHandler, type Row } from './fakeSupabase';
import { TENANT_ID } from './seed';

function rows(ctx: DemoContext, table: string): Row[] {
  return ctx.db[table] ?? (ctx.db[table] = []);
}

function requireAdmin(ctx: DemoContext): Row {
  if (!ctx.user) throw new DemoRpcError('Authentication required');
  const profile = rows(ctx, 'user_profiles').find((p) => p.id === ctx.user?.id);
  const roles = (profile?.role as string[] | undefined) ?? [];
  if (!roles.includes('tenant_admin')) throw new DemoRpcError('Forbidden');
  return profile as Row;
}

function audit(ctx: DemoContext, action: string, entityType: string, entityId: string, after: Row = {}) {
  rows(ctx, 'audit_log').push({
    id: ctx.uuid(),
    tenant_id: TENANT_ID,
    actor_id: ctx.user?.id ?? null,
    action,
    entity_type: entityType,
    entity_id: entityId,
    after_state: after,
    created_at: ctx.now(),
  });
}

/** job_resolve_client: reuse a person by email, else create person + account. */
export function resolveClient(
  ctx: DemoContext,
  input: { personId?: string | null; name?: string | null; email?: string | null; phone?: string | null },
): { person_id: string; account_id: string; created: boolean } {
  const people = rows(ctx, 'people');
  const email = input.email?.trim().toLowerCase() || null;
  const name = input.name?.trim() || null;
  let person: Row | undefined;
  if (input.personId) {
    person = people.find((p) => p.id === input.personId && p.tenant_id === TENANT_ID);
    if (!person) throw new DemoRpcError('Client not found');
  } else if (email) {
    person = people.find((p) => String(p.email ?? '').toLowerCase() === email);
  }
  let created = false;
  if (!person) {
    if (!name) throw new DemoRpcError('Client name is required');
    const pid = ctx.uuid();
    const aid = ctx.uuid();
    person = {
      id: pid, tenant_id: TENANT_ID, name, email, status: 'active', account_id: aid, user_profile_id: null,
      date_of_birth: null, medical_notes: null, allergies: null, photo_consent: false, media_consent: false,
      created_at: ctx.now(), updated_at: ctx.now(),
    };
    people.push(person);
    rows(ctx, 'accounts').push({ id: aid, tenant_id: TENANT_ID, name, person_id: pid, created_at: ctx.now() });
    rows(ctx, 'account_members').push({
      id: ctx.uuid(), tenant_id: TENANT_ID, account_id: aid, person_id: pid, role: 'account_holder', user_profile_id: null,
    });
    created = true;
  }
  const phone = input.phone?.trim();
  if (phone) {
    const prefs = rows(ctx, 'contact_preferences');
    const existing = prefs.find((p) => p.person_id === person?.id);
    if (!existing) {
      prefs.push({
        id: ctx.uuid(), tenant_id: TENANT_ID, person_id: person.id, email_opted_in: true,
        whatsapp_number: phone, whatsapp_opted_in: false, whatsapp_verified: false,
      });
    } else if (!existing.whatsapp_number) {
      existing.whatsapp_number = phone;
    }
  }
  return { person_id: person.id as string, account_id: person.account_id as string, created };
}

/** job_insert: engagement + job_details pair. */
export function insertJob(
  ctx: DemoContext,
  input: {
    personId: string;
    offeringId: string;
    startsAt?: string | null;
    endsAt?: string | null;
    location?: string | null;
    notes?: string | null;
    leadId?: string | null;
  },
): string {
  const offering = rows(ctx, 'offerings').find((o) => o.id === input.offeringId);
  if (!offering) throw new DemoRpcError('Package not found');
  const starts = input.startsAt || null;
  let ends = starts ? input.endsAt || null : null;
  if (starts && !ends) {
    ends = new Date(new Date(starts).getTime() + Number(offering.duration_mins ?? 60) * 60_000).toISOString();
  }
  const eid = ctx.uuid();
  rows(ctx, 'engagements').push({
    id: eid, tenant_id: TENANT_ID, person_id: input.personId, offering_id: input.offeringId, season_id: null,
    status: 'active', booked_starts_at: starts, booked_ends_at: ends, waiver_evidence_id: null,
    created_at: ctx.now(), updated_at: ctx.now(),
  });
  rows(ctx, 'job_details').push({
    engagement_id: eid, tenant_id: TENANT_ID, job_status: starts ? 'booked' : 'enquiry',
    location: input.location?.trim() || null, notes: input.notes?.trim() || null, lead_id: input.leadId ?? null,
    gallery_url: null, gallery_released_at: null, created_at: ctx.now(), updated_at: ctx.now(),
  });
  return eid;
}

function tenantConfigRow(ctx: DemoContext): Row[] {
  const t = rows(ctx, 'tenants')[0];
  if (!t) return [];
  return [{ ...t, tenant_subdomain: t.subdomain }];
}

export const baseRpcs: Record<string, RpcHandler> = {
  get_tenant_config_by_subdomain: (_args, ctx) => tenantConfigRow(ctx),

  get_tenant_features: (_args, ctx) => (rows(ctx, 'tenants')[0]?.enabled_features as string[]) ?? [],

  get_my_tenant_id: () => TENANT_ID,

  get_my_profile: (_args, ctx) => {
    if (!ctx.user) return [];
    return rows(ctx, 'user_profiles').filter((p) => p.id === ctx.user?.id);
  },

  get_my_person_id: (_args, ctx) => rows(ctx, 'user_profiles').find((p) => p.id === ctx.user?.id)?.person_id ?? null,

  check_subdomain_available: () => false,

  create_job: (args, ctx) => {
    requireAdmin(ctx);
    if (!args.p_offering_id) throw new DemoRpcError('Package is required');
    const starts = (args.p_booked_starts_at as string | undefined) ?? null;
    const ends = (args.p_booked_ends_at as string | undefined) ?? null;
    if (starts && ends && ends <= starts) throw new DemoRpcError('End time must be after start time');
    const client = resolveClient(ctx, {
      personId: args.p_person_id as string | undefined,
      name: args.p_client_name as string | undefined,
      email: args.p_client_email as string | undefined,
      phone: args.p_client_phone as string | undefined,
    });
    const eid = insertJob(ctx, {
      personId: client.person_id,
      offeringId: args.p_offering_id as string,
      startsAt: starts,
      endsAt: ends,
      location: args.p_location as string | undefined,
      notes: args.p_notes as string | undefined,
    });
    audit(ctx, 'INSERT', 'job_details', eid, { person_id: client.person_id });
    return { engagement_id: eid, person_id: client.person_id, account_id: client.account_id, client_created: client.created };
  },

  convert_lead_to_job: (args, ctx) => {
    requireAdmin(ctx);
    const lead = rows(ctx, 'leads').find((l) => l.id === args.p_lead_id);
    if (!lead) throw new DemoRpcError('Lead not found');
    if (lead.converted_account_id) throw new DemoRpcError('Lead already converted');
    const offeringId = (args.p_offering_id as string | undefined) ?? (lead.offering_id as string | null);
    if (!offeringId) throw new DemoRpcError('Package is required');
    const client = resolveClient(ctx, {
      name: lead.name as string,
      email: lead.email as string | null,
      phone: lead.phone as string | null,
    });
    const notes = ((args.p_notes as string | undefined)?.trim() || (lead.note as string | null) || (lead.interest as string | null)) ?? null;
    const eid = insertJob(ctx, {
      personId: client.person_id,
      offeringId,
      startsAt: (args.p_booked_starts_at as string | undefined) ?? null,
      endsAt: (args.p_booked_ends_at as string | undefined) ?? null,
      location: args.p_location as string | undefined,
      notes,
      leadId: lead.id as string,
    });
    lead.converted_account_id = client.account_id;
    lead.converted_at = ctx.now();
    lead.updated_at = ctx.now();
    audit(ctx, 'UPDATE', 'leads', lead.id as string, { engagement_id: eid });
    return {
      engagement_id: eid,
      person_id: client.person_id,
      account_id: client.account_id,
      lead_id: lead.id,
      client_created: client.created,
    };
  },
};
