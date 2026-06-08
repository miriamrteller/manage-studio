import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useWaiverTemplates } from '@/features/waivers/hooks/useWaiverTemplates';
import { useWaiverEvidence } from '@/features/waivers/hooks/useWaiverEvidence';
import type { ConsentTemplate } from '@shared/schemas';

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

  async function handleSubmit(e: React.FormEvent) {
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
  const [page, setPage] = useState(1);
  const { data, isLoading } = useWaiverEvidence(page);

  function exportCsv() {
    if (!data?.evidence.length) return;
    const headers = ['id', 'person_id', 'signed_by_name', 'signed_by_email', 'signed_by_role', 'signed_at', 'consent_version', 'ip_address'];
    const rows = data.evidence.map((e) =>
      headers.map((h) => JSON.stringify((e as Record<string, unknown>)[h] ?? '')).join(','),
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `waiver-evidence-page${page}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('pages.waivers.evidence_title')}</h2>
        {!!data?.evidence.length && (
          <Button size="sm" variant="outline" onClick={exportCsv}>
            {t('pages.waivers.export_csv')}
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : !data?.evidence.length ? (
        <p className="text-sm text-muted-foreground">{t('pages.waivers.no_evidence')}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Person ID</th>
                <th className="px-3 py-2 text-left font-medium">Signed by</th>
                <th className="px-3 py-2 text-left font-medium">Role</th>
                <th className="px-3 py-2 text-left font-medium">Version</th>
                <th className="px-3 py-2 text-left font-medium">Signed at</th>
              </tr>
            </thead>
            <tbody>
              {data.evidence.map((e) => (
                <tr key={e.id} className="border-t border-border hover:bg-muted/20">
                  <td className="px-3 py-2 font-mono text-xs">{e.person_id.slice(0, 8)}…</td>
                  <td className="px-3 py-2">{e.signed_by_name}</td>
                  <td className="px-3 py-2">{e.signed_by_role}</td>
                  <td className="px-3 py-2">{e.consent_version}</td>
                  <td className="px-3 py-2">{new Date(e.signed_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > 50 && (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
            ←
          </Button>
          <span className="self-center text-sm text-muted-foreground">
            {page} / {Math.ceil(data.total / 50)}
          </span>
          <Button size="sm" variant="outline" onClick={() => setPage((p) => p + 1)} disabled={page >= Math.ceil(data.total / 50)}>
            →
          </Button>
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
