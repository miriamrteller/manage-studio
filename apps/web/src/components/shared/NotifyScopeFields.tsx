import { useTranslation } from 'react-i18next';
import type { Control } from 'react-hook-form';
import { Checkbox } from '@/components/ui/checkbox';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/form';
import type { ContactPreferencesUpdate } from '@shared/schemas';

const SCOPE_FIELDS = [
  'notify_offering_cancellation',
  'notify_payment_due',
  'notify_waitlist',
  'notify_schedule_change',
  'notify_announcements',
] as const;

type ScopeField = (typeof SCOPE_FIELDS)[number];

interface Props {
  control: Control<ContactPreferencesUpdate>;
  disabled?: boolean;
}

export function NotifyScopeFields({ control, disabled }: Props) {
  const { t } = useTranslation();

  return (
    <fieldset className="space-y-3">
      <legend className="text-base font-medium">
        {t('pages.portal.preferences.scope_heading')}
      </legend>
      <FormDescription>{t('pages.portal.preferences.scope_desc')}</FormDescription>
      {SCOPE_FIELDS.map((name: ScopeField) => (
        <FormField
          key={name}
          control={control}
          name={name}
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
              <FormLabel className="text-sm font-normal">
                {t(`pages.portal.preferences.${name}`)}
              </FormLabel>
              <FormControl>
                <Checkbox
                  checked={field.value ?? true}
                  onCheckedChange={field.onChange}
                  disabled={disabled}
                />
              </FormControl>
            </FormItem>
          )}
        />
      ))}
    </fieldset>
  );
}
