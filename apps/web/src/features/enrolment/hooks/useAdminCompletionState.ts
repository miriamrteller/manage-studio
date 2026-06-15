import { useState } from 'react';
import type { AdminPaymentChoice } from '../components/AdminEnrolmentPaymentStep';

export function useAdminCompletionState() {
  const [adminDoneMessage, setAdminDoneMessage] = useState<string | null>(null);
  const [adminPaymentChoice, setAdminPaymentChoice] = useState<AdminPaymentChoice | null>(null);
  const [adminCompletionLink, setAdminCompletionLink] = useState<string | null>(null);
  const [adminLinkEmailSent, setAdminLinkEmailSent] = useState<boolean | null>(null);
  const [adminLinkWarning, setAdminLinkWarning] = useState<string | null>(null);

  const recordAdminCompletion = (result: {
    message: string;
    paymentChoice: AdminPaymentChoice;
    paymentUrl?: string;
    emailSent?: boolean;
    warning?: string;
  }) => {
    setAdminDoneMessage(result.message);
    setAdminPaymentChoice(result.paymentChoice);
    setAdminCompletionLink(result.paymentUrl ?? null);
    setAdminLinkEmailSent(result.emailSent ?? null);
    setAdminLinkWarning(result.warning ?? null);
  };

  return {
    adminDoneMessage,
    adminPaymentChoice,
    adminCompletionLink,
    adminLinkEmailSent,
    adminLinkWarning,
    recordAdminCompletion,
  };
}
