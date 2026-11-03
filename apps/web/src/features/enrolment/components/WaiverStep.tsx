import { ConsentCheckboxes } from '@/components/legal/ConsentCheckboxes';
import { CONSENT_WORDING_VERSION, consentWording, type ConsentState } from '@/legal/consents';
import { useLegalLang } from '@/legal/useLegalDocument';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { invalidateWaiverStatus } from '../hooks/useWaiverStatus';
import type { WaiverSigningConsentTemplate } from '@shared/schemas';
import { validateSignerDetails, type SignerDetailsErrors } from '@shared/signerDetails';
import {
  buildSignerInput,
  EMPTY_SIGNER_DRAFT,
  firstErrorFieldId,
  SignerDetailsForm,
  type SignerDraft,
} from './SignerDetailsForm';

interface WaiverStepProps {
  personId: string;
  template: WaiverSigningConsentTemplate;
  offeringId: string;
  /** account_members.id for the signing guardian (NOT accountId). Absent for self-signing adults. */
  accountMemberId?: string;
  /**
   * When provided, Edge Function calls use `Authorization: WaiverToken <token>`
   * instead of the current Supabase session. Used for the guest email-link flow.
   */
  waiverToken?: string;
  /** When set, links signed evidence to this pending_payment engagement (authenticated checkout). */
  engagementId?: string;
  /** Called with the evidence_id returned by accept-waiver so the stepper can link it to the engagement. */
  onComplete: (evidenceId: string) => void;
  onPrevious: () => void;
  canGoBack: boolean;
  /** Display name of the student being enrolled (shown in the context header). */
  studentName?: string;
  /** Display name of the class being enrolled in. */
  className?: string;
  /** Display name of the term/season. */
  termName?: string;
  /** True when the enrolled student is under 18 — shows the mandatory guardian declaration checkbox. */
  isMinorStudent?: boolean;
  /** True when the signed-in user's own person record IS the student. Triggers the hard block UI. */
  signerIsTheStudent?: boolean;
  /** When set, invalidates waiver-status cache after signing without calling useTenant(). */
  tenantIdForInvalidation?: string;
  /** Photographer job contract: show the separate, optional portfolio opt-in. */
  isJobContract?: boolean;
  /** The student's date of birth on file (YYYY-MM-DD), to pre-fill the child block. */
  studentDateOfBirth?: string | null;
  /**
   * Guest link only: the name and phone of the person the link was sent to
   * (get-waiver-engagement signerPrefill). The ID number and address are never
   * prefilled on a guest link.
   */
  guestSignerPrefill?: { fullName?: string | null; phone?: string | null };
}

/** "Health declaration (child)v1" -> "Health declaration": parents do not need the internal variant or version. */
export function displayTemplateName(name: string): string {
  return name.replace(/\s*\((?:child|adult|minor)\)\s*(?:v\s*\d+)?\s*$/i, '').replace(/\s+v\d+$/i, '').trim() || name;
}

export function WaiverStep(props: WaiverStepProps) {
  if (props.tenantIdForInvalidation || props.waiverToken) {
    return <WaiverStepInner {...props} invalidateTenantId={props.tenantIdForInvalidation} />;
  }
  return <WaiverStepWithTenant {...props} />;
}

function WaiverStepWithTenant(props: WaiverStepProps) {
  const tenant = useTenant();
  return <WaiverStepInner {...props} invalidateTenantId={props.tenantIdForInvalidation ?? tenant?.id} />;
}

