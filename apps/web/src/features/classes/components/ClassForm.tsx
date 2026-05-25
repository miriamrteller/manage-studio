import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { type Class, type Level, type Term, type Teacher } from '@shared/schemas';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { FormInput, FormSelect } from '@/components/ui/form';
import { useTenant } from '@/hooks/useTenant';

const ClassFormSchema = z.object({
  term_id: z.string().uuid('Term is required'),
  level_id: z.string().uuid().nullable().optional(),
  teacher_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1, 'Class name required'),
  max_capacity: z.number().positive('Max capacity must be > 0'),
  price_major: z.number().nonnegative('Price must be >= 0'),
  currency: z.string().optional(),
  day_of_week: z
    .union([z.number().int().min(0).max(6), z.nan()])
    .nullable()
    .optional(),
  start_time: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format (HH:MM)'),
  end_time: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format (HH:MM)'),
  is_public: z.enum(['true', 'false']).optional(),
  billing_frequency: z.enum(['monthly', 'per-session', 'weekly', 'annual']).optional(),
  status: z.enum(['active', 'cancelled', 'full']).optional(),
});

type ClassFormValues = z.infer<typeof ClassFormSchema>;

interface ClassFormProps {
  classItem?: Partial<Class>;
  terms: Term[];
  levels: Level[];
  teachers: Teacher[];
  onSubmit: (data: Partial<Class>) => Promise<void>;
  isLoading?: boolean;
}

function toFormValues(classItem: Partial<Class> | undefined, defaultCurrency: string): ClassFormValues {
  return {
    term_id: classItem?.term_id || '',
    level_id: classItem?.level_id ?? '',
    teacher_id: classItem?.teacher_id ?? '',
    name: classItem?.name || '',
    max_capacity: classItem?.max_capacity ?? 10,
    price_major: classItem?.price_minor != null ? classItem.price_minor / 100 : 0,
    currency: classItem?.currency || defaultCurrency,
    day_of_week: classItem?.day_of_week ?? null,
    start_time: classItem?.start_time || '09:00',
    end_time: classItem?.end_time || '10:00',
    is_public: (classItem?.is_public ?? true) ? 'true' : 'false',
    billing_frequency: (classItem?.billing_frequency as ClassFormValues['billing_frequency']) || 'monthly',
    status: classItem?.status || 'active',
  };
}

function toClassPayload(values: ClassFormValues): Partial<Class> {
  return {
    term_id: values.term_id,
    level_id: values.level_id || null,
    teacher_id: values.teacher_id || null,
    name: values.name,
    max_capacity: values.max_capacity,
    price_minor: Math.round(values.price_major * 100),
    currency: values.currency,
    day_of_week: Number.isNaN(values.day_of_week) ? null : values.day_of_week ?? null,
    start_time: values.start_time,
    end_time: values.end_time,
    is_public: values.is_public === 'true',
    billing_frequency: values.billing_frequency,
    status: values.status,
  };
}

