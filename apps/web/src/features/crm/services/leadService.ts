import { BaseService } from '@/services/base.service';
import { supabase } from '@/lib/supabase';
import type { Tenant } from '@shared/schemas';

/**
 * CRM leads — pipeline inquiries, a separate entity from students/families
 * (docs/plans/crm-lead-capture-channels.md). Tenant admins have full DML
 * under RLS; this service is deliberately thin over the `leads` table.
 * No `won` stage: winning is conversion (converted_account_id), phase 3.
 */

export const LEAD_STAGES = ['new', 'contacted', 'qualified', 'proposal', 'lost'] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const LEAD_CHANNELS = ['email', 'website', 'whatsapp', 'linkedin', 'instagram'] as const;
export type LeadChannel = (typeof LEAD_CHANNELS)[number];

export interface Lead {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  stage: LeadStage;
  channel: LeadChannel;
  interest: string | null;
  deal_value_minor: number | null;
  note: string | null;
  next_follow_up_at: string | null;
  last_contacted_at: string | null;
  last_communication_note: string | null;
  marketing_consent: boolean;
  converted_account_id: string | null;
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
  'id, name, company, email, phone, stage, channel, interest, deal_value_minor, note, ' +
  'next_follow_up_at, last_contacted_at, last_communication_note, marketing_consent, ' +
  'converted_account_id, created_at';

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