function WaiverStepInner({
  personId,
  template,
  offeringId,
  accountMemberId,
  waiverToken,
  engagementId,
  onComplete,
  onPrevious,
  canGoBack,
  studentName,
  className,
  termName,
  isMinorStudent,
  signerIsTheStudent,
  invalidateTenantId,
  isJobContract,
  studentDateOfBirth,
  guestSignerPrefill,
}: WaiverStepProps & { invalidateTenantId?: string }) {
  const { t, i18n } = useTranslation();
  const appLanguage = i18n.language?.startsWith('he') ? 'he' : 'en';
  const legalLang = useLegalLang();
  const [portfolio, setPortfolio] = useState<ConsentState>({});
  const queryClient = useQueryClient();

  // Stable idempotency key for the lifetime of this component mount
  const idempotencyKey = useRef(crypto.randomUUID());
  const viewTokenRef = useRef<{ view_token: string; viewed_at_ts: number } | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const [guardianConfirmed, setGuardianConfirmed] = useState(false);
  const [viewTokenReady, setViewTokenReady] = useState(false);
  const [tokenExpired, setTokenExpired] = useState(false);
  const [viewError, setViewError] = useState<string | null>(null);
  const [affirmed, setAffirmed] = useState(false);
  const guestPrefill = waiverToken ? guestSignerPrefill : undefined;
  const [typedName, setTypedName] = useState(guestPrefill?.fullName ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [signerDraft, setSignerDraft] = useState<SignerDraft>({
    ...EMPTY_SIGNER_DRAFT,
    childName: studentName ?? '',
    childDob: studentDateOfBirth ?? '',
    phone: guestPrefill?.phone ?? '',
  });
  const [signerErrors, setSignerErrors] = useState<SignerDetailsErrors>({});

  // No name from an earlier signed form: the signer is the signed-in person
  // (or the adult student themself). Applied once that lookup has answered.
  const { user } = useCurrentUser();
  const signerFallbackName = ((signerIsTheStudent ? studentName : user?.full_name) ?? '').trim();
  const [lastChecked, setLastChecked] = useState(false);
  useEffect(() => {
    if (!waiverToken && lastChecked && signerFallbackName) setTypedName((n) => n || signerFallbackName);
  }, [waiverToken, lastChecked, signerFallbackName]);
  // Pre-fill from the signer's last signed form (signed-in users only; a guest link has no session).
  // Nothing typed is overwritten. The RPC returns the caller's own record only.
  useEffect(() => {
    if (waiverToken) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.rpc('get_my_last_signer_details');
      const last = data as {
        id_type?: string;
        id_number?: string;
        passport_country?: string;
        phone?: string;
        address?: string;
        full_name?: string;
      } | null;
      if (cancelled) return;
      setLastChecked(true);
      if (!last || typeof last !== 'object') return;
      setSignerDraft((d) =>
        d.idNumber || d.phone || d.address
          ? d
          : {
              ...d,
              idType: last.id_type === 'passport' ? 'passport' : 'israeli_id',
              idNumber: last.id_number ?? '',
              passportCountry: last.passport_country ?? '',
              phone: last.phone ?? '',
              address: last.address ?? '',
            },
      );
      setTypedName((n) => n || last.full_name || '');
    })();
    return () => {
      cancelled = true;
    };
  }, [waiverToken]);

  // IntersectionObserver: fires once when the bottom sentinel scrolls into view.
  // This triggers the server-side "viewed" event and issues a signed view_token.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          observer.disconnect();
          void callWaiverViewed();
        }
      },
      { threshold: 1.0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function callWaiverViewed() {
    setViewError(null);
    const authOverride = waiverToken ? { Authorization: `WaiverToken ${waiverToken}` } : undefined;
    const { data, error } = await supabase.functions.invoke('waiver-viewed', {
      body: { person_id: personId, consent_template_id: template.id },
      headers: authOverride,
    });
    if (error || !data?.view_token) {
      setViewError(t('enrolment.waiver_view_error', { defaultValue: 'Could not confirm reading. Please try scrolling again.' }));
      return;
    }
    viewTokenRef.current = { view_token: data.view_token, viewed_at_ts: data.viewed_at_ts };
    setViewTokenReady(true);
    setTokenExpired(false);
  }

  async function readInvokeErrorMessage(error: unknown, fallback: string): Promise<string> {
    if (error && typeof error === 'object' && 'context' in error) {
      try {
        const response = (error as { context?: Response }).context;
        if (response) {
          const body = (await response.json()) as { message?: string; error?: string };
          if (body.message) return body.message;
          if (body.error === 'guardian_confirmation_required') {
            return t('enrolment.waiver_guardian_required', {
              defaultValue:
                'This student is a minor. Please confirm you are signing as their parent or guardian.',
            });
          }
          if (body.error === 'studio_legal_not_ready') return t('legal.pack.signing_not_ready');
          if (body.error === 'signer_details_invalid') return t('enrolment.signer.error.server');
          if (body.error) return body.error;
        }
      } catch {
        // fall through
      }
    }
    if (error instanceof Error && error.message && !error.message.includes('non-2xx')) {
      return error.message;
    }
    return fallback;
  }

  async function handleSubmit() {
    if (!viewTokenRef.current || !affirmed || typedName.trim().length < 2) return;

    // Check the signer details here first (the server and database repeat the same rules).
    const confirmedWording = t('enrolment.signer.confirm');
    const signerInput = buildSignerInput(signerDraft, typedName.trim(), confirmedWording, Boolean(isMinorStudent));
    const checked = validateSignerDetails(signerInput, { requireChild: Boolean(isMinorStudent) });
    if (!checked.ok) {
      setSignerErrors(checked.errors);
      const focusId = firstErrorFieldId(checked.errors);
      if (focusId) document.getElementById(focusId)?.focus();
      return;
    }
    setSignerErrors({});

    setIsSubmitting(true);
    setSubmitError(null);

    const { data, error } = await supabase.functions.invoke('accept-waiver', {
      body: {
        person_id: personId,
        offering_id: offeringId,
        consent_template_id: template.id,
        consent_version: template.version,
        typed_name: typedName.trim(),
        idempotency_key: idempotencyKey.current,
        view_token: viewTokenRef.current.view_token,
        viewed_at_ts: viewTokenRef.current.viewed_at_ts,
        // account_members.id for guardian waivers (not accountId / accounts.id)
        account_member_id: accountMemberId,
        guardian_confirmed: guardianConfirmed,
        signer_details: signerInput,
        ...(engagementId ? { engagement_id: engagementId } : {}),
        ...(isJobContract
          ? {
              portfolio_consent: portfolio.portfolio === true,
              portfolio_wording: consentWording('portfolio', legalLang),
              consent_wording_version: CONSENT_WORDING_VERSION,
            }
          : {}),
      },
      headers: waiverToken ? { Authorization: `WaiverToken ${waiverToken}` } : undefined,
    });

    if (error?.message?.includes('view_token expired')) {
      viewTokenRef.current = null;
      setViewTokenReady(false);
      setTokenExpired(true);
    } else if (error) {
      setSubmitError(await readInvokeErrorMessage(error, t('common.error')));
    } else if (data?.evidence_id) {
      if (invalidateTenantId) {
        void invalidateWaiverStatus(queryClient, invalidateTenantId, personId, offeringId);
      }
      onComplete(data.evidence_id as string);
    }

    setIsSubmitting(false);
  }

  const canSubmit =
    viewTokenReady &&
    affirmed &&
    typedName.trim().length >= 2 &&
    (!isMinorStudent || guardianConfirmed) &&
    signerDraft.confirmed &&
    !isSubmitting;

  // Plan 4: hard block when a minor's own account attempts self-signing
  if (isMinorStudent && signerIsTheStudent) {
    return (
      <div className="rounded-lg border-2 border-destructive bg-destructive/10 p-5 space-y-3">
        <h3 className="font-semibold text-destructive">
          {t('enrolment.waiver_minor_cannot_sign_title')}
        </h3>
        <p className="text-sm text-destructive/80">
          {t('enrolment.waiver_minor_cannot_sign_body', {
            studentName: studentName ?? t('enrolment.waiver_this_student'),
          })}
        </p>
        {canGoBack && (
          <Button variant="outline" onClick={onPrevious}>
            {t('common.back')}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold" lang={template.language ?? undefined}>{displayTemplateName(template.name)}</h2>
      {/* The studio has this form only in the other language: say so plainly. */}
      {template.language && template.language !== appLanguage && (
        <p className="text-sm font-medium text-amber-800" role="note">
          {t(template.language === 'he' ? 'enrolment.waiver_in_hebrew' : 'enrolment.waiver_in_english')}
        </p>
      )}

      {/* Context: who is signing, for whom, and for which class */}
      {(studentName || className) && (
        <dl className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {studentName && (
            <>
              <dt className="font-medium text-muted-foreground">{t('enrolment.waiver_context_student', { defaultValue: 'Student' })}</dt>
              <dd>{studentName}</dd>
            </>
          )}
          {className && (
            <>
              <dt className="font-medium text-muted-foreground">{t('enrolment.waiver_context_class', { defaultValue: 'Class' })}</dt>
              <dd>{className}{termName ? ` — ${termName}` : ''}</dd>
            </>
          )}
        </dl>
      )}

      {/* Scrollable waiver document region */}
      <div
        role="region"
        aria-label={t('enrolment.waiver_document_region', { defaultValue: 'Form document' })}
        className="relative h-72 overflow-y-auto rounded-md border border-border bg-muted/30 p-4 text-sm leading-relaxed whitespace-pre-wrap focus:outline-none"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable region requires tabIndex for keyboard navigation per WAI-ARIA best practices
        tabIndex={0}
        lang={template.language ?? undefined}
        dir={template.language ? (template.language === 'he' ? 'rtl' : 'ltr') : undefined}
      >
        {template.content}
        {/* Sentinel: signing form only unlocks once this is fully visible */}
        <div ref={sentinelRef} className="h-1" aria-hidden="true" />
      </div>

      {!viewTokenReady && !tokenExpired && (
        <p className="text-sm font-medium text-foreground" aria-live="polite">
          <span aria-hidden="true">↓ </span>
          {t('enrolment.waiver_scroll_prompt', { defaultValue: 'Scroll to the bottom to enable signing' })}
        </p>
      )}

      {viewError && (
        <p className="text-sm text-destructive" role="alert">
          {viewError}
        </p>
      )}

      {tokenExpired && (
        <p className="text-sm text-warning" role="alert">
          {t('enrolment.waiver_token_expired', {
            defaultValue: 'Please scroll to the bottom again to re-confirm you have read the form.',
          })}
        </p>
      )}

      {/* Affirmation form — only shown once the sentinel has fired */}
      {(viewTokenReady || tokenExpired) && (
        <div className="space-y-3 pt-2">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={affirmed}
              onChange={(e) => setAffirmed(e.target.checked)}
              className="mt-0.5"
              aria-label={t('enrolment.waiver_checkbox_label', { defaultValue: 'I have read and accept this form' })}
            />
            <span className="text-sm">
              {t('enrolment.waiver_checkbox_label', { defaultValue: 'I have read and accept this form' })}
            </span>
          </label>

          {isJobContract && (
            <div className="rounded-md border p-3">
              <ConsentCheckboxes
                legend={t('legal.consents.portfolio_legend')}
                hint={t('legal.consents.portfolio_hint')}
                kinds={['portfolio']}
                value={portfolio}
                onChange={setPortfolio}
                lang={legalLang}
              />
            </div>
          )}

          {/* Guardian declaration — required when signing on behalf of a minor */}
          {isMinorStudent && (
            <label className="flex items-start gap-2 cursor-pointer rounded-md border border-amber-300 bg-amber-50 p-3">
              <input
                type="checkbox"
                checked={guardianConfirmed}
                onChange={(e) => setGuardianConfirmed(e.target.checked)}
                className="mt-0.5"
              />
              <span className="text-sm font-medium text-amber-900">
                {t('enrolment.waiver_guardian_confirm', {
                  studentName: studentName ?? t('enrolment.waiver_this_student'),
                })}
              </span>
            </label>
          )}

          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="waiver-typed-name">
              {t('enrolment.waiver_name_label', { defaultValue: 'Full legal name' })}
            </label>
            <input
              id="waiver-typed-name"
              type="text"
              autoComplete="name"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder={t('enrolment.waiver_name_placeholder', { defaultValue: 'Type your full legal name' })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <SignerDetailsForm
            draft={signerDraft}
            onChange={setSignerDraft}
            errors={signerErrors}
            showChild={Boolean(isMinorStudent)}
          />
        </div>
      )}

      {submitError && (
        <p className="text-sm text-destructive" role="alert">
          {submitError}
        </p>
      )}

      <div className="flex justify-between pt-2">
        {canGoBack && (
          <Button variant="outline" onClick={onPrevious} disabled={isSubmitting}>
            {t('common.back')}
          </Button>
        )}
        <Button
          className="ms-auto"
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {isSubmitting
            ? t('common.loading')
            : t('enrolment.waiver_submit', { defaultValue: 'Sign and Continue' })}
        </Button>
      </div>
    </div>
  );
}