export function ClassForm({
  classItem,
  terms,
  levels,
  teachers,
  onSubmit,
  isLoading,
}: ClassFormProps) {
  const { t } = useTranslation();
  const tenant = useTenant();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const form = useForm<ClassFormValues>({
    resolver: zodResolver(ClassFormSchema),
    defaultValues: toFormValues(classItem, tenant?.currency || 'ILS'),
    mode: 'onBlur',
  });

  const handleSubmit = async (values: ClassFormValues) => {
    try {
      setSubmitError(null);
      setSubmitSuccess(false);
      await onSubmit(toClassPayload(values));
      setSubmitSuccess(true);
      if (!classItem?.id) {
        form.reset(toFormValues(undefined, tenant?.currency || 'ILS'));
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : t('common.error'));
    }
  };

  const isCreating = !classItem?.id;
  const dayOptions = [
    { value: '', label: `-- ${t('common.select')} --` },
    ...Array.from({ length: 7 }, (_, day) => ({
      value: String(day),
      label: t(`form.class.day_${day}`),
    })),
  ];

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 p-4">
      {submitError && (
        <div className="alert-error" role="alert">
          {submitError}
        </div>
      )}

      {submitSuccess && (
        <div className="alert-success" role="status">
          {isCreating ? t('common.success_created') : t('common.success_updated')}
        </div>
      )}

      <FormInput
        htmlFor="name"
        label={t('form.class.name')}
        placeholder={t('form.class.name')}
        error={form.formState.errors.name?.message}
        required
        {...form.register('name')}
      />

      <FormSelect
        htmlFor="term_id"
        label={t('form.class.term')}
        error={form.formState.errors.term_id?.message}
        required
        {...form.register('term_id')}
      >
        <option value="">-- {t('common.select')} --</option>
        {terms.map((term) => (
          <option key={term.id} value={term.id}>
            {term.name}
          </option>
        ))}
      </FormSelect>

      <FormSelect
        htmlFor="level_id"
        label={t('form.class.level')}
        error={form.formState.errors.level_id?.message}
        {...form.register('level_id')}
      >
        <option value="">-- {t('common.optional')} --</option>
        {levels.map((level) => (
          <option key={level.id} value={level.id}>
            {level.name}
          </option>
        ))}
      </FormSelect>

      <FormSelect
        htmlFor="teacher_id"
        label={t('form.class.teacher')}
        error={form.formState.errors.teacher_id?.message}
        {...form.register('teacher_id')}
      >
        <option value="">-- {t('common.optional')} --</option>
        {teachers.map((teacher) => (
          <option key={teacher.id} value={teacher.id}>
            {teacher.name}
          </option>
        ))}
      </FormSelect>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormInput
          htmlFor="max_capacity"
          label={t('form.class.max_capacity')}
          type="number"
          min="1"
          error={form.formState.errors.max_capacity?.message}
          required
          {...form.register('max_capacity', { valueAsNumber: true })}
        />

        <FormInput
          htmlFor="price_major"
          label={t('form.class.price')}
          type="number"
          min="0"
          step="0.01"
          helperText={t('form.class.price_help')}
          error={form.formState.errors.price_major?.message}
          required
          {...form.register('price_major', { valueAsNumber: true })}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <FormSelect
          htmlFor="day_of_week"
          label={t('form.class.day_of_week')}
          error={form.formState.errors.day_of_week?.message}
          {...form.register('day_of_week', {
            setValueAs: (value) => (value === '' ? null : Number(value)),
          })}
          options={dayOptions}
        />

        <FormInput
          htmlFor="start_time"
          label={t('form.class.start_time')}
          type="time"
          error={form.formState.errors.start_time?.message}
          required
          {...form.register('start_time')}
        />

        <FormInput
          htmlFor="end_time"
          label={t('form.class.end_time')}
          type="time"
          error={form.formState.errors.end_time?.message}
          required
          {...form.register('end_time')}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormSelect
          htmlFor="billing_frequency"
          label={t('form.class.billing_frequency')}
          error={form.formState.errors.billing_frequency?.message}
          {...form.register('billing_frequency')}
        >
          <option value="monthly">{t('billing.monthly')}</option>
          <option value="per-session">{t('billing.per_session')}</option>
          <option value="weekly">{t('billing.weekly')}</option>
          <option value="annual">{t('billing.annual')}</option>
        </FormSelect>

        <FormSelect
          htmlFor="status"
          label={t('form.class.status')}
          error={form.formState.errors.status?.message}
          {...form.register('status')}
        >
          <option value="active">{t('form.class.status_active')}</option>
          <option value="full">{t('form.class.status_full')}</option>
          <option value="cancelled">{t('form.class.status_cancelled')}</option>
        </FormSelect>
      </div>

      <FormSelect
        htmlFor="is_public"
        label={t('form.class.is_public')}
        error={form.formState.errors.is_public?.message}
        {...form.register('is_public')}
      >
        <option value="true">{t('common.yes')}</option>
        <option value="false">{t('common.no')}</option>
      </FormSelect>

      <div className="flex gap-2 pt-4">
        <Button
          type="submit"
          variant="primary"
          disabled={isLoading || form.formState.isSubmitting}
          isLoading={isLoading || form.formState.isSubmitting}
        >
          {isCreating ? t('common.create') : t('common.save')}
        </Button>
        <Button
          type="reset"
          variant="outline"
          onClick={() => {
            form.reset(toFormValues(classItem, tenant?.currency || 'ILS'));
            setSubmitError(null);
            setSubmitSuccess(false);
          }}
        >
          {t('form.cancel')}
        </Button>
      </div>
    </form>
  );
}
