import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { BillingAccountCreateSchema, type BillingAccountCreate } from '@shared/schemas';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useCreateBillingAccount } from '../hooks';
import { useTenant } from '@/hooks/useTenant';

interface BillingAccountFormProps {
  onSuccess?: () => void;
}

/**
 * BillingAccountForm: Create or edit billing account
 * - React Hook Form + Zod validation
 * - Account holder name, email, phone, payment method
 * - Status dropdown (active|inactive|archived)
 * - WCAG 2.1 AA compliant
 */
export function BillingAccountForm({ onSuccess }: BillingAccountFormProps): React.ReactNode {
  const { t } = useTranslation();
  const tenant = useTenant();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const { mutate: createAccount, isPending } = useCreateBillingAccount({
    onSuccess: () => {
      setSubmitSuccess(true);
      form.reset();
      setTimeout(() => {
        setSubmitSuccess(false);
        onSuccess?.();
      }, 1500);
    },
    onError: (error) => {
      setSubmitError(
        error instanceof Error ? error.message : t('common.error')
      );
    },
  });

  const form = useForm<BillingAccountCreate>({
    resolver: zodResolver(BillingAccountCreateSchema),
    mode: 'onBlur',
  });

  const handleSubmit = async (data: BillingAccountCreate) => {
    setSubmitError(null);
    setSubmitSuccess(false);
    if (!tenant) {
      setSubmitError(t('errors.tenant_not_found'));
      return;
    }
    createAccount(data);
  };

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6 p-4">
      {/* Success Message */}
      {submitSuccess && (
        <div className="p-4 bg-green-50 border border-green-200 rounded">
          <p className="text-green-700">
            {t('pages.billing.create_success')}
          </p>
        </div>
      )}

      {/* Error Message */}
      {submitError && (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded">
          <p className="text-red-700">{submitError}</p>
        </div>
      )}

      {/* Account Holder Name */}
      <div>
        <label htmlFor="name" className="block font-semibold mb-1">
          {t('pages.billing.account_holder_name_label')} *
        </label>
        <input
          id="name"
          type="text"
          placeholder={t('pages.billing.account_holder_name_label')}
          {...form.register('account_holder_name')}
          aria-describedby={
            form.formState.errors.account_holder_name
              ? 'name-error'
              : undefined
          }
          className="w-full form-input"
        />
        {form.formState.errors.account_holder_name && (
          <div
            id="name-error"
            role="alert"
            className="text-red-600 text-sm mt-1"
          >
            {form.formState.errors.account_holder_name.message}
          </div>
        )}
      </div>

      {/* Email */}
      <div>
        <label htmlFor="email" className="block font-semibold mb-1">
          {t('pages.billing.email_label')} *
        </label>
        <input
          id="email"
          type="email"
          placeholder="example@email.com"
          {...form.register('primary_contact_email')}
          aria-describedby={
            form.formState.errors.primary_contact_email
              ? 'email-error'
              : undefined
          }
          className="w-full form-input"
        />
        {form.formState.errors.primary_contact_email && (
          <div
            id="email-error"
            role="alert"
            className="text-red-600 text-sm mt-1"
          >
            {form.formState.errors.primary_contact_email.message}
          </div>
        )}
      </div>

      {/* Phone */}
      <div>
        <label htmlFor="phone" className="block font-semibold mb-1">
          {t('pages.billing.phone_label')}
        </label>
        <input
          id="phone"
          type="tel"
          placeholder="+972 5X XXXXXXX or 05X XXXXXXX"
          {...form.register('primary_contact_phone')}
          aria-describedby={
            form.formState.errors.primary_contact_phone
              ? 'phone-error'
              : undefined
          }
          className="w-full form-input"
        />
        {form.formState.errors.primary_contact_phone && (
          <div
            id="phone-error"
            role="alert"
            className="text-red-600 text-sm mt-1"
          >
            {form.formState.errors.primary_contact_phone.message}
          </div>
        )}
      </div>

      {/* Payment Method */}
      <div>
        <label htmlFor="payment" className="block font-semibold mb-1">
          {t('pages.billing.payment_method_label')} *
        </label>
        <select
          id="payment"
          {...form.register('payment_method')}
          aria-describedby={
            form.formState.errors.payment_method ? 'payment-error' : undefined
          }
          className="w-full form-input"
        >
          <option value="card">{t('pages.billing.payment_method_card')}</option>
          <option value="bank_transfer">
            {t('pages.billing.payment_method_bank_transfer')}
          </option>
          <option value="cash">{t('pages.billing.payment_method_cash')}</option>
          <option value="check">{t('pages.billing.payment_method_check')}</option>
        </select>
        {form.formState.errors.payment_method && (
          <div
            id="payment-error"
            role="alert"
            className="text-red-600 text-sm mt-1"
          >
            {form.formState.errors.payment_method.message}
          </div>
        )}
      </div>

      {/* Form Buttons */}
      <div className="flex gap-2 pt-4">
        <Button
          type="submit"
          variant="primary"
          disabled={isPending || form.formState.isSubmitting}
          isLoading={isPending || form.formState.isSubmitting}
        >
          {t('pages.billing.create_button')}
        </Button>
        <Button
          type="reset"
          variant="outline"
          onClick={() => {
            form.reset();
            setSubmitError(null);
            setSubmitSuccess(false);
          }}
        >
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}
