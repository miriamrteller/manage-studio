import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { FamilySchema, type Family } from '@shared/schemas';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { FormInput } from '../../../components/ui/form';
import { Button } from '../../../components/ui/button';

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
    >
      {/* Error message */}
      {submitError && (
        <div className="alert-error" role="alert">
          {submitError}
        </div>
      )}

      {/* Success message */}
      {submitSuccess && (
        <div className="alert-success" role="status">
          {isCreating
            ? t('common.success_created')
            : t('common.success_updated')}
        </div>
      )}

      {/* Family Name field — REQUIRED */}
      <FormInput
        htmlFor="name"
        label={t('form.family.name')}
        placeholder={t('form.family.name')}
        error={form.formState.errors.name?.message}
        required
        {...form.register('name')}
      />

      {/* Contact Person Name field — REQUIRED */}
      <FormInput
        htmlFor="contact_person_name"
        label={t('form.family.contact_person_name')}
        placeholder={t('form.family.contact_person_name')}
        error={form.formState.errors.contact_person_name?.message}
        required
        {...form.register('contact_person_name')}
      />

      {/* Contact Email field — REQUIRED */}
      <FormInput
        htmlFor="contact_email"
        label={t('form.family.contact_email')}
        type="email"
        placeholder="example@email.com"
        error={form.formState.errors.contact_email?.message}
        required
        {...form.register('contact_email')}
      />

      {/* Contact Phone field — REQUIRED, STRICT ISRAELI FORMAT */}
      <FormInput
        htmlFor="contact_phone"
        label={t('form.family.contact_phone')}
        type="tel"
        placeholder="05012345678"
        error={form.formState.errors.contact_phone?.message}
        helperText={t('form.family.invalid_phone')}
        required
        {...form.register('contact_phone')}
      />

      {/* Form buttons */}
      <div className="flex gap-2 pt-4">
        <Button
          type="submit"
          variant="default"
          disabled={isLoading || form.formState.isSubmitting}
        >
          {isCreating ? t('common.create') : t('common.save')}
        </Button>
        <Button
          type="reset"
          variant="secondary"
          onClick={() => {
            form.reset();
            setSubmitError(null);
            setSubmitSuccess(false);
          }}
        >
          {t('form.cancel')}
        </Button>
      </div>
    </form>
  );
};
