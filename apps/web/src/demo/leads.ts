/**
 * Demo handlers for the public enquiry form (/inquire, /embed/inquire). They
 * mirror supabase/functions/crm-lead-capture and get_lead_form, so a demo
 * enquiry lands on the Leads page like a real one. There is no CAPTCHA and no
 * rate limit here: nothing leaves the browser.
 */
import {
  formLinkEmail,
  formQuestions,
  leadFormKindFor,
  parseLeadFormConfig,
  validateLeadAnswers,
  websiteInstructionsEmail,
} from '@shared/index';
import queryClient from '@/lib/query-client';
import { DemoRpcError, type DemoContext, type FunctionHandler, type Row, type RpcHandler } from './fakeSupabase';
import { sendToOutbox } from './outbox';
import { ADMIN_EMAIL } from './seed';

function rows(ctx: DemoContext, table: string): Row[] {
  return ctx.db[table] ?? (ctx.db[table] = []);
}

function nonEmpty(value: unknown): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed ? trimmed : null;
}

/** _shared/crm-contract/lead-ingest-core.ts channelFromSrc */
function channelFromSrc(src: unknown): string {
  const s = typeof src === 'string' ? src.trim().toLowerCase() : '';
  return ['instagram', 'linkedin', 'whatsapp', 'email'].includes(s) ? s : 'website';
}

/** _shared/crm-contract/lead-capture-guard.ts normaliseCampaign */
function normaliseCampaign(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned.slice(0, 100) : null;
}

function publicClasses(ctx: DemoContext, tenantId: string): Array<{ id: string; name: string }> {
  return rows(ctx, 'offerings')
    .filter(
      (o) =>
        o.tenant_id === tenantId &&
        o.offering_type === 'class' &&
        o.is_public !== false &&
        (o.status ?? 'active') === 'active',
    )
    .map((o) => ({ id: String(o.id), name: String(o.name ?? '') }));
}

export const leadFunctions: Record<string, FunctionHandler> = {
  'crm-lead-capture': (body, ctx) => {
    const subdomain = String(body.tenantSubdomain ?? '').toLowerCase();
    const name = nonEmpty(body.name);
    if (!subdomain || !name) return { error: 'Invalid payload' };
    // Honeypot: a bot filled the hidden field. Pretend success, store nothing.
    if (nonEmpty(body.website)) return { outcome: 'created' };

    const tenant = rows(ctx, 'tenants').find((t) => t.subdomain === subdomain);
    if (!tenant) return { error: 'Unknown tenant' };

    const config = parseLeadFormConfig(tenant.lead_form);
    const kind = leadFormKindFor(tenant.skin as string | null, tenant.business_preset as string | null);
    const needsClasses = config.presets.class_interest?.enabled === true && kind === 'classes';
    const questions = formQuestions(config, kind, needsClasses ? publicClasses(ctx, String(tenant.id)) : []);
    const checked = validateLeadAnswers(questions, body.answers ?? {});
    if (!checked.ok) return { error: 'invalid_answers', fields: checked.invalid };
    const form = questions.length > 0 ? { columns: checked.columns, answers: checked.answers } : null;

    const now = new Date().toISOString();
    const email = nonEmpty(body.email)?.toLowerCase() ?? null;
    const note = nonEmpty(body.message);
    const leads = rows(ctx, 'leads');

    // writeInboundLead: a repeat enquiry from the same email updates the open lead.
    let lead = email
      ? leads
          .filter((l) => l.tenant_id === tenant.id && l.email === email && l.stage !== 'lost' && !l.converted_account_id)
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0]
      : undefined;
    let outcome: 'created' | 'updated';
    if (lead) {
      Object.assign(lead, {
        last_contacted_at: now,
        last_communication_note: note,
        ...(form ? form.columns : {}),
        ...(form && Object.keys(form.answers).length > 0
          ? { answers: { ...((lead.answers as Record<string, unknown> | null) ?? {}), ...form.answers } }
          : {}),
        updated_at: now,
      });
      outcome = 'updated';
    } else {
      lead = {
        id: crypto.randomUUID(),
        tenant_id: tenant.id,
        name,
        company: null,
        email,
        phone: nonEmpty(body.phone),
        stage: 'new',
        channel: channelFromSrc(body.src),
        campaign: normaliseCampaign(body.campaign),
        interest: nonEmpty(body.interest),
        offering_id: null,
        deal_value_minor: null,
        note: null,
        child_name: null,
        child_birth_date: null,
        event_date: null,
        answers: {},
        last_contacted_at: now,
        last_communication_note: note,
        marketing_consent: false,
        source_ref: null,
        converted_account_id: null,
        created_at: now,
        updated_at: now,
        ...(form ? { ...form.columns, answers: form.answers } : {}),
      };
      leads.push(lead);
      outcome = 'created';
    }

    const consent = body.marketingConsent as { version?: string; items?: Array<{ kind: string; wording: string }> } | null;
    const optIns = consent?.items ?? [];
    if (optIns.length > 0) {
      for (const item of optIns) {
        rows(ctx, 'consent_records').push({
          id: crypto.randomUUID(),
          tenant_id: tenant.id,
          lead_id: lead.id,
          kind: item.kind,
          granted: true,
          wording: item.wording,
          wording_version: consent?.version ?? null,
          source: 'inquiry',
          created_at: now,
        });
      }
      lead.marketing_consent = true;
    }

    // notifyTenantOfLead: the studio gets an email about the enquiry.
    const he = tenant.language_default === 'he';
    sendToOutbox({
      to: String(tenant.contact_email ?? ADMIN_EMAIL),
      subject:
        outcome === 'created'
          ? he ? `ליד חדש: ${name}` : `New lead: ${name}`
          : he ? `הודעה חדשה מליד קיים: ${name}` : `New message from lead: ${name}`,
      body: [
        he ? `התקבלה פנייה חדשה במערכת הלידים (${String(tenant.name)}).` : `A new inquiry landed in your leads inbox (${String(tenant.name)}).`,
        email,
        nonEmpty(body.phone),
        note,
      ]
        .filter(Boolean)
        .join('\n'),
      link: { label: he ? 'לידים' : 'Open leads', href: '#/admin/leads' },
    });

    void queryClient.invalidateQueries();
    return { outcome };
  },
};

