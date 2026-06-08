import { useState, useEffect, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useWaiverTemplates } from '@/features/waivers/hooks/useWaiverTemplates';
import { useWaiverEvidence } from '@/features/waivers/hooks/useWaiverEvidence';
import { useTenant } from '@/hooks/useTenant';
import { TenantDB } from '@/lib/db';
import type { ConsentTemplate } from '@shared/schemas';
import type { WaiverEvidenceFilters } from '@/features/waivers/service';

/** Compute SHA-256 hex of a string in the browser. */
async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function StatusBadge({ status }: { status: ConsentTemplate['status'] }) {
  const { t } = useTranslation();
  const styles: Record<ConsentTemplate['status'], string> = {
    draft: 'bg-neutral-100 text-neutral-600',
    approved: 'bg-blue-100 text-blue-700',
    active: 'bg-green-100 text-green-700',
    archived: 'bg-neutral-100 text-neutral-400',
  };
  const labels: Record<ConsentTemplate['status'], string> = {
    draft: t('pages.waivers.status_draft'),
    approved: t('pages.waivers.status_approved'),
    active: t('pages.waivers.status_active'),
    archived: t('pages.waivers.status_archived'),
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function DraftForm({ onCreated }: { onCreated: () => void }) {
  const { t } = useTranslation();
  const { createDraft, isCreating } = useWaiverTemplates();
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !content.trim()) return;
    setError(null);
    const version_hash = await sha256Hex(content);
    createDraft(
      { name: name.trim(), content: content.trim(), version_hash },
      {
        onSuccess: () => {
          setName('');
          setContent('');
          onCreated();
        },
        onError: (err) => setError(err.message),
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-dashed border-border p-4">
      <h3 className="font-semibold">{t('pages.waivers.draft_form_title')}</h3>
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="waiver-template-name">
          {t('pages.waivers.name_label')}
        </label>
        <input
          id="waiver-template-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('pages.waivers.name_placeholder')}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          required
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="waiver-template-content">
          {t('pages.waivers.content_label')}
        </label>
        <textarea
          id="waiver-template-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={10}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
          required
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={isCreating || !name.trim() || !content.trim()}>
        {isCreating ? t('common.loading') : t('pages.waivers.save_draft')}
      </Button>
    </form>
  );
}

function TemplateActions({ template }: { template: ConsentTemplate }) {
  const { t } = useTranslation();
  const { approveTemplate, activateTemplate, archiveTemplate, isApproving, isActivating, isArchiving } =
    useWaiverTemplates();

  function handleActivate() {
    if (!window.confirm(t('pages.waivers.activate_confirm'))) return;
    activateTemplate(template.id);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {template.status === 'draft' && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => approveTemplate(template.id)}
          disabled={isApproving}
        >
          {t('pages.waivers.promote_to_approved')}
        </Button>
      )}
      {(template.status === 'draft' || template.status === 'approved') && (
        <Button
          size="sm"
          variant="primary"
          onClick={handleActivate}
          disabled={isActivating}
        >
          {t('pages.waivers.promote_to_active')}
        </Button>
      )}
      {(template.status === 'draft' || template.status === 'approved') && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => archiveTemplate(template.id)}
          disabled={isArchiving}
        >
          {t('pages.waivers.archive')}
        </Button>
      )}
    </div>
  );
}

