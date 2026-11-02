import { BaseService } from '@/services/base.service';
import { supabase } from '@/lib/supabase';
import type { Tenant } from '@shared/schemas';
import type { StoredAnswer } from '@shared/index';

/**
 * CRM leads — pipeline inquiries, a separate entity from students/families
 * (docs/plans/crm-lead-capture-channels.md). Tenant admins have full DML
 * under RLS; this service is deliberately thin over the `leads` table.
 * No `won` stage: winning is conversion (converted_account_id), phase 3.
 */

/** Every stage the database accepts (leads_stage_check). */
export const LEAD_STAGES = ['new', 'contacted', 'qualified', 'proposal', 'trial_booked', 'trial_done', 'won', 'lost'] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

/** Photographers: lead → quote → job (unchanged). Won = converted to a job. */
export const PHOTOGRAPHER_STAGES: readonly LeadStage[] = ['new', 'contacted', 'qualified', 'proposal', 'lost'];
/** Dance and other class studios: trial, then enrolled (won). */
export const CLASS_STAGES: readonly LeadStage[] = ['new', 'contacted', 'trial_booked', 'trial_done', 'won', 'lost'];

/** The stages a studio picks from; a lead already in another stage keeps it in its list. */
export function stagesFor(vertical: string | null | undefined, current?: LeadStage): readonly LeadStage[] {
  const base = vertical === 'photographer' ? PHOTOGRAPHER_STAGES : CLASS_STAGES;
  return current && !base.includes(current) ? [...base, current] : base;
}

export const LEAD_CHANNELS = [
  'email', 'website', 'whatsapp', 'linkedin', 'instagram',
  'facebook', 'google', 'sms', 'flyer', 'direct',
  'phone', 'walk_in', 'referral', 'other',
] as const;
export type LeadChannel = (typeof LEAD_CHANNELS)[number];

export interface Lead {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  stage: LeadStage;
  channel: LeadChannel;
  /** Campaign tag from the enquiry link (?campaign=), set on creation. */
  campaign: string | null;
  /** Named form the lead came from (lead_forms.id), if any. */
  form_id: string | null;
  /** Enquiry-form answers mapped to columns (step 2b). */
  child_name: string | null;
  child_birth_date: string | null;
  event_date: string | null;
  /** Other enquiry-form answers: { key: { label, value, display? } }. */
  answers: Record<string, StoredAnswer> | null;
  interest: string | null;
  offering_id: string | null;
  deal_value_minor: number | null;
  note: string | null;
  next_follow_up_at: string | null;
  last_contacted_at: string | null;
  last_communication_note: string | null;
  marketing_consent: boolean;
  converted_account_id: string | null;
  /** The enrolment this lead became (auto-linked on enrolment, or by hand). */
  converted_engagement_id: string | null;
  /** A possible matching enrolment, when several leads matched; confirm by hand. */
  suggested_engagement_id: string | null;
  created_at: string;
}

/** An enrolment, as the leads page names it. */
export interface EnrolmentChoice {
  id: string;
  person_id: string;
  account_id: string | null;
  student: string;
  offering: string;
  created_at: string;
}

export interface LeadCreateInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  channel: LeadChannel;
  interest?: string | null;
  deal_value_minor?: number | null;
  note?: string | null;
  next_follow_up_at?: string | null;
  marketing_consent?: boolean;
}

const LEAD_COLUMNS =
  'id, name, company, email, phone, stage, channel, campaign, form_id, child_name, child_birth_date, event_date, answers, interest, offering_id, deal_value_minor, note, ' +
  'next_follow_up_at, last_contacted_at, last_communication_note, marketing_consent, ' +
  'converted_account_id, converted_engagement_id, suggested_engagement_id, created_at';