function adminTenant(ctx: DemoContext): Row {
  if (!ctx.user) throw new DemoRpcError('Unauthorized');
  const profile = rows(ctx, 'user_profiles').find((p) => p.id === ctx.user?.id);
  const roles = (profile?.role as string[] | undefined) ?? [];
  if (!roles.includes('tenant_admin')) throw new DemoRpcError('Forbidden');
  const tenant = rows(ctx, 'tenants').find((t) => t.id === profile?.tenant_id);
  if (!tenant) throw new DemoRpcError('Tenant not found');
  return tenant;
}

/**
 * send-lead-form-link: the studio emails its form link to someone, or the
 * "add the form to your website" steps to whoever runs the site. Same email
 * text as the real function; it goes to the demo outbox.
 */
leadFunctions['send-lead-form-link'] = (body, ctx) => {
  const tenant = adminTenant(ctx);
  const recipient = nonEmpty(body.email)?.toLowerCase() ?? '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) return { error: 'invalid_email' };
  const kind = body.kind === 'web_instructions' ? 'web_instructions' : 'form';
  const lang = body.lang === 'he' || body.lang === 'en' ? body.lang : tenant.language_default === 'he' ? 'he' : 'en';
  const studio = String(tenant.name || tenant.subdomain);
  // The studio's own host: the demo's origin, as the Settings snippet uses.
  const formOrigin = window.location.origin;
  const email =
    kind === 'form'
      ? formLinkEmail({
          studio,
          recipientName: nonEmpty(body.name),
          formUrl: `${formOrigin}/inquire?src=direct`,
          lang,
          colour: tenant.primary_color as string | null,
        })
      : websiteInstructionsEmail({ studio, formOrigin, lang });
  sendToOutbox({
    to: recipient,
    subject: email.subject,
    body: email.text,
    ...(kind === 'form'
      ? { link: { label: lang === 'he' ? 'פתיחת הטופס' : 'Open the form', href: '#/inquire?src=direct' } }
      : {}),
  });
  return { ok: true };
};

export const leadRpcs: Record<string, RpcHandler> = {
  /** get_lead_form(p_tenant_id): the studio's questions, readable by anyone. */
  get_lead_form: (args, ctx) => {
    const tenant = rows(ctx, 'tenants').find((t) => t.id === args.p_tenant_id);
    if (!tenant) throw new DemoRpcError('Tenant not found');
    return tenant.lead_form ?? {};
  },
};
