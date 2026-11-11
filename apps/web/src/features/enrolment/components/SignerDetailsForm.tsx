import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { SignerDetailsErrors, SignerDetailsInput } from '@shared/signerDetails';

/** What the signer types in the details block. The signer's name is the form's "Full legal name" field. */
export interface SignerDraft {
  idType: 'israeli_id' | 'passport';
  idNumber: string;
  passportCountry: string;
  phone: string;
  address: string;
  childName: string;
  childDob: string;
  confirmed: boolean;
}

export const EMPTY_SIGNER_DRAFT: SignerDraft = {
  idType: 'israeli_id',
  idNumber: '',
  passportCountry: '',
  phone: '',
  address: '',
  childName: '',
  childDob: '',
  confirmed: false,
};

/** Turns the draft into what accept-waiver validates. `confirmedWording` is the tick's text as shown. */
export function buildSignerInput(
  draft: SignerDraft,
  fullName: string,
  confirmedWording: string,
  includeChild: boolean,
): SignerDetailsInput {
  return {
    signer: {
      full_name: fullName,
      id_type: draft.idType,
      id_number: draft.idNumber,
      ...(draft.idType === 'passport' ? { passport_country: draft.passportCountry } : {}),
      phone: draft.phone,
      address: draft.address,
    },
    ...(includeChild ? { child: { full_name: draft.childName, date_of_birth: draft.childDob } } : {}),
    confirmed: draft.confirmed,
    confirmed_wording: confirmedWording,
  };
}

/** DOM id for each field key, so the form can move focus to the first problem. */
export const SIGNER_FIELD_IDS: Record<keyof SignerDetailsErrors, string> = {
  confirmed: 'signer-confirmed',
  'signer.full_name': 'waiver-typed-name',
  'signer.id_number': 'signer-id-number',
  'signer.passport_country': 'signer-passport-country',
  'signer.phone': 'signer-phone',
  'signer.address': 'signer-address',
  'child.full_name': 'signer-child-name',
  'child.date_of_birth': 'signer-child-dob',
};

const FIELD_ORDER: Array<keyof SignerDetailsErrors> = [
  'signer.full_name',
  'signer.id_number',
  'signer.passport_country',
  'signer.phone',
  'signer.address',
  'child.full_name',
  'child.date_of_birth',
  'confirmed',
];

export function firstErrorFieldId(errors: SignerDetailsErrors): string | null {
  const key = FIELD_ORDER.find((k) => errors[k]);
  return key ? SIGNER_FIELD_IDS[key] : null;
}

interface SignerDetailsFormProps {
  draft: SignerDraft;
  onChange: (next: SignerDraft) => void;
  errors: SignerDetailsErrors;
  /** True when the form is for a minor: asks for the child's name and date of birth. */
  showChild: boolean;
  /** The form's own single tick also confirms the details (one-tick contracts), so hide this one. */
  hideConfirm?: boolean;
}

