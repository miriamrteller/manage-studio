import { useMemo, useState } from 'react';
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
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useAuthSession } from '@/hooks/useAuth';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { createSetPasswordFormSchema, type SetPasswordForm } from '@/schemas';
import { setLoginPassword } from '@/features/auth/lib/setLoginPassword';
import { sessionUsedPassword } from '@/features/auth/lib/sessionAuthMethod';
import { resolveAuthErrorMessage } from '@/lib/authErrors';

interface SetPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SetPasswordDialog({ open, onOpenChange }: SetPasswordDialogProps) {
  const { t } = useTranslation();
  const { session } = useAuthSession();
  const { user } = useCurrentUser();
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const requiresCurrentPassword = sessionUsedPassword(session);
  const schema = useMemo(
    () => createSetPasswordFormSchema(t, requiresCurrentPassword),
    [requiresCurrentPassword, t],
  );

  const form = useForm<SetPasswordForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      currentPassword: '',
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (data: SetPasswordForm) => {
    if (!user?.email) {
      setSubmitError(t('pages.portal.password.error_no_email'));
      return;
    }

    setSaving(true);
    setSubmitError(null);
    setSuccessMessage(null);

    try {
      await setLoginPassword({
        email: user.email,
        password: data.password,
        currentPassword: data.currentPassword?.trim() || undefined,
      });
      setSuccessMessage(t('pages.portal.password.success'));
      form.reset();
    } catch (error) {
      const message = error instanceof Error ? error.message : t('pages.portal.password.error_save');
      if (requiresCurrentPassword && message.toLowerCase().includes('invalid login credentials')) {
        setSubmitError(t('pages.portal.password.error_current_invalid'));
      } else {
        setSubmitError(resolveAuthErrorMessage(message, t, 'pages.portal.password.error_save'));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      form.reset();
      setSubmitError(null);
      setSuccessMessage(null);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {requiresCurrentPassword
              ? t('pages.portal.password.change_title')
              : t('pages.portal.password.set_title')}
          </DialogTitle>
          <DialogDescription>
            {requiresCurrentPassword
              ? t('pages.portal.password.change_description')
              : t('pages.portal.password.set_description')}
          </DialogDescription>
        </DialogHeader>

        {user?.email && (
          <p className="text-sm text-muted-foreground">
            {t('pages.portal.password.account_email', { email: user.email })}
          </p>
        )}

        {successMessage && (
          <p className="text-sm text-green-700" role="status">
            {successMessage}
          </p>
        )}

        {submitError && (
          <p className="text-sm text-red-600" role="alert">
            {submitError}
          </p>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {requiresCurrentPassword && (
              <FormField
                control={form.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('pages.portal.password.current')}</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="current-password"
                        disabled={saving}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('pages.portal.password.new')}</FormLabel>
                  <FormDescription>{t('pages.portal.password.requirements')}</FormDescription>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      disabled={saving}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('pages.portal.password.confirm')}</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      disabled={saving}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={saving}
              >
                {t('pages.portal.password.cancel')}
              </Button>
              <Button type="submit" disabled={saving || Boolean(successMessage)}>
                {saving ? t('pages.portal.password.saving') : t('pages.portal.password.save')}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
