import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { VerticalId } from '@shared/config/tenant-presets';
import { tenantHasEnrolmentTerms, type TenantLegalProfile } from './useLegalDocument';

/**
 * Lawyer-reviewed versions of a studio's legal documents (legal pack, part 2).
 * Informational documents get a PDF or edited text (tenant_legal_documents);
 * the forms clients sign are edited in the Forms editor and marked
 * lawyer-reviewed there (consent_templates.lawyer_reviewed_at).
 */

/** Informational documents a studio can replace with its lawyer's version. */
export const UPLOADABLE_DOCS = ['studio-privacy', 'enrolment-terms', 'accessibility', 'cookies'] as const;
export type UploadableDoc = (typeof UPLOADABLE_DOCS)[number];

/** Every document the legal pack covers; "signed-forms" stands for the forms clients sign. */
export type PackDocument = UploadableDoc | 'signed-forms';

export const LEGAL_DOCUMENTS_BUCKET = 'tenant-legal-documents';
export const MAX_LEGAL_PDF_BYTES = 10 * 1024 * 1024;

export interface LawyerDocument {
  document: UploadableDoc;
  language: 'he' | 'en';
  kind: 'pdf' | 'text';
  content: string | null;
  storagePath: string | null;
  fileName: string | null;
  uploadedAt: string;
}

/** The documents this studio must cover, in the order the pack lists them. */
export function packDocumentsFor(vertical: VerticalId): PackDocument[] {
  return [
    'studio-privacy',
    ...(tenantHasEnrolmentTerms(vertical) ? (['enrolment-terms'] as const) : []),
    'accessibility',
    'cookies',
    'signed-forms',
  ];
}

export async function fetchLawyerDocuments(tenantId: string): Promise<LawyerDocument[]> {
  const { data, error } = await supabase.rpc('get_tenant_legal_documents', { p_tenant_id: tenantId });
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    document: row.document as UploadableDoc,
    language: row.language === 'en' ? 'en' : 'he',
    kind: row.kind === 'pdf' ? 'pdf' : 'text',
    content: (row.content as string | null) ?? null,
    storagePath: (row.storage_path as string | null) ?? null,
    fileName: (row.file_name as string | null) ?? null,
    uploadedAt: row.uploaded_at as string,
  }));
}

export const lawyerDocumentsKey = (tenantId: string | undefined) => ['lawyer-documents', tenantId];

export function useLawyerDocuments(tenantId: string | undefined) {
  return useQuery({
    queryKey: lawyerDocumentsKey(tenantId),
    enabled: !!tenantId,
    staleTime: 60 * 1000,
    queryFn: () => fetchLawyerDocuments(tenantId!),
  });
}

/** The signed forms' review state: reviewed when every active form is marked. */
export interface SignedFormsReview {
  activeCount: number;
  reviewedCount: number;
  /** Latest review date among active forms, when all are reviewed. */
  reviewedAt: string | null;
}

export async function fetchSignedFormsReview(tenantId: string): Promise<SignedFormsReview> {
  const { data, error } = await supabase
    .from('consent_templates')
    .select('lawyer_reviewed_at')
    .eq('tenant_id', tenantId)
    .eq('status', 'active');
  if (error) throw error;
  const rows = (data ?? []) as Array<{ lawyer_reviewed_at: string | null }>;
  const reviewed = rows.filter((r) => r.lawyer_reviewed_at).map((r) => r.lawyer_reviewed_at as string);
  return {
    activeCount: rows.length,
    reviewedCount: reviewed.length,
    reviewedAt: rows.length > 0 && reviewed.length === rows.length ? reviewed.sort()[reviewed.length - 1] : null,
  };
}

export const signedFormsReviewKey = (tenantId: string | undefined) => ['signed-forms-review', tenantId];

export type PackDocumentStatus =
  | { kind: 'reviewed'; date: string }
  | { kind: 'acknowledged-draft' }
  | { kind: 'draft' };

/**
 * One document's status: lawyer-reviewed (with its date), a draft the admin
 * acknowledged, or a draft still to confirm.
 */
