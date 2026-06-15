import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';

interface RecordPaymentModalProps {
  engagementId: string;
  onRecorded: () => void;
}

export function RecordPaymentModal({ engagementId, onRecorded }: RecordPaymentModalProps) {
  const { t } = useTranslation();
  const [method, setMethod] = useState<'cash' | 'bank_transfer'>('cash');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('record-payment', {
        body: { engagement_id: engagementId, method, note: note || undefined },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error as string);
    },
    onSuccess: () => {
      setMessage(t('finance.record_payment.success', { defaultValue: 'Payment recorded.' }));
      onRecorded();
    },
    onError: (err: Error) => setMessage(err.message),
  });

  return (
    <div className="space-y-3 border border-border rounded-lg p-4">
      <h3 className="font-semibold">{t('finance.record_payment.title', { defaultValue: 'Record offline payment' })}</h3>
      <label className="block text-sm">
        {t('finance.record_payment.method', { defaultValue: 'Method' })}
        <select
          className="mt-1 w-full border border-border rounded px-3 py-2"
          value={method}
          onChange={(e) => setMethod(e.target.value as 'cash' | 'bank_transfer')}
        >
          <option value="cash">{t('finance.record_payment.cash', { defaultValue: 'Cash' })}</option>
          <option value="bank_transfer">{t('finance.record_payment.bank', { defaultValue: 'Bank transfer' })}</option>
        </select>
      </label>
      <label className="block text-sm">
        {t('finance.record_payment.note', { defaultValue: 'Note (optional)' })}
        <input
          className="mt-1 w-full border border-border rounded px-3 py-2"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      {message && (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      )}
      <Button
        type="button"
        variant="primary"
        disabled={mutation.isPending}
        isLoading={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {t('finance.record_payment.submit', { defaultValue: 'Record payment' })}
      </Button>
    </div>
  );
}
