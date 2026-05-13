import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useContactPreferences } from './useContactPreferences';
import { ContactPreferencesUpdateSchema } from '@shared/schemas';
import type { ContactPreferencesUpdate } from '@shared/schemas';

interface ContactPreferencesEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Component: ContactPreferencesEditor
 * Modal dialog to edit email and WhatsApp notification preferences
 * Allows opt-in/out and WhatsApp number management
 */
export function ContactPreferencesEditor({
  open,
  onOpenChange,
}: ContactPreferencesEditorProps) {
  const [saving, setSaving] = useState(false);
  const { preferences, updatePreferences, isUpdating } = useContactPreferences();

  const form = useForm<ContactPreferencesUpdate>({
    resolver: zodResolver(ContactPreferencesUpdateSchema),
    defaultValues: {
      email_opted_in: preferences?.email_opted_in ?? true,
      whatsapp_opted_in: preferences?.whatsapp_opted_in ?? false,
      whatsapp_number: preferences?.whatsapp_number ?? '',
      preferred_channel: (preferences?.preferred_channel === 'voice' ? 'email' : preferences?.preferred_channel) ?? 'email',
    },
  });

  // Watch WhatsApp opted-in to conditionally show number field
  const whatsappOptedIn = form.watch('whatsapp_opted_in');

  const onSubmit = async (data: ContactPreferencesUpdate) => {
    setSaving(true);
    try {
      updatePreferences(data, {
        onSuccess: () => {
          onOpenChange(false);
          form.reset();
        },
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {/* EN: Notification Preferences, HE: העדפות התראות */}
            Notification Preferences
          </DialogTitle>
          <DialogDescription>
            {/* EN: Manage how you receive updates from the school, HE: נהל כיצד אתה מקבל עדכונים מבית הספר */}
            Manage how you receive updates from the school
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Email preferences */}
            <FormField
              control={form.control}
              name="email_opted_in"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">
                      {/* EN: Email Notifications, HE: התראות דוא"ל */}
                      Email Notifications
                    </FormLabel>
                    <FormDescription>
                      {/* EN: Receive updates via email, HE: קבל עדכונים בדוא"ל */}
                      Receive updates via email
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

            {/* WhatsApp preferences */}
            <FormField
              control={form.control}
              name="whatsapp_opted_in"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">
                      {/* EN: WhatsApp Notifications, HE: התראות WhatsApp */}
                      WhatsApp Notifications
                    </FormLabel>
                    <FormDescription>
                      {/* EN: Get messages on WhatsApp (requires verification), HE: קבל הודעות ב-WhatsApp (דורש אימות) */}
                      Get messages on WhatsApp (requires verification)
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

            {/* WhatsApp number (show if opted in) */}
            {whatsappOptedIn && (
              <FormField
                control={form.control}
                name="whatsapp_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {/* EN: WhatsApp Number, HE: מספר WhatsApp */}
                      WhatsApp Number
                    </FormLabel>
                    <FormDescription>
                      {/* EN: In E.164 format (e.g., +972123456789), HE: בפורמט E.164 (לדוגמה, +972123456789) */}
                      In E.164 format (e.g., +972123456789)
                    </FormDescription>
                    <FormControl>
                      <Input
                        placeholder="+972123456789"
                        {...field}
                        disabled={isUpdating || !whatsappOptedIn}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Preferred channel */}
            <FormField
              control={form.control}
              name="preferred_channel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {/* EN: Preferred Contact Method, HE: שיטת יצירת קשר מועדפת */}
                    Preferred Contact Method
                  </FormLabel>
                  <FormDescription>
                    {/* EN: Primary way to contact you, HE: דרך ראשית ליצור קשר אתך */}
                    Primary way to contact you
                  </FormDescription>
                  <FormControl>
                    <select
                      {...field}
                      value={field.value ?? 'email'}
                      disabled={isUpdating}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="email">
                        {/* EN: Email, HE: דוא"ל */}
                        Email
                      </option>
                      <option value="whatsapp" disabled={!whatsappOptedIn}>
                        WhatsApp {!whatsappOptedIn && '(disabled)'}
                      </option>
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isUpdating || saving}
              >
                {/* EN: Cancel, HE: ביטול */}
                Cancel
              </Button>
              <Button type="submit" disabled={isUpdating || saving}>
                {saving || isUpdating ? 'Saving...' : 'Save Preferences'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
