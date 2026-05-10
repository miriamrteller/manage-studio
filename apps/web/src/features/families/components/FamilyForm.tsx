import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { FamilySchema, type Family } from '@shared/schemas';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';

// Schema source: SPEC.md Migration 002
// Columns: id, tenant_id, name, contact_person_name, contact_email, contact_phone, created_at
// Notes:
// - System fields (id, tenant_id) are NOT in form, added at submission
// - contact_person_name is a STRING field (not a reference to Person)
// - contact_phone has STRICT Israeli format: 050-059 prefix + 7 digits
// - date format for created_at is system-generated

interface FamilyFormProps {
  family?: Partial<Family>;
  onSubmit: (data: Partial<Family>) => Promise<void>;
  isLoading?: boolean;
}

export const FamilyForm = ({ family, onSubmit, isLoading }: FamilyFormProps) => {
  const { t } = useTranslation();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Use partial schema to allow editing (some fields can be null/undefined)
  const form = useForm({
    resolver: zodResolver(FamilySchema.partial()),
    defaultValues: family || {},
    mode: 'onBlur',
  });

  const handleSubmit = async (data: Partial<Family>) => {
    try {
      setSubmitError(null);
      setSubmitSuccess(false);
      await onSubmit(data);
      setSubmitSuccess(true);
      // Reset form after successful submission if creating new
      if (!family) {
        form.reset();
      }
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : t('common.error')
      );
    }
  };

  const isCreating = !family?.id;

  return (
    <form
      onSubmit={form.handleSubmit(handleSubmit)}
      className="space-y-4 p-4"
      dir="rtl"
    >
      {/* Error message */}
      {submitError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700">
          {submitError}
        </div>
      )}

      {/* Success message */}
      {submitSuccess && (
        <div className="p-3 bg-green-50 border border-green-200 rounded text-green-700">
          {isCreating
            ? t('common.success_created')
            : t('common.success_updated')}
        </div>
      )}

      {/* Family Name field — REQUIRED */}
      <div>
        <label
          htmlFor="name"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          {t('form.family.name')} *
        </label>
        <input
          id="name"
          type="text"
          placeholder={t('form.family.name')}
          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            form.formState.errors.name
              ? 'border-red-500'
              : 'border-gray-300'
          }`}
          {...form.register('name')}
          required
        />
        {form.formState.errors.name && (
          <span className="text-sm text-red-600 mt-1 block">
            {form.formState.errors.name.message}
          </span>
        )}
      </div>

      {/* Contact Person Name field — REQUIRED */}
      <div>
        <label
          htmlFor="contact_person_name"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          {t('form.family.contact_person_name')} *
        </label>
        <input
          id="contact_person_name"
          type="text"
          placeholder={t('form.family.contact_person_name')}
          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            form.formState.errors.contact_person_name
              ? 'border-red-500'
              : 'border-gray-300'
          }`}
          {...form.register('contact_person_name')}
          required
        />
        {form.formState.errors.contact_person_name && (
          <span className="text-sm text-red-600 mt-1 block">
            {form.formState.errors.contact_person_name.message}
          </span>
        )}
      </div>

      {/* Contact Email field — REQUIRED */}
      <div>
        <label
          htmlFor="contact_email"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          {t('form.family.contact_email')} *
        </label>
        <input
          id="contact_email"
          type="email"
          placeholder="example@email.com"
          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            form.formState.errors.contact_email
              ? 'border-red-500'
              : 'border-gray-300'
          }`}
          {...form.register('contact_email')}
          required
        />
        {form.formState.errors.contact_email && (
          <span className="text-sm text-red-600 mt-1 block">
            {form.formState.errors.contact_email.message}
          </span>
        )}
      </div>

      {/* Contact Phone field — REQUIRED, STRICT ISRAELI FORMAT */}
      <div>
        <label
          htmlFor="contact_phone"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          {t('form.family.contact_phone')} *
        </label>
        <input
          id="contact_phone"
          type="tel"
          placeholder="05012345678"
          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            form.formState.errors.contact_phone
              ? 'border-red-500'
              : 'border-gray-300'
          }`}
          {...form.register('contact_phone')}
          required
        />
        <p className="text-xs text-gray-500 mt-1">
          {t('form.family.invalid_phone')}
        </p>
        {form.formState.errors.contact_phone && (
          <span className="text-sm text-red-600 mt-1 block">
            {form.formState.errors.contact_phone.message}
          </span>
        )}
      </div>

      {/* Form buttons */}
      <div className="flex gap-2 pt-4">
        <button
          type="submit"
          disabled={isLoading || form.formState.isSubmitting}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {isLoading || form.formState.isSubmitting
            ? t('common.loading')
            : isCreating
              ? t('common.create')
              : t('common.save')}
        </button>
        <button
          type="reset"
          onClick={() => {
            form.reset();
            setSubmitError(null);
            setSubmitSuccess(false);
          }}
          className="px-4 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400"
        >
          {t('form.cancel')}
        </button>
      </div>
    </form>
  );
};
