import { useTranslation } from 'react-i18next';
import type { UseFormRegister } from 'react-hook-form';
import type { Person } from '@shared/schemas';

interface ConsentFieldsProps {
  register: UseFormRegister<Partial<Person>>;
}

/**
 * ConsentFields: Photo and media consent checkboxes
 * - Wrapped in fieldset with legend for semantic grouping
 * - Accessible checkbox labels with htmlFor
 * - WCAG 2.1 AA compliant
 */
export function ConsentFields({ register }: ConsentFieldsProps) {
  const { t } = useTranslation();

  return (
    <fieldset className="space-y-4 border ps-4 py-3 rounded">
      <legend className="font-semibold text-base">
        {t('pages.people.consent_label')}
      </legend>

      <div className="flex items-center gap-3">
        <input
          id="photo-consent"
          type="checkbox"
          {...register('photo_consent')}
          className="w-4 h-4 rounded"
        />
        <label htmlFor="photo-consent" className="cursor-pointer select-none">
          {t('pages.people.photo_consent_label')}
        </label>
      </div>

      <div className="flex items-center gap-3">
        <input
          id="media-consent"
          type="checkbox"
          {...register('media_consent')}
          className="w-4 h-4 rounded"
        />
        <label htmlFor="media-consent" className="cursor-pointer select-none">
          {t('pages.people.media_consent_label')}
        </label>
      </div>
    </fieldset>
  );
}
