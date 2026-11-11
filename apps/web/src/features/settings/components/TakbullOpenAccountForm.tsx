import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { FEATURES } from '@shared/index';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import queryClient from '@/lib/query-client';
import { useTenant } from '@/hooks/useTenant';
import { useFeatureGate } from '@/hooks/useFeatureGate';
import { isDevSite } from '@/lib/devStudioPicker';
import { functionInvokeErrorMessage, parseFunctionInvokeBody } from '@/lib/parseFunctionInvokeError';

/**
 * Settings → Payments, dev website only (Takbull PR 7, docs/plans/TAKBULL-INTEGRATION.md):
 * "Open my Takbull account (testing)". OpalSwift opens the studio's own Takbull account with
 * its own keys (takbull-open-account). Business details are prefilled from the studio's legal
 * details; the owner types the Takbull password, their ID number and the bank account, which go
 * to Takbull only and are never kept by OpalSwift.
 */
export function TakbullOpenAccountForm() {
  const { hasFeature } = useFeatureGate();
  if (!isDevSite() || !hasFeature(FEATURES.billing.takbullTesting)) return null;
  return <OpenAccount />;
}

type Prefill = {
  opened: boolean;
  openedAt: string | null;
  businessName: string;
  businessNumber: string;
  businessStatus: string | null;
  businessType: number | null;
  businessEmail: string;
  phone: string;
  street: string;
  city: string;
  ownerFirstName: string;
  ownerLastName: string;
};

type Fields = {
  loginEmail: string;
  password: string;
  businessName: string;
  businessNumber: string;
  businessType: string;
  businessEmail: string;
  phone: string;
  street: string;
  city: string;
  ownerFirstName: string;
  ownerLastName: string;
  ownerIdNumber: string;
  bankCode: string;
  branchCode: string;
  accountNumber: string;
};

const EMPTY: Fields = {
  loginEmail: '', password: '', businessName: '', businessNumber: '', businessType: '', businessEmail: '',
  phone: '', street: '', city: '', ownerFirstName: '', ownerLastName: '', ownerIdNumber: '',
  bankCode: '', branchCode: '', accountNumber: '',
};

/** Prefilled fields that sit behind "Details we filled in for you" while they have a value. */
const FILLED: Array<keyof Fields> = [
  'businessName', 'businessNumber', 'businessType', 'businessEmail', 'phone', 'street', 'city', 'ownerFirstName', 'ownerLastName',
];

export function passwordOk(pw: string): boolean {
  return pw.length >= 8 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw);
}