const inputClass =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring aria-[invalid=true]:border-destructive';

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function SignerDetailsForm({ draft, onChange, errors, showChild, hideConfirm }: SignerDetailsFormProps) {
  const { t } = useTranslation();
  const set = <K extends keyof SignerDraft>(key: K, value: SignerDraft[K]) => onChange({ ...draft, [key]: value });
  const err = (key: keyof SignerDetailsErrors) => (errors[key] ? t(`enrolment.signer.error.${errors[key]}`) : undefined);
  const describedBy = (id: string, key: keyof SignerDetailsErrors, hasHint = false) =>
    errors[key] ? `${id}-error` : hasHint ? `${id}-hint` : undefined;
  const passport = draft.idType === 'passport';

  return (
    <fieldset className="space-y-3 rounded-md border border-border p-4">
      <legend className="px-1 text-sm font-semibold">{t('enrolment.signer.heading')}</legend>
      <p className="text-sm text-muted-foreground">{t('enrolment.signer.intro')}</p>

      <Field
        id="signer-id-number"
        label={passport ? t('enrolment.signer.passport_label') : t('enrolment.signer.id_label')}
        hint={passport ? undefined : t('enrolment.signer.id_hint')}
        error={err('signer.id_number')}
      >
        <input
          id="signer-id-number"
          type="text"
          dir="ltr"
          inputMode={passport ? 'text' : 'numeric'}
          autoComplete="off"
          value={draft.idNumber}
          onChange={(e) => set('idNumber', e.target.value)}
          aria-invalid={Boolean(errors['signer.id_number'])}
          aria-describedby={describedBy('signer-id-number', 'signer.id_number', !passport)}
          className={inputClass}
        />
      </Field>

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={passport}
          onChange={(e) => set('idType', e.target.checked ? 'passport' : 'israeli_id')}
        />
        <span>{t('enrolment.signer.no_israeli_id')}</span>
      </label>

      {passport && (
        <Field id="signer-passport-country" label={t('enrolment.signer.passport_country')} error={err('signer.passport_country')}>
          <input
            id="signer-passport-country"
            type="text"
            autoComplete="country-name"
            value={draft.passportCountry}
            onChange={(e) => set('passportCountry', e.target.value)}
            aria-invalid={Boolean(errors['signer.passport_country'])}
            aria-describedby={describedBy('signer-passport-country', 'signer.passport_country')}
            className={inputClass}
          />
        </Field>
      )}

      <Field id="signer-phone" label={t('enrolment.signer.phone')} error={err('signer.phone')}>
        <input
          id="signer-phone"
          type="tel"
          dir="ltr"
          autoComplete="tel"
          value={draft.phone}
          onChange={(e) => set('phone', e.target.value)}
          aria-invalid={Boolean(errors['signer.phone'])}
          aria-describedby={describedBy('signer-phone', 'signer.phone')}
          className={inputClass}
        />
      </Field>

      <Field id="signer-address" label={t('enrolment.signer.address')} error={err('signer.address')}>
        <input
          id="signer-address"
          type="text"
          autoComplete="street-address"
          value={draft.address}
          onChange={(e) => set('address', e.target.value)}
          aria-invalid={Boolean(errors['signer.address'])}
          aria-describedby={describedBy('signer-address', 'signer.address')}
          className={inputClass}
        />
      </Field>

      {showChild && (
        <div className="space-y-3 border-t border-border pt-3">
          <h3 className="text-sm font-semibold">{t('enrolment.signer.child_heading')}</h3>
          <Field id="signer-child-name" label={t('enrolment.signer.child_name')} error={err('child.full_name')}>
            <input
              id="signer-child-name"
              type="text"
              autoComplete="off"
              value={draft.childName}
              onChange={(e) => set('childName', e.target.value)}
              aria-invalid={Boolean(errors['child.full_name'])}
              aria-describedby={describedBy('signer-child-name', 'child.full_name')}
              className={inputClass}
            />
          </Field>
          <Field id="signer-child-dob" label={t('enrolment.signer.child_dob')} error={err('child.date_of_birth')}>
            <input
              id="signer-child-dob"
              type="date"
              dir="ltr"
              autoComplete="off"
              value={draft.childDob}
              onChange={(e) => set('childDob', e.target.value)}
              aria-invalid={Boolean(errors['child.date_of_birth'])}
              aria-describedby={describedBy('signer-child-dob', 'child.date_of_birth')}
              className={inputClass}
            />
          </Field>
        </div>
      )}

      {!hideConfirm && (
      <div className="space-y-1">
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            id="signer-confirmed"
            type="checkbox"
            checked={draft.confirmed}
            onChange={(e) => set('confirmed', e.target.checked)}
            aria-invalid={Boolean(errors.confirmed)}
            aria-describedby={errors.confirmed ? 'signer-confirmed-error' : undefined}
            className="mt-0.5"
          />
          <span className="text-sm font-medium">{t('enrolment.signer.confirm')}</span>
        </label>
        {errors.confirmed && (
          <p id="signer-confirmed-error" className="text-sm text-destructive" role="alert">
            {t(`enrolment.signer.error.${errors.confirmed}`)}
          </p>
        )}
      </div>
      )}
    </fieldset>
  );
}
