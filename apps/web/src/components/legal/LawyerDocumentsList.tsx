import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  fetchSignedFormsReview,
  lawyerDocumentsKey,
  packDocumentStatus,
  packDocumentsFor,
  revertLawyerDocument,
  saveLawyerText,
  signedFormsReviewKey,
  uploadLawyerPdf,
  useLawyerDocuments,
  type PackDocument,
  type UploadableDoc,
} from '@/legal/lawyerDocuments';
import { signedDocNoun } from '@/legal/packWording';
import { studioRenderContext, type TenantLegalProfile } from '@/legal/useLegalDocument';
import { prepareLegalMarkdown, tokenizeKnownValues } from '@/legal/render';
import { loadLegalTemplate } from '@/legal/templates';
import { countLiveDetails, LiveDetailEditor } from './LiveDetailEditor';

/** i18n key of a pack document's name. */
export function packDocumentLabelKey(doc: PackDocument, vertical: string | null | undefined): string {
  return doc === 'signed-forms' ? `legal.lawyer.forms_title.${signedDocNoun(vertical)}` : `legal.docs.${doc.replace('-', '_')}`;
}

/**
 * Each document in the studio's legal pack, its status (draft, acknowledged
 * draft, or lawyer-reviewed with its date) and how to replace it with the
 * lawyer's version: a PDF or edited text for the informational documents, the
 * Forms editor for the forms clients sign.
 */
export function LawyerDocumentsList({ legal }: { legal: TenantLegalProfile }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const tenantId = legal.tenantId;
  const docs = packDocumentsFor(legal.vertical, legal.teachesClasses !== false);
  const { data: uploads = [] } = useLawyerDocuments(tenantId);
  const { data: forms = null } = useQuery({
    queryKey: signedFormsReviewKey(tenantId),
    queryFn: () => fetchSignedFormsReview(tenantId),
  });
  const [editing, setEditing] = useState<UploadableDoc | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const dateFormat = new Intl.DateTimeFormat(i18n.language?.startsWith('he') ? 'he-IL' : 'en-GB', { dateStyle: 'medium' });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: lawyerDocumentsKey(tenantId) }),
      queryClient.invalidateQueries({ queryKey: ['tenant-legal-profile-by-id', tenantId] }),
      queryClient.invalidateQueries({ queryKey: ['tenant-legal-profile'] }),
      queryClient.invalidateQueries({ queryKey: ['legal-doc'] }),
    ]);
  };

  const errorText = (err: unknown) => {
    const m = err instanceof Error ? err.message : '';
    if (m === 'legal_document_not_pdf') return t('legal.lawyer.error_not_pdf');
    if (m === 'legal_document_too_large') return t('legal.lawyer.error_too_large');
    return t('legal.lawyer.error');
  };

  const upload = useMutation({
    mutationFn: (v: { doc: UploadableDoc; file: File; language: 'he' | 'en' }) =>
      uploadLawyerPdf(tenantId, v.doc, v.language, v.file),
    onSuccess: async () => {
      setMessage({ tone: 'ok', text: t('legal.lawyer.saved') });
      await refresh();
    },
    onError: (err) => setMessage({ tone: 'error', text: errorText(err) }),
  });

  const saveText = useMutation({
    mutationFn: (v: { doc: UploadableDoc; text: string; language: 'he' | 'en' }) => saveLawyerText(v.doc, v.language, v.text),
    onSuccess: async () => {
      setEditing(null);
      setMessage({ tone: 'ok', text: t('legal.lawyer.saved') });
      await refresh();
    },
    onError: (err) => setMessage({ tone: 'error', text: errorText(err) }),
  });

  const revert = useMutation({
    mutationFn: (doc: UploadableDoc) => revertLawyerDocument(doc),
    onSuccess: async (needsConfirm) => {
      setMessage({ tone: 'ok', text: needsConfirm ? t('legal.lawyer.reverted_confirm_again') : t('legal.lawyer.reverted') });
      await refresh();
    },
    onError: (err) => setMessage({ tone: 'error', text: errorText(err) }),
  });

  const busy = upload.isPending || saveText.isPending || revert.isPending;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t('legal.lawyer.intro')}</p>
      <ul className="divide-y divide-border rounded-md border border-border">
        {docs.map((doc) => {
          const status = packDocumentStatus(doc, legal, uploads, forms);
          const statusText =
            status.kind === 'reviewed'
              ? t(doc === 'signed-forms' ? 'legal.lawyer.status_reviewed_marked' : 'legal.lawyer.status_reviewed', {
                  date: dateFormat.format(new Date(status.date)),
                })
              : status.kind === 'acknowledged-draft'
                ? t('legal.lawyer.status_draft_acknowledged')
                : t('legal.lawyer.status_draft');
          const current = doc === 'signed-forms' ? undefined : uploads.find((u) => u.document === doc);
          return (
            <li key={doc} className="space-y-2 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{t(packDocumentLabelKey(doc, legal.vertical))}</span>
                <span
                  className={status.kind === 'reviewed' ? 'text-sm text-green-800' : 'text-sm text-amber-800'}
                  data-testid={`status-${doc}`}
                >
                  {statusText}
                </span>
              </div>
              {doc === 'signed-forms' ? (
                <p className="text-sm">
                  {t('legal.lawyer.forms_hint')}{' '}
                  <Link className="font-medium underline" to="/admin/setup/waivers">
                    {t('legal.lawyer.forms_link')}
                  </Link>
                </p>
              ) : (
                <DocumentActions
                  doc={doc}
                  legal={legal}
                  defaultLanguage={legal.languageDefault}
                  hasUpload={!!current}
                  currentText={current?.kind === 'text' ? current.content ?? '' : ''}
                  editing={editing === doc}
                  busy={busy}
                  onEdit={() => setEditing(editing === doc ? null : doc)}
                  onUpload={(file, language) => upload.mutate({ doc, file, language })}
                  onSaveText={(text, language) => saveText.mutate({ doc, text, language })}
                  onRevert={() => {
                    if (window.confirm(t('legal.lawyer.revert_confirm'))) revert.mutate(doc);
                  }}
                />
              )}
            </li>
          );
        })}
      </ul>
      <p aria-live="polite" className={message?.tone === 'error' ? 'text-sm text-red-700' : 'text-sm'}>
        {message?.text ?? ''}
      </p>
    </div>
  );
}

