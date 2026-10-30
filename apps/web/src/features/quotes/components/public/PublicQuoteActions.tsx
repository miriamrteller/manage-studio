import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

interface PublicQuoteActionsProps {
  busy: boolean;
  onAccept: () => void;
  onDecline: (reason: string | null) => void;
}

export function PublicQuoteActions({ busy, onAccept, onDecline }: PublicQuoteActionsProps) {
  const { t } = useTranslation();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');

  if (declining) {
    return (
      <div className="space-y-3">
        <label htmlFor="decline-reason" className="block text-sm font-medium">
          {t('pages.public_quote.decline_reason')}
        </label>
        <textarea id="decline-reason" rows={3} maxLength={2000} className="w-full border rounded px-3 py-2"
          value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <Button variant="destructive" disabled={busy} onClick={() => onDecline(reason.trim() || null)}>
            {t('pages.public_quote.confirm_decline')}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setDeclining(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Disabled while in flight; the server is idempotent if a second click slips through. */}
      <Button variant="primary" size="lg" isLoading={busy} disabled={busy} onClick={onAccept}>
        {t('pages.public_quote.accept')}
      </Button>
      <Button variant="ghost" disabled={busy} onClick={() => setDeclining(true)}>
        {t('pages.public_quote.decline')}
      </Button>
    </div>
  );
}
