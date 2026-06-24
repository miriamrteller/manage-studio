import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { type Offering, type Category, type Season, type Staff, TimeSchema } from '@shared/schemas';
import { useTranslation } from 'react-i18next';
import { type ChangeEvent, useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { FormInput, FormSelect } from '@/components/ui/form';
import { useTenant } from '@/hooks/useTenant';
import { getOfferingCoverPublicUrl } from '../lib/offeringImageStorage';

const optionalUuidField = z.preprocess(
  (val) => (val === '' ? null : val),
  z.string().uuid().nullable().optional(),
);

const optionalLocationField = z.preprocess(
  (val) => {
    if (val == null || val === '') return null;
    if (typeof val === 'string') {
      const trimmed = val.trim();
      return trimmed === '' ? null : trimmed;
    }
    return val;
  },
  z.string().max(500).nullable().optional(),
);

const ClassFormSchema = z.object({
  season_id: z.string().uuid('Term is required'),
  category_id: optionalUuidField,
  staff_id: optionalUuidField,
  name: z.string().min(1, 'Class name required'),
  max_capacity: z.number().positive('Max capacity must be > 0'),
  min_age: z.union([z.number().int().nonnegative(), z.nan()]).nullable().optional(),
  max_age: z.union([z.number().int().nonnegative(), z.nan()]).nullable().optional(),
  price_major: z.number().nonnegative('Price must be >= 0'),
  currency: z.string().optional(),
  day_of_week: z
    .union([z.number().int().min(0).max(6), z.nan()])
    .nullable()
    .optional(),
  start_time: TimeSchema,
  end_time: TimeSchema,
  is_public: z.enum(['true', 'false']).optional(),
  billing_mode: z.enum(['one_time', 'recurring']).optional(),
  status: z.enum(['active', 'cancelled', 'full']).optional(),
  location: optionalLocationField,
});

type OfferingFormValues = z.infer<typeof ClassFormSchema>;
export type ClassFormImageIntent = { file: File } | { remove: true } | null;

interface ClassFormProps {
  classItem?: Partial<Offering>;
  terms: Season[];
  levels: Category[];
  teachers: Staff[];
  onSubmit: (data: Partial<Offering>, imageIntent: ClassFormImageIntent) => Promise<void>;
  isLoading?: boolean;
}

function toFormValues(classItem: Partial<Offering> | undefined, defaultCurrency: string): OfferingFormValues {
  return {
    season_id: classItem?.season_id || '',
    category_id: classItem?.category_id ?? '',
    staff_id: classItem?.staff_id ?? '',
    name: classItem?.name || '',
    max_capacity: classItem?.max_capacity ?? 10,
    min_age: classItem?.min_age ?? null,
    max_age: classItem?.max_age ?? null,
    price_major: classItem?.price_minor != null ? classItem.price_minor / 100 : 0,
    currency: classItem?.currency || defaultCurrency,
    day_of_week: classItem?.day_of_week ?? null,
    start_time: classItem?.start_time || '09:00',
    end_time: classItem?.end_time || '10:00',
    is_public: (classItem?.is_public ?? true) ? 'true' : 'false',
    billing_mode: classItem?.billing_mode ?? 'one_time',
    status: classItem?.status || 'active',
    location: classItem?.location ?? '',
  };
}

function toClassPayload(values: OfferingFormValues): Partial<Offering> {
  return {
    season_id: values.season_id,
    category_id: values.category_id || null,
    staff_id: values.staff_id || null,
    name: values.name,
    max_capacity: values.max_capacity,
    min_age: Number.isNaN(values.min_age) ? null : (values.min_age ?? null),
    max_age: Number.isNaN(values.max_age) ? null : (values.max_age ?? null),
    price_minor: Math.round(values.price_major * 100),
    currency: values.currency,
    day_of_week: Number.isNaN(values.day_of_week) ? null : values.day_of_week ?? null,
    start_time: values.start_time,
    end_time: values.end_time,
    is_public: values.is_public === 'true',
    delivery_mode: 'scheduled',
    billing_mode: values.billing_mode ?? 'one_time',
    status: values.status,
    location: values.location?.trim() || null,
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
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [removeCover, setRemoveCover] = useState(false);

  const form = useForm<OfferingFormValues>({
    resolver: zodResolver(ClassFormSchema),
    defaultValues: toFormValues(classItem, tenant?.currency || 'ILS'),
    mode: 'onBlur',
  });

  const existingCoverUrl = useMemo(
    () =>
      classItem?.cover_image_path
        ? getOfferingCoverPublicUrl(classItem.cover_image_path)
        : null,
    [classItem?.cover_image_path]
  );

  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!pendingFile) {
      setPendingPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(pendingFile);
    setPendingPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [pendingFile]);

  const previewUrl = removeCover ? null : (pendingPreviewUrl ?? existingCoverUrl);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setPendingFile(file);
    if (file) {
      setRemoveCover(false);
    }
  };

  const handleSubmit = async (values: OfferingFormValues) => {
    try {
      setSubmitError(null);
      setSubmitSuccess(false);
      const imageIntent: ClassFormImageIntent = pendingFile
        ? { file: pendingFile }
        : removeCover
          ? { remove: true }
          : null;

      await onSubmit(toClassPayload(values), imageIntent);
      setSubmitSuccess(true);
      setPendingFile(null);
      setRemoveCover(false);
      if (!classItem?.id) {
        form.reset(toFormValues(undefined, tenant?.currency || 'ILS'));
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('errors.')) {
        setSubmitError(t(error.message));
        return;
      }
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

      <FormInput
        htmlFor="location"
        label={t('form.class.location')}
        placeholder={t('form.class.location_placeholder')}
        error={form.formState.errors.location?.message}
        {...form.register('location')}
      />

      <div className="space-y-2">
        <label htmlFor="cover_image" className="block text-sm font-medium text-gray-700">
          {t('form.class.cover_image')}
        </label>
        <input
          id="cover_image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
        />
        <p className="text-xs text-gray-500">{t('form.class.cover_image_hint')}</p>
        {previewUrl && (
          <img
            src={previewUrl}
            alt={t('form.class.cover_image')}
            className="h-24 w-40 rounded border border-gray-200 object-cover"
          />
        )}
        {(previewUrl || classItem?.cover_image_path) && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setPendingFile(null);
              setRemoveCover(true);
            }}
          >
            {t('form.class.remove_cover_image')}
          </Button>
        )}
      </div>

      <FormSelect
        htmlFor="season_id"
        label={t('form.class.term')}
        error={form.formState.errors.season_id?.message}
        required
        {...form.register('season_id')}
      >
        <option value="">-- {t('common.select')} --</option>
        {terms.map((term) => (
          <option key={term.id} value={term.id}>
            {term.name}
          </option>
        ))}
      </FormSelect>

      <FormSelect
        htmlFor="category_id"
        label={t('form.class.level')}
        error={form.formState.errors.category_id?.message}
        {...form.register('category_id')}
      >
        <option value="">-- {t('common.optional')} --</option>
        {levels.map((level) => (
          <option key={level.id} value={level.id}>
            {level.name}
          </option>
        ))}
      </FormSelect>

      <FormSelect
        htmlFor="staff_id"
        label={t('form.class.teacher')}
        error={form.formState.errors.staff_id?.message}
        {...form.register('staff_id')}
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
          label={
            tenant?.prices_include_vat !== false
              ? t('form.class.price_incl_vat')
              : t('form.class.price_excl_vat')
          }
          type="number"
          min="0"
          step="0.01"
          helperText={
            tenant?.prices_include_vat !== false
              ? t('form.class.price_incl_vat_help')
              : t('form.class.price_excl_vat_help')
          }
          error={form.formState.errors.price_major?.message}
          required
          {...form.register('price_major', { valueAsNumber: true })}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormInput
          htmlFor="min_age"
          label={t('form.class.min_age')}
          type="number"
          min="0"
          placeholder={t('form.class.age_placeholder')}
          error={form.formState.errors.min_age?.message}
          {...form.register('min_age', { valueAsNumber: true })}
        />

        <FormInput
          htmlFor="max_age"
          label={t('form.class.max_age')}
          type="number"
          min="0"
          placeholder={t('form.class.age_placeholder')}
          error={form.formState.errors.max_age?.message}
          {...form.register('max_age', { valueAsNumber: true })}
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
          htmlFor="billing_mode"
          label={t('form.class.billing_frequency')}
          error={form.formState.errors.billing_mode?.message}
          {...form.register('billing_mode')}
        >
          <option value="one_time">{t('billing.one_time', { defaultValue: 'One-time' })}</option>
          <option value="recurring">{t('billing.monthly')}</option>
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
            setPendingFile(null);
            setRemoveCover(false);
          }}
        >
          {t('form.cancel')}
        </Button>
      </div>
    </form>
  );
}
