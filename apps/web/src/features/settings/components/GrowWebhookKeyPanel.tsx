import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';

export const GROW_WEBHOOK_KEY_STATUS_QUERY = ['grow-webhook-key-status'] as const;

/** The URL Grow posts payment notices to. */
export function growNotifyUrl(): string {
  const base = String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '');
  return `${base}/functions/v1/handle-payment-event`;
}

export async function fetchGrowWebhookKeyStatus(): Promise<{ configured: boolean }> {
  const { data, error } = await supabase.rpc('get_grow_webhook_key_status');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  return { configured: Boolean(row?.configured) };
}

export async function rotateGrowWebhookKey(): Promise<string> {
  const { data, error } = await supabase.rpc('rotate_grow_webhook_key');
  if (error) throw error;
  if (typeof data !== 'string' || !data) throw new Error('No key returned');
  return data;
}

function CopyField({ id, label, value }: { id: string; label: string; value: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          type="text"
          readOnly
          dir="ltr"
          className="w-full border border-border rounded px-3 py-2 font-mono text-xs"
          value={value}
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button
          type="button"
          variant="secondary"
          aria-label={t('settings.grow.webhook_copy_label', {
            defaultValue: 'Copy {{label}}',
            label,
          })}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied
            ? t('settings.grow.webhook_copied', { defaultValue: 'Copied' })
            : t('settings.grow.webhook_copy', { defaultValue: 'Copy' })}
        </Button>
      </div>
    </div>
  );
}

/**
 * Grow payment notices are accepted only with the studio's webhook key. This panel shows the
 * notification URL and, right after it is made, the key to paste into Grow. The key is shown
 * once: the server keeps it encrypted and never returns it again; a new one can be made at any
 * time (the old one keeps working for 24 hours).
 */
export function GrowWebhookKeyPanel({ newKey, onNewKey }: {
  newKey: string | null;
  onNewKey: (key: string) => void;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);

  const status = useQuery({
    queryKey: GROW_WEBHOOK_KEY_STATUS_QUERY,
    queryFn: fetchGrowWebhookKeyStatus,
  });

  const rotate = useMutation({
    mutationFn: rotateGrowWebhookKey,
    onSuccess: async (key) => {
      setError(null);
      onNewKey(key);
      await status.refetch();
    },
    onError: (err: Error) => setError(err.message),
  });

  const configured = status.data?.configured ?? false;

  return (
    <section
      className="space-y-3 rounded border border-border p-4"
      aria-labelledby="grow-webhook-heading"
    >
      <h3 id="grow-webhook-heading" className="text-base font-semibold text-foreground">
        {t('settings.grow.webhook_title', { defaultValue: 'Payment notifications' })}
      </h3>
      <p className="text-sm text-muted-foreground">
        {t('settings.grow.webhook_description', {
          defaultValue:
            'Grow tells OpalSwift when a payment goes through. In your Grow account, set the notification address and webhook key below. OpalSwift ignores notifications without the right key, so payments will not be marked as paid until this is done.',
        })}
      </p>

      <CopyField
        id="grow-notify-url"
        label={t('settings.grow.webhook_url', { defaultValue: 'Notification address (URL)' })}
        value={growNotifyUrl()}
      />

      {newKey ? (
        <div className="space-y-2">
          <CopyField
            id="grow-webhook-key"
            label={t('settings.grow.webhook_key', { defaultValue: 'Webhook key' })}
            value={newKey}
          />
          <p className="text-sm text-foreground" role="status">
            {t('settings.grow.webhook_key_once', {
              defaultValue:
                'Copy this key into Grow now. For your security it is shown only once. If you lose it, make a new one.',
            })}
          </p>
        </div>
      ) : (
        <p className="text-sm" role="status">
          {status.isLoading
            ? t('settings.grow.webhook_checking', { defaultValue: 'Checking…' })
            : configured
              ? t('settings.grow.webhook_key_set', {
                  defaultValue: 'A webhook key is set. It is not shown again.',
                })
              : t('settings.grow.webhook_key_missing', {
                  defaultValue:
                    'No webhook key yet. Payments cannot be confirmed until you make one and add it to Grow.',
                })}
        </p>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <Button
        type="button"
        variant={configured ? 'secondary' : 'primary'}
        disabled={rotate.isPending}
        isLoading={rotate.isPending}
        onClick={() => rotate.mutate()}
      >
        {configured
          ? t('settings.grow.webhook_rotate', { defaultValue: 'Make a new webhook key' })
          : t('settings.grow.webhook_create', { defaultValue: 'Make a webhook key' })}
      </Button>
      {configured && (
        <p className="text-xs text-muted-foreground">
          {t('settings.grow.webhook_rotate_hint', {
            defaultValue: 'The previous key keeps working for 24 hours, so you have time to update Grow.',
          })}
        </p>
      )}
    </section>
  );
}
