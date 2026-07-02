import { useMutation } from '@tanstack/react-query';
import { useTenant } from '@/hooks/useTenant';
import type { NotificationBlastFormValues } from '../lib/notificationBlastSchema';
import { previewRecipients, sendBlast } from '../services/notificationBlastService';

export function useNotificationBlast() {
  const tenant = useTenant();

  const previewMutation = useMutation({
    mutationFn: (
      values: Pick<
        NotificationBlastFormValues,
        'scope' | 'categoryId' | 'offeringId' | 'accountId'
      >,
    ) => previewRecipients(values),
  });

  const sendMutation = useMutation({
    mutationFn: ({
      values,
      selectedRecipientEmails,
    }: {
      values: NotificationBlastFormValues;
      selectedRecipientEmails: string[];
    }) => {
      if (!tenant) {
        throw new Error('Tenant not initialized');
      }
      return sendBlast(tenant, values, selectedRecipientEmails);
    },
  });

  return {
    previewRecipients: previewMutation.mutateAsync,
    isPreviewing: previewMutation.isPending,
    previewError: previewMutation.error,
    sendBlast: sendMutation.mutateAsync,
    isSending: sendMutation.isPending,
    sendError: sendMutation.error,
  };
}