function OpenAccount() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [badFields, setBadFields] = useState<string[]>([]);

  const prefill = useQuery({
    queryKey: ['takbull-open-account-prefill', tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async (): Promise<Prefill> => {
      const { data, error } = await supabase.functions.invoke('takbull-open-account', { body: { action: 'prefill' } });
      const body = await parseFunctionInvokeBody(data, error);
      if (!body?.prefill) throw new Error('prefill unavailable');
      return body.prefill as Prefill;
    },
  });

  const p = prefill.data;
  useEffect(() => {
    if (!p) return;
    setFields((f) => ({
      ...f,
      loginEmail: f.loginEmail || p.businessEmail,
      businessName: f.businessName || p.businessName,
      businessNumber: f.businessNumber || p.businessNumber,
      businessType: f.businessType || (p.businessType ? String(p.businessType) : ''),
      businessEmail: f.businessEmail || p.businessEmail,
      phone: f.phone || p.phone,
      street: f.street || p.street,
      city: f.city || p.city,
      ownerFirstName: f.ownerFirstName || p.ownerFirstName,
      ownerLastName: f.ownerLastName || p.ownerLastName,
    }));
  }, [p]);

  const open = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('takbull-open-account', {
        body: { action: 'open', fields: { ...fields, businessType: Number(fields.businessType) } },
      });
      const body = await parseFunctionInvokeBody(data, error);
      if (body?.ok === true) return body;
      if (body?.code === 'invalid_input' && Array.isArray(body.fields)) {
        setBadFields(body.fields as string[]);
        throw new Error(t('settings.takbull_open.invalid_input'));
      }
      const code = typeof body?.code === 'string' ? body.code : null;
      const known = code ? t(`settings.takbull_open.error_${code}`, { defaultValue: '' }) : '';
      const detail = typeof body?.message === 'string' && body.message ? ` (${body.message})` : '';
      throw new Error(known ? `${known}${detail}` : functionInvokeErrorMessage(error, body, t('settings.takbull_open.error_takbull_error')));
    },
    onSuccess: async () => {
      setFields((f) => ({ ...f, password: '', ownerIdNumber: '', bankCode: '', branchCode: '', accountNumber: '' }));
      setMessage({ kind: 'ok', text: t('settings.takbull_open.opened') });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['takbull-open-account-prefill'] }),
        queryClient.invalidateQueries({ queryKey: ['takbull-credentials-status'] }),
        queryClient.invalidateQueries({ queryKey: ['tenant'] }),
      ]);
    },
    onError: (err: Error) => setMessage({ kind: 'error', text: err.message }),
  });

  if (prefill.isLoading) return null;
  if (p?.opened) {
    return (
      <section className="space-y-2 max-w-lg" aria-labelledby="takbull-open-title">
        <h2 id="takbull-open-title" className="text-lg font-semibold text-foreground">{t('settings.takbull_open.title')}</h2>
        <p className="text-sm" role="status">
          {t('settings.takbull_open.already_opened', { date: p.openedAt ? new Date(p.openedAt).toLocaleDateString() : '' })}
        </p>
        {message?.kind === 'ok' && <p className="text-sm text-muted-foreground" role="status">{message.text}</p>}
      </section>
    );
  }

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = e.target.value;
    setFields((f) => ({ ...f, [k]: value }));
    setBadFields((b) => b.filter((x) => x !== k));
  };
  const field = (k: keyof Fields, opts: { type?: string; ltr?: boolean; autoComplete?: string; hint?: string } = {}) => (
    <label key={k} className="block text-sm font-medium">
      {t(`settings.takbull_open.field_${k}`)}
      <input
        type={opts.type ?? 'text'}
        dir={opts.ltr ? 'ltr' : undefined}
        className={`mt-1 w-full border rounded px-3 py-2 ${badFields.includes(k) ? 'border-destructive' : 'border-border'}`}
        value={fields[k]}
        onChange={set(k)}
        autoComplete={opts.autoComplete ?? 'off'}
        aria-invalid={badFields.includes(k) || undefined}
      />
      {opts.hint && <span className="mt-1 block text-xs font-normal text-muted-foreground">{opts.hint}</span>}
    </label>
  );
  const typeSelect = (
    <label key="businessType" className="block text-sm font-medium">
      {t('settings.takbull_open.field_businessType')}
      <select
        className={`mt-1 w-full border rounded px-3 py-2 bg-background ${badFields.includes('businessType') ? 'border-destructive' : 'border-border'}`}
        value={fields.businessType}
        onChange={set('businessType')}
      >
        <option value="">{t('settings.takbull_open.choose')}</option>
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <option key={n} value={String(n)}>{t(`settings.takbull_open.type_${n}`)}</option>
        ))}
      </select>
    </label>
  );
  const render = (k: keyof Fields) => (k === 'businessType' ? typeSelect : field(k, k === 'businessEmail' || k === 'phone' ? { ltr: true } : {}));
  // A prefilled field stays out of sight until it's missing or Takbull didn't accept it.
  const hidden = FILLED.filter((k) => fields[k].trim() && !badFields.includes(k));
  const shown = FILLED.filter((k) => !hidden.includes(k));
  const pwBad = fields.password.length > 0 && !passwordOk(fields.password);

  return (
    <section className="space-y-4 max-w-lg" aria-labelledby="takbull-open-title">
      <h2 id="takbull-open-title" className="text-lg font-semibold text-foreground">{t('settings.takbull_open.title')}</h2>
      <p className="text-sm text-muted-foreground">{t('settings.takbull_open.hint')}</p>
      {p?.businessStatus === 'not_registered' && (
        <p className="text-sm text-muted-foreground" role="note">{t('settings.takbull_open.not_registered')}</p>
      )}

      {field('loginEmail', { type: 'email', ltr: true, autoComplete: 'email', hint: t('settings.takbull_open.login_email_hint') })}
      {field('password', { type: 'password', ltr: true, autoComplete: 'new-password', hint: t('settings.takbull_open.password_hint') })}
      {pwBad && <p className="text-xs text-destructive" role="status">{t('settings.takbull_open.password_weak')}</p>}
      {shown.map(render)}
      {field('ownerIdNumber', { ltr: true })}
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">{t('settings.takbull_open.bank_title')}</legend>
        {field('bankCode', { ltr: true })}
        {field('branchCode', { ltr: true })}
        {field('accountNumber', { ltr: true })}
      </fieldset>
      <p className="text-xs text-muted-foreground">{t('settings.takbull_open.not_kept')}</p>

      {hidden.length > 0 && (
        <details className="rounded-md border border-border p-3 text-sm">
          <summary className="cursor-pointer font-medium">{t('settings.takbull_open.filled_for_you')}</summary>
          <div className="mt-3 space-y-3">{hidden.map(render)}</div>
        </details>
      )}

      {message && (
        <p
          className={`text-sm ${message.kind === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}
          role={message.kind === 'error' ? 'alert' : 'status'}
        >
          {message.text}
        </p>
      )}
      <Button
        type="button"
        variant="primary"
        disabled={open.isPending}
        isLoading={open.isPending}
        onClick={() => {
          setMessage(null);
          open.mutate();
        }}
      >
        {t('settings.takbull_open.open')}
      </Button>
    </section>
  );
}
