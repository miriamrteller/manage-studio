import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useContactPreferences } from '@/features/notifications/hooks/useContactPreferences';
import { ContactPreferencesUpdateSchema } from '@shared/schemas';
import type { ContactPreferencesUpdate } from '@shared/schemas';
import { bindFormSubmit } from '@/lib/bindFormSubmit';

interface ContactPreferencesEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ContactPreferencesEditor({
  open,
  onOpenChange,
}: ContactPreferencesEditorProps) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { preferences, updatePreferencesAsync, isUpdating } = useContactPreferences({ enabled: open });

  const form = useForm<ContactPreferencesUpdate>({
    resolver: zodResolver(ContactPreferencesUpdateSchema),
    defaultValues: {
      email_opted_in: preferences?.email_opted_in ?? true,
      whatsapp_opted_in: preferences?.whatsapp_opted_in ?? false,
      whatsapp_number: preferences?.whatsapp_number ?? '',
      preferred_channel:
        (preferences?.preferred_channel === 'voice' ? 'email' : preferences?.preferred_channel) ??
        'email',
    },
  });

  useEffect(() => {
    if (open && preferences) {
      form.reset({
        email_opted_in: preferences.email_opted_in,
        whatsapp_opted_in: preferences.whatsapp_opted_in,
        whatsapp_number: preferences.whatsapp_number ?? '',
        preferred_channel:
          preferences.preferred_channel === 'voice' ? 'email' : preferences.preferred_channel,
      });
      setSubmitError(null);
    }
  }, [open, preferences, form]);

  const whatsappOptedIn = form.watch('whatsapp_opted_in');
  const showVerifyHint = whatsappOptedIn && preferences?.whatsapp_verified === false;

  const onSubmit = async (data: ContactPreferencesUpdate) => {
    setSaving(true);
    setSubmitError(null);
    try {
      await updatePreferencesAsync(data);
      onOpenChange(false);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : t('pages.portal.preferences.error_save'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('pages.portal.preferences.title')}</DialogTitle>
          <DialogDescription>{t('pages.portal.preferences.description')}</DialogDescription>
        </DialogHeader>

        {submitError && (
          <p className="text-sm text-red-600" role="alert">
            {submitError}
          </p>
        )}

        <form
          method="post"
          noValidate
          onSubmit={bindFormSubmit(form.handleSubmit, onSubmit)}
          className="space-y-6"
        >
          <FormField
            control={form.control}
            name="email_opted_in"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">
                    {t('pages.portal.preferences.email_opted_in')}
                  </FormLabel>
                  <FormDescription>
                    {t('pages.portal.preferences.email_opted_in_desc')}
                  </FormDescription>
                </div>
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={isUpdating}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="whatsapp_opted_in"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">
                    {t('pages.portal.preferences.whatsapp_opted_in')}
                  </FormLabel>
                  <FormDescription>
                    {t('pages.portal.preferences.whatsapp_opted_in_desc')}
                  </FormDescription>
                  {preferences?.whatsapp_verified && (
                    <p className="text-xs text-green-700">
                      {t('pages.portal.preferences.whatsapp_verified')}
                    </p>
                  )}
                </div>
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={isUpdating}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          {whatsappOptedIn && (
            <FormField
              control={form.control}
              name="whatsapp_number"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>{t('pages.portal.preferences.whatsapp_number')}</FormLabel>
                  <FormDescription>
                    {t('pages.portal.preferences.whatsapp_number_hint')}
                  </FormDescription>
                  <FormControl>
                    <Input
                      placeholder="+972123456789"
                      {...field}
                      disabled={isUpdating || !whatsappOptedIn}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  {fieldState.error?.message ? (
                    <FormMessage>{fieldState.error.message}</FormMessage>
                  ) : null}
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="preferred_channel"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('pages.portal.preferences.preferred_channel')}</FormLabel>
                <FormDescription>
                  {t('pages.portal.preferences.preferred_channel_desc')}
                </FormDescription>
                <FormControl>
                  <select
                    {...field}
                    value={field.value ?? 'email'}
                    disabled={isUpdating}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="email">{t('pages.portal.preferences.channel_email')}</option>
                    <option value="whatsapp" disabled={!whatsappOptedIn}>
                      {whatsappOptedIn
                        ? t('pages.portal.preferences.channel_whatsapp')
                        : t('pages.portal.preferences.channel_whatsapp_disabled')}
                    </option>
                  </select>
                </FormControl>
              </FormItem>
            )}
          />

          {showVerifyHint && (
            <p className="text-sm text-muted-foreground" role="status">
              {t('pages.portal.preferences.verify_whatsapp_hint')}
            </p>
          )}

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isUpdating || saving}
            >
              {t('pages.portal.preferences.cancel')}
            </Button>
            <Button type="submit" disabled={isUpdating || saving}>
              {saving || isUpdating
                ? t('pages.portal.preferences.saving')
                : t('pages.portal.preferences.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