export class LeadService extends BaseService {
  static async list(tenant: Tenant): Promise<Lead[]> {
    return this.withRetry(async () => {
      const { data, error } = await supabase
        .from('leads')
        .select(LEAD_COLUMNS)
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      // The column list is a runtime string, so supabase-js cannot infer the
      // row shape — Lead mirrors LEAD_COLUMNS by hand.
      return (data ?? []) as unknown as Lead[];
    }, 'LeadService.list');
  }

  static async create(tenant: Tenant, input: LeadCreateInput): Promise<Lead> {
    return this.withRetry(async () => {
      const { data, error } = await supabase
        .from('leads')
        .insert({
          tenant_id: tenant.id,
          name: input.name.trim(),
          email: input.email?.trim().toLowerCase() || null,
          phone: input.phone?.trim() || null,
          stage: 'new',
          channel: input.channel,
          interest: input.interest?.trim() || null,
          deal_value_minor: input.deal_value_minor ?? null,
          note: input.note?.trim() || null,
          next_follow_up_at: input.next_follow_up_at || null,
          marketing_consent: input.marketing_consent ?? false,
        })
        .select(LEAD_COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      return data as unknown as Lead;
    }, 'LeadService.create');
  }

  /**
   * Link a lead to an enrolment by hand: won, converted to the student's
   * family account. Other leads that only suggested this enrolment let go of it.
   */
  static async linkToEnrolment(tenant: Tenant, leadId: string, choice: EnrolmentChoice): Promise<void> {
    return this.withRetry(async () => {
      if (!choice.account_id) throw new Error('This student has no family account yet.');
      const { error } = await supabase
        .from('leads')
        .update({
          stage: 'won',
          converted_account_id: choice.account_id,
          converted_at: new Date().toISOString(),
          converted_engagement_id: choice.id,
          suggested_engagement_id: null,
        })
        .eq('id', leadId)
        .eq('tenant_id', tenant.id)
        .is('converted_account_id', null);
      if (error) throw new Error(error.message);
      await supabase
        .from('leads')
        .update({ suggested_engagement_id: null })
        .eq('tenant_id', tenant.id)
        .eq('suggested_engagement_id', choice.id);
    }, 'LeadService.linkToEnrolment');
  }

  /** Clear a wrong suggestion. */
  static async dismissSuggestion(tenant: Tenant, leadId: string): Promise<void> {
    return this.withRetry(async () => {
      const { error } = await supabase
        .from('leads')
        .update({ suggested_engagement_id: null })
        .eq('id', leadId)
        .eq('tenant_id', tenant.id);
      if (error) throw new Error(error.message);
    }, 'LeadService.dismissSuggestion');
  }

  /** Recent class enrolments (newest first), optionally only these ids, for naming and linking. */
  static async enrolments(tenant: Tenant, ids?: string[]): Promise<EnrolmentChoice[]> {
    return this.withRetry(async () => {
      let query = supabase
        .from('engagements')
        .select('id, person_id, created_at, people(name, account_id), offerings!inner(name, offering_type)')
        .eq('tenant_id', tenant.id)
        .eq('offerings.offering_type', 'class')
        .order('created_at', { ascending: false });
      query = ids ? query.in('id', ids) : query.limit(300);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      type Row = {
        id: string;
        person_id: string;
        created_at: string;
        people: { name: string; account_id: string | null } | null;
        offerings: { name: string } | null;
      };
      return ((data ?? []) as unknown as Row[]).map((r) => ({
        id: r.id,
        person_id: r.person_id,
        account_id: r.people?.account_id ?? null,
        student: r.people?.name ?? '—',
        offering: r.offerings?.name ?? '—',
        created_at: r.created_at,
      }));
    }, 'LeadService.enrolments');
  }

  static async updateStage(tenant: Tenant, id: string, stage: LeadStage): Promise<void> {
    return this.withRetry(async () => {
      const { error } = await supabase
        .from('leads')
        .update({ stage })
        .eq('id', id)
        .eq('tenant_id', tenant.id);
      if (error) throw new Error(error.message);
    }, 'LeadService.updateStage');
  }
}
