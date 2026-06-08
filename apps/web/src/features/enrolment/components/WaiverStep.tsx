import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import { invalidateWaiverStatus } from '../hooks/useWaiverStatus';
import type { ConsentTemplate } from '@shared/schemas';

interface WaiverStepProps {
  personId: string;
  template: ConsentTemplate;
  offeringId: string;
  /** account_members.id for the signing guardian (NOT accountId). Absent for self-signing adults. */
  accountMemberId?: string;
  /**
   * When provided, Edge Function calls use `Authorization: WaiverToken <token>`
   * instead of the current Supabase session. Used for the guest email-link flow.
   */
  waiverToken?: string;
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
}

export function WaiverStep({
  personId,
  template,
  offeringId,
  accountMemberId,
  waiverToken,
  onComplete,
  onPrevious,
  canGoBack,
  studentName,
  className,
  termName,
}: WaiverStepProps) {
  const { t } = useTranslation();
  const tenant = useTenant();
  const queryClient = useQueryClient();

  // Stable idempotency key for the lifetime of this component mount
  const idempotencyKey = useRef(crypto.randomUUID());
  const viewTokenRef = useRef<{ view_token: string; viewed_at_ts: number } | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const [viewTokenReady, setViewTokenReady] = useState(false);
  const [tokenExpired, setTokenExpired] = useState(false);
  const [viewError, setViewError] = useState<string | null>(null);
  const [affirmed, setAffirmed] = useState(false);
  const [typedName, setTypedName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

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

  async function handleSubmit() {
    if (!viewTokenRef.current || !affirmed || typedName.trim().length < 2) return;
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
      },
    });

    if (error?.message?.includes('view_token expired')) {
      viewTokenRef.current = null;
      setViewTokenReady(false);
      setTokenExpired(true);
    } else if (error) {
      setSubmitError(error.message ?? t('common.error'));
    } else if (data?.evidence_id && tenant?.id) {
      void invalidateWaiverStatus(queryClient, tenant.id, personId, offeringId);
      onComplete(data.evidence_id as string);
    }

    setIsSubmitting(false);
  }

  const canSubmit = viewTokenReady && affirmed && typedName.trim().length >= 2 && !isSubmitting;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">{template.name}</h2>

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
        aria-label={t('enrolment.waiver_document_region', { defaultValue: 'Waiver document' })}
        className="relative h-72 overflow-y-auto rounded-md border border-border bg-muted/30 p-4 text-sm leading-relaxed whitespace-pre-wrap focus:outline-none"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable region requires tabIndex for keyboard navigation per WAI-ARIA best practices
        tabIndex={0}
      >
        {template.content}
        {/* Sentinel: signing form only unlocks once this is fully visible */}
        <div ref={sentinelRef} className="h-1" aria-hidden="true" />
      </div>

      {!viewTokenReady && !tokenExpired && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
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
            defaultValue: 'Please scroll to the bottom again to re-confirm you have read the waiver.',
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
              aria-label={t('enrolment.waiver_checkbox_label', { defaultValue: 'I have read and accept this waiver' })}
            />
            <span className="text-sm">
              {t('enrolment.waiver_checkbox_label', { defaultValue: 'I have read and accept this waiver' })}
            </span>
          </label>

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
          className="ml-auto"
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