function EvidenceSection() {
  const { t } = useTranslation();
  const tenant = useTenant();

  // Filter raw inputs (text is debounced before querying)
  const [rawStudent, setRawStudent]   = useState('');
  const [rawEmail, setRawEmail]       = useState('');
  const [offeringId, setOfferingId]   = useState('');
  const [seasonId, setSeasonId]       = useState('');

  // Debounced filters sent to the service (400 ms)
  const [filters, setFilters] = useState<WaiverEvidenceFilters>({});
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters({
        studentName: rawStudent.trim() || undefined,
        signerEmail: rawEmail.trim() || undefined,
        offeringId:  offeringId || undefined,
        seasonId:    seasonId || undefined,
      });
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [rawStudent, rawEmail, offeringId, seasonId]);

  // Dropdown data for class + term selects
  const { data: offerings } = useQuery({
    queryKey: ['waiver-filter-offerings', tenant?.id],
    queryFn: async () => {
      const { data } = await TenantDB.selectFor('offerings', tenant!)
        .select('id, name')
        .order('name');
      return (data ?? []) as { id: string; name: string }[];
    },
    enabled: !!tenant?.id,
    staleTime: 60_000,
  });

  const { data: seasons } = useQuery({
    queryKey: ['waiver-filter-seasons', tenant?.id],
    queryFn: async () => {
      const { data } = await TenantDB.selectFor('seasons', tenant!)
        .select('id, name')
        .order('name', { ascending: false });
      return (data ?? []) as { id: string; name: string }[];
    },
    enabled: !!tenant?.id,
    staleTime: 60_000,
  });

  const { data, isLoading } = useWaiverEvidence(page, filters);

  const hasFilters = !!(rawStudent || rawEmail || offeringId || seasonId);

  function clearFilters() {
    setRawStudent('');
    setRawEmail('');
    setOfferingId('');
    setSeasonId('');
  }

  function exportCsv() {
    if (!data?.evidence.length) return;
    const headers = ['id', 'student_name', 'class_name', 'signed_by_name', 'signed_by_email', 'signed_by_role', 'signed_at', 'consent_version', 'ip_address'];
    const rows = data.evidence.map((e) => {
      const studentName = e.people?.name ?? e.person_id;
      const className   = e.offerings?.name ?? '';
      const values: Record<string, unknown> = { ...e, student_name: studentName, class_name: className };
      return headers.map((h) => JSON.stringify(values[h] ?? '')).join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `waiver-evidence-p${page}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const inputCls = 'w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring';
  const selectCls = inputCls;

  const totalPages = data ? Math.ceil(data.total / 50) : 1;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('pages.waivers.evidence_title')}</h2>
        {!!data?.evidence.length && (
          <Button size="sm" variant="outline" onClick={exportCsv}>
            {t('pages.waivers.export_csv')}
          </Button>
        )}
      </div>

      {/* Filter bar */}
      <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{t('pages.waivers.filter_student')}</label>
            <input
              type="text"
              value={rawStudent}
              onChange={(e) => setRawStudent(e.target.value)}
              placeholder={t('pages.waivers.filter_student_placeholder')}
              className={inputCls}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{t('pages.waivers.filter_signer_email')}</label>
            <input
              type="text"
              value={rawEmail}
              onChange={(e) => setRawEmail(e.target.value)}
              placeholder={t('pages.waivers.filter_email_placeholder')}
              className={inputCls}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{t('pages.waivers.filter_class')}</label>
            <select value={offeringId} onChange={(e) => setOfferingId(e.target.value)} className={selectCls}>
              <option value="">{t('pages.waivers.filter_all')}</option>
              {(offerings ?? []).map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{t('pages.waivers.filter_term')}</label>
            <select value={seasonId} onChange={(e) => setSeasonId(e.target.value)} className={selectCls}>
              <option value="">{t('pages.waivers.filter_all')}</option>
              {(seasons ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            {t('pages.waivers.filter_clear')}
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : !data?.evidence.length ? (
        <p className="text-sm text-muted-foreground">
          {hasFilters ? t('pages.waivers.no_evidence_filtered') : t('pages.waivers.no_evidence')}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{t('pages.waivers.col_student')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('pages.waivers.col_class')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('pages.waivers.col_signed_by')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('pages.waivers.col_email')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('pages.waivers.col_role')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('pages.waivers.col_version')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('pages.waivers.col_signed_at')}</th>
              </tr>
            </thead>
            <tbody>
              {data.evidence.map((e) => (
                <tr key={e.id} className="border-t border-border hover:bg-muted/20">
                  <td className="px-3 py-2">{e.people?.name ?? e.person_id.slice(0, 8) + '…'}</td>
                  <td className="px-3 py-2">{e.offerings?.name ?? '—'}</td>
                  <td className="px-3 py-2">{e.signed_by_name}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{e.signed_by_email}</td>
                  <td className="px-3 py-2">{e.signed_by_role}</td>
                  <td className="px-3 py-2">{e.consent_version}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{new Date(e.signed_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > 50 && (
        <div className="flex gap-2 items-center">
          <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>←</Button>
          <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
          <Button size="sm" variant="outline" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages}>→</Button>
        </div>
      )}
    </section>
  );
}

export default function WaiversPage() {
  const { t } = useTranslation();
  const { templates, isLoading, error } = useWaiverTemplates();
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="max-w-3xl mx-auto space-y-8 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('pages.waivers.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('pages.waivers.description')}</p>
        </div>
        <Button onClick={() => setShowForm((s) => !s)}>
          {showForm ? t('common.cancel') : `+ ${t('pages.waivers.draft_form_title')}`}
        </Button>
      </div>

      {/* V1 architectural limit note */}
      <p className="text-xs text-muted-foreground italic">{t('pages.waivers.v1_limit_note')}</p>

      {showForm && <DraftForm onCreated={() => setShowForm(false)} />}

      <section className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error.message}</p>
        ) : !templates.length ? (
          <p className="text-sm text-muted-foreground">{t('pages.waivers.no_templates')}</p>
        ) : (
          <div className="space-y-3">
            {templates.map((template) => (
              <div key={template.id} className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <span className="font-medium">{template.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">v{template.version}</span>
                  </div>
                  <StatusBadge status={template.status} />
                </div>
                <pre className="text-xs bg-muted/40 rounded p-2 max-h-32 overflow-y-auto whitespace-pre-wrap font-mono">
                  {template.content.slice(0, 400)}{template.content.length > 400 ? '…' : ''}
                </pre>
                <TemplateActions template={template} />
              </div>
            ))}
          </div>
        )}
      </section>

      <hr className="border-border" />

      <EvidenceSection />
    </div>
  );
}
