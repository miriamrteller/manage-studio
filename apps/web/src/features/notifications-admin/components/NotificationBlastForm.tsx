import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { FormInput } from '@/components/ui/form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useClasses } from '@/features/classes/hooks/useClasses';
import { useLevels } from '@/features/levels/hooks/useLevels';
import { BLAST_MAX_RECIPIENTS } from '../lib/notificationBlastConstants';
import {
  notificationBlastPreviewSchema,
  notificationBlastSchema,
  type BlastRecipientPreview,
  type NotificationBlastFormValues,
} from '../lib/notificationBlastSchema';
import { useNotificationBlast } from '../hooks/useNotificationBlast';
import { RecipientPreviewTable } from './RecipientPreviewTable';
import { AccountBlastPicker, formatAccountLabel } from './AccountBlastPicker';
import type { BlastAccountSearchResult } from '../lib/notificationBlastSchema';
import { normalizeRecipientEmail } from '../lib/recipientHumanSearch';

export function NotificationBlastForm() {
  const { t } = useTranslation();
  const { previewRecipients, isPreviewing, sendBlast, isSending } = useNotificationBlast();
  const { levels, isLoading: levelsLoading } = useLevels({ page: 1 });
  const { classes, isLoading: classesLoading } = useClasses({ page: 1, publicOnly: false });

  const [previewRows, setPreviewRows] = useState<BlastRecipientPreview[] | null>(null);
  const [selectedRecipientEmails, setSelectedRecipientEmails] = useState<Set<string>>(new Set());
  const [previewValidated, setPreviewValidated] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);
  const [selectedAccountLabel, setSelectedAccountLabel] = useState<string | null>(null);

  const form = useForm<NotificationBlastFormValues>({
    resolver: zodResolver(notificationBlastSchema),
    defaultValues: {
      scope: 'all',
      subject: '',
      body: '',
    },
    mode: 'onBlur',
  });

  form.watch(['subject', 'body', 'scope', 'categoryId', 'offeringId', 'accountId']);
  const scope = form.watch('scope');
  const composeValid = notificationBlastSchema.safeParse(form.getValues()).success;
  const previewCount = previewRows?.length ?? 0;
  const selectedCount = previewRows
    ? previewRows.filter((row) =>
        selectedRecipientEmails.has(normalizeRecipientEmail(row.recipient_email)),
      ).length
    : 0;
  const overLimit = previewCount > BLAST_MAX_RECIPIENTS;
  const canSend =
    composeValid &&
    previewValidated &&
    previewRows !== null &&
    selectedCount > 0 &&
    !overLimit;

  const resetPreview = () => {
    setPreviewRows(null);
    setSelectedRecipientEmails(new Set());
    setPreviewValidated(false);
    setPreviewError(null);
    setSendSuccess(null);
  };

  const handlePreview = async () => {
    setActionError(null);
    setPreviewError(null);
    setSendSuccess(null);

    const values = form.getValues();
    const parsed = notificationBlastPreviewSchema.safeParse(values);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (
          field === 'scope' ||
          field === 'categoryId' ||
          field === 'offeringId' ||
          field === 'accountId'
        ) {
          form.setError(field, { message: issue.message });
        }
      }
      setPreviewError(t('pages.notifications.preview_validation_error'));
      return;
    }

    resetPreview();

    try {
      const rows = await previewRecipients(parsed.data);
      setPreviewRows(rows);
      setSelectedRecipientEmails(
        new Set(rows.map((row) => normalizeRecipientEmail(row.recipient_email))),
      );
      setPreviewValidated(true);
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : t('pages.notifications.error_generic'));
    }
  };

  const handleSend = async () => {
    setActionError(null);
    setSendSuccess(null);

    const valid = await form.trigger();
    if (!valid) {
      setConfirmOpen(false);
      return;
    }

    try {
      const values = form.getValues();
      const result = await sendBlast({
        values,
        selectedRecipientEmails: Array.from(selectedRecipientEmails),
      });
      setConfirmOpen(false);
      resetPreview();

      const successMessage =
        result.failed > 0
          ? `${t('pages.notifications.send_success', { sent: result.sent, total: result.total })} — ${t('pages.notifications.send_partial', { failed: result.failed })}`
          : t('pages.notifications.send_success', { sent: result.sent, total: result.total });

      setSendSuccess(successMessage);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t('pages.notifications.error_generic'));
      setConfirmOpen(false);
    }
  };

  const handleOpenConfirm = async () => {
    const valid = await form.trigger();
    if (!valid) {
      return;
    }
    setConfirmOpen(true);
  };

  return (
    <div className="space-y-4 p-4">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">{t('pages.notifications.title')}</h1>
        <p className="text-gray-600">{t('pages.notifications.description')}</p>
      </div>

      <div className="card p-4 space-y-6 max-w-2xl">
        {actionError && (
          <div className="alert-error" role="alert">
            {actionError}
          </div>
        )}

        {sendSuccess && (
          <div className="alert-success" role="status">
            {sendSuccess}
          </div>
        )}

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t('pages.notifications.recipient_scope')}</legend>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-4">
              {(['all', 'level', 'class', 'account'] as const).map((value) => (
                <label key={value} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    value={value}
                    {...form.register('scope', {
                      onChange: () => {
                        setSelectedAccountLabel(null);
                        form.setValue('accountId', undefined);
                        resetPreview();
                      },
                    })}
                  />
                  {t(`pages.notifications.scope_${value}`)}
                </label>
              ))}
            </div>
          </fieldset>

          {scope === 'level' && (
            <div className="space-y-1">
              <label htmlFor="blast-level" className="text-sm font-medium">
                {t('pages.notifications.level_label')}
              </label>
              <Select
                id="blast-level"
                {...form.register('categoryId', { onChange: () => resetPreview() })}
                disabled={levelsLoading}
              >
                <option value="">{t('common.select')}</option>
                {levels.map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.name}
                  </option>
                ))}
              </Select>
              {form.formState.errors.categoryId && (
                <p className="text-sm text-destructive">{form.formState.errors.categoryId.message}</p>
              )}
            </div>
          )}

          {scope === 'class' && (
            <div className="space-y-1">
              <label htmlFor="blast-class" className="text-sm font-medium">
                {t('pages.notifications.class_label')}
              </label>
              <Select
                id="blast-class"
                {...form.register('offeringId', { onChange: () => resetPreview() })}
                disabled={classesLoading}
              >
                <option value="">{t('common.select')}</option>
                {classes.map((offering) => (
                  <option key={offering.id} value={offering.id}>
                    {offering.name}
                  </option>
                ))}
              </Select>
              {form.formState.errors.offeringId && (
                <p className="text-sm text-destructive">{form.formState.errors.offeringId.message}</p>
              )}
            </div>
          )}

          {scope === 'account' && (
            <AccountBlastPicker
              accountId={form.watch('accountId')}
              selectedLabel={selectedAccountLabel}
              onSelect={(account: BlastAccountSearchResult) => {
                form.setValue('accountId', account.account_id, { shouldValidate: true });
                setSelectedAccountLabel(formatAccountLabel(account));
                resetPreview();
              }}
              onClear={() => {
                form.setValue('accountId', undefined, { shouldValidate: true });
                setSelectedAccountLabel(null);
                resetPreview();
              }}
            />
          )}
          {scope === 'account' && form.formState.errors.accountId && (
            <p className="text-sm text-destructive">{form.formState.errors.accountId.message}</p>
          )}

          <FormInput
            htmlFor="blast-subject"
            label={t('pages.notifications.subject_label')}
            error={form.formState.errors.subject?.message}
            maxLength={200}
            required
            {...form.register('subject', { onChange: () => resetPreview() })}
          />

          <div className="space-y-1">
            <label htmlFor="blast-body" className="text-sm font-medium">
              {t('pages.notifications.body_label')}
            </label>
            <textarea
              id="blast-body"
              className="form-input w-full min-h-[160px]"
              maxLength={5000}
              {...form.register('body', { onChange: () => resetPreview() })}
            />
            {form.formState.errors.body && (
              <p className="text-sm text-destructive">{form.formState.errors.body.message}</p>
            )}
          </div>

        </form>

        <section className="space-y-4 border-t border-gray-200 pt-6" aria-labelledby="blast-review-heading">
          <div className="space-y-1">
            <h2 id="blast-review-heading" className="text-base font-semibold">
              {t('pages.notifications.preview_section_title')}
            </h2>
            <p className="text-sm text-muted-foreground">{t('pages.notifications.preview_section_hint')}</p>
          </div>

          {previewRows === null ? (
            <p className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm text-muted-foreground">
              {t('pages.notifications.preview_empty_state')}
            </p>
          ) : (
            <div className="space-y-2">
              {overLimit && (
                <p className="text-sm text-destructive" role="alert">
                  {t('pages.notifications.preview_over_limit', { max: BLAST_MAX_RECIPIENTS })}
                </p>
              )}
              <RecipientPreviewTable
                recipients={previewRows}
                selectedEmails={selectedRecipientEmails}
                onSelectedEmailsChange={setSelectedRecipientEmails}
              />
            </div>
          )}

          {previewError && (
            <p className="text-sm text-destructive" role="alert">
              {previewError}
            </p>
          )}

          <Button
            type="button"
            variant="outline"
            onClick={handlePreview}
            isLoading={isPreviewing}
            disabled={isPreviewing || isSending}
          >
            {previewRows === null
              ? t('pages.notifications.preview_button')
              : t('pages.notifications.preview_button_update')}
          </Button>

          <div className="space-y-2 border-t border-gray-100 pt-4">
            <Button
              type="button"
              variant="primary"
              disabled={!canSend || isSending || isPreviewing}
              onClick={handleOpenConfirm}
            >
              {t('pages.notifications.send_button')}
            </Button>
            {!canSend && !isSending && !isPreviewing && (
              <p className="text-sm text-muted-foreground" role="status">
                {previewRows === null
                  ? t('pages.notifications.send_disabled_no_preview')
                  : !composeValid
                    ? t('pages.notifications.send_disabled_compose_incomplete')
                    : previewCount === 0
                    ? t('pages.notifications.send_disabled_no_recipients')
                    : selectedCount === 0
                      ? t('pages.notifications.send_disabled_none_selected')
                      : overLimit
                        ? t('pages.notifications.send_disabled_over_limit', { max: BLAST_MAX_RECIPIENTS })
                        : null}
              </p>
            )}
          </div>
        </section>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('pages.notifications.send_button')}</DialogTitle>
            <DialogDescription>
              {t('pages.notifications.confirm_send', { count: selectedCount })}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)} disabled={isSending}>
              {t('pages.notifications.confirm_cancel')}
            </Button>
            <Button type="button" variant="primary" onClick={handleSend} isLoading={isSending}>
              {t('pages.notifications.send_button')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