export function packDocumentStatus(
  doc: PackDocument,
  legal: Pick<TenantLegalProfile, 'packRequired' | 'packAcknowledgedAt' | 'packAckDrafts'>,
  uploads: LawyerDocument[],
  forms: SignedFormsReview | null,
): PackDocumentStatus {
  if (doc === 'signed-forms') {
    if (forms?.reviewedAt) return { kind: 'reviewed', date: forms.reviewedAt };
  } else {
    const upload = uploads.find((u) => u.document === doc);
    if (upload) return { kind: 'reviewed', date: upload.uploadedAt };
  }
  const acknowledged = !legal.packRequired || (!!legal.packAcknowledgedAt && legal.packAckDrafts.includes(doc));
  return acknowledged ? { kind: 'acknowledged-draft' } : { kind: 'draft' };
}

/** The documents that are still drafts (what the acknowledgement covers as drafts). */
export function draftDocuments(docs: PackDocument[], uploads: LawyerDocument[], forms: SignedFormsReview | null): PackDocument[] {
  return docs.filter((doc) =>
    doc === 'signed-forms' ? !forms?.reviewedAt : !uploads.some((u) => u.document === doc),
  );
}

function randomId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Upload the lawyer's PDF, then make it the document's current version. */
export async function uploadLawyerPdf(
  tenantId: string,
  document: UploadableDoc,
  language: 'he' | 'en',
  file: File,
): Promise<void> {
  if (file.type !== 'application/pdf') throw new Error('legal_document_not_pdf');
  if (file.size > MAX_LEGAL_PDF_BYTES) throw new Error('legal_document_too_large');
  const path = `${tenantId}/${document}/${randomId()}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from(LEGAL_DOCUMENTS_BUCKET)
    .upload(path, file, { contentType: 'application/pdf', upsert: false });
  if (uploadError) throw uploadError;
  const { error } = await supabase.rpc('save_tenant_legal_document', {
    p_document: document,
    p_language: language,
    p_kind: 'pdf',
    p_storage_path: path,
    p_file_name: file.name.slice(0, 200),
  });
  if (error) throw error;
}

/** Store the lawyer's edited text as the document's current version. */
export async function saveLawyerText(document: UploadableDoc, language: 'he' | 'en', content: string): Promise<void> {
  const { error } = await supabase.rpc('save_tenant_legal_document', {
    p_document: document,
    p_language: language,
    p_kind: 'text',
    p_content: content,
  });
  if (error) throw error;
}

/** Go back to the generated draft. Returns true when the admin must confirm the legal pack again. */
export async function revertLawyerDocument(document: UploadableDoc): Promise<boolean> {
  const { data, error } = await supabase.rpc('revert_tenant_legal_document', { p_document: document });
  if (error) throw error;
  return data === true;
}

/** A local link to a lawyer-reviewed PDF (the bucket is private; access follows its policies). */
export async function lawyerPdfUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from(LEGAL_DOCUMENTS_BUCKET).download(storagePath);
  if (error || !data) throw error ?? new Error('download failed');
  return URL.createObjectURL(data);
}

/** Details that also feed the derived lines (business line, "run by", contacts) in every document. */
const IDENTITY_KEYS = ['legal_name', 'business_status', 'business_number', 'personal_id', 'passport_number', 'passport_country', 'no_israeli_id', 'email', 'phone', 'address'];

/**
 * Lawyer-reviewed PDFs that use any of the changed details (a PDF can't
 * update itself). Text versions keep their details live, so they never need it.
 */
export function pdfsAffectedByChange(
  uploads: LawyerDocument[],
  changedKeys: string[],
  placeholdersByKey: Record<string, Partial<Record<string, string[]>>>,
): UploadableDoc[] {
  if (changedKeys.length === 0) return [];
  return uploads
    .filter((u) => u.kind === 'pdf')
    .map((u) => u.document)
    .filter(
      (doc, i, all) =>
        all.indexOf(doc) === i &&
        changedKeys.some((k) => IDENTITY_KEYS.includes(k) || (placeholdersByKey[k]?.[doc]?.length ?? 0) > 0),
    );
}