function DocumentActions(props: {
  doc: UploadableDoc;
  legal: TenantLegalProfile;
  defaultLanguage: 'he' | 'en';
  hasUpload: boolean;
  currentText: string;
  editing: boolean;
  busy: boolean;
  onEdit: () => void;
  onUpload: (file: File, language: 'he' | 'en') => void;
  onSaveText: (text: string, language: 'he' | 'en') => void;
  onRevert: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [language, setLanguage] = useState<'he' | 'en'>(props.defaultLanguage);
  const [text, setText] = useState(props.currentText);
  const [startedFromDraft, setStartedFromDraft] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const renderCtx = (lang: 'he' | 'en') => studioRenderContext(props.legal, props.doc, lang);

  // Opening the editor: a new version starts from the current draft with the
  // studio's details as live fields; an older text without them gets its
  // details turned into live fields (exact matches of today's values).
  useEffect(() => {
    if (!props.editing) return;
    let cancelled = false;
    if (props.currentText.trim()) {
      if (countLiveDetails(props.currentText) === 0) {
        const { text: converted, count } = tokenizeKnownValues(props.currentText, renderCtx(language));
        if (count > 0) {
          setText(converted);
          setNote(t('legal.lawyer.details_converted', { count }));
        }
      }
      return;
    }
    if (text.trim()) return;
    void (async () => {
      const raw = await loadLegalTemplate(props.doc, language);
      if (cancelled) return;
      setText(prepareLegalMarkdown(raw, renderCtx(language), { liveDetails: true }).markdown);
      setStartedFromDraft(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the editor opens or the language changes
  }, [props.editing, language]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`${id}-lang`} className="text-sm">
          {t('legal.lawyer.language_label')}
        </label>
        <select
          id={`${id}-lang`}
          className="form-input w-auto"
          value={language}
          onChange={(e) => {
            setLanguage(e.target.value === 'en' ? 'en' : 'he');
            // A draft nobody has edited yet follows the language.
            if (startedFromDraft) setText('');
          }}
        >
          <option value="he">{t('legal.lawyer.language_he')}</option>
          <option value="en">{t('legal.lawyer.language_en')}</option>
        </select>
        <label
          htmlFor={`${id}-file`}
          className="inline-flex cursor-pointer items-center rounded-md border border-border px-3 py-1.5 text-sm font-medium focus-within:outline-2"
        >
          {t('legal.lawyer.upload_pdf')}
          <input
            id={`${id}-file`}
            type="file"
            accept="application/pdf"
            className="sr-only"
            disabled={props.busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) props.onUpload(file, language);
            }}
          />
        </label>
        <Button size="sm" variant="outline" onClick={props.onEdit} disabled={props.busy} aria-expanded={props.editing}>
          {t('legal.lawyer.edit_text')}
        </Button>
        <p className="w-full text-xs text-muted-foreground">{t('legal.lawyer.prefer_editor_hint')}</p>
        {props.hasUpload && (
          <Button size="sm" variant="outline" onClick={props.onRevert} disabled={props.busy}>
            {t('legal.lawyer.revert')}
          </Button>
        )}
        <Link className="text-sm underline" to={`/legal/${props.doc}`} target="_blank" rel="noopener noreferrer">
          {t('legal.lawyer.view')}
        </Link>
      </div>
      {props.editing && (
        <div className="space-y-2">
          <p id={`${id}-text-label`} className="block text-sm font-medium">
            {t('legal.lawyer.text_label')}
          </p>
          <p id={`${id}-text-hint`} className="text-xs text-muted-foreground">
            {t('legal.lawyer.text_hint')} {t('legal.lawyer.live_details_hint')}
          </p>
          <LiveDetailEditor
            id={`${id}-text`}
            labelledBy={`${id}-text-label`}
            describedBy={`${id}-text-hint`}
            value={text}
            onChange={(v) => {
              setText(v);
              setStartedFromDraft(false);
            }}
            language={language}
            vertical={props.legal.vertical}
            healthDeclarations={props.legal.healthDeclarations}
            onPasteText={(pasted) => tokenizeKnownValues(pasted, renderCtx(language)).text}
          />
          {note && (
            <p role="status" className="text-sm">
              {note}
            </p>
          )}
          <Button size="sm" variant="primary" disabled={props.busy || !text.trim()} onClick={() => props.onSaveText(text, language)}>
            {t('legal.lawyer.save_text')}
          </Button>
        </div>
      )}
    </div>
  );
}
