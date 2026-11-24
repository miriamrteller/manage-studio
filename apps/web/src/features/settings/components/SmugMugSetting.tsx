import { useEffect, useId, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePhotoShopEnabled } from '@/features/jobs/hooks/usePhotoShop';
import { appRootHostname } from '@/lib/tenantUrl';
import {
  SMUGMUG_API_DOC_URL,
  SMUGMUG_APPLY_URL,
  SMUGMUG_SITE_URL,
  smugmugAppUrls,
  SmugMugActionError,
  SmugMugService,
  type SmugMugResultCode,
} from '../services/smugmugService';

const STATUS_KEY = ['smugmug-status'] as const;

/**
 * Photo shop → SmugMug: the studio's own SmugMug connection for the photo shop (beta).
 * Never blocks: the shop defaults above work without it.
 */
export function SmugMugSetting() {
  const enabled = usePhotoShopEnabled();
  if (!enabled) return null;
  return <SmugMugForm />;
}

/** A URL the photographer copies into SmugMug, with a copy button. */
function CopyUrl({ url }: { url: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <code dir="ltr" className="break-all rounded bg-muted px-1.5 py-0.5 text-xs">{url}</code>
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-label={t('settings.smugmug.copy_label', { value: url })}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            // Clipboard unavailable: the URL stays selectable.
          }
        }}
      >
        {copied ? t('settings.smugmug.copied') : t('settings.smugmug.copy')}
      </Button>
    </span>
  );
}

/** A SmugMug page the photographer opens: tap to open it in a new tab. */
const newTab = (url: string) => ({
  href: url,
  target: '_blank',
  rel: 'noopener noreferrer',
  className: 'font-medium underline',
});

function OpenLink({ url }: { url: string }) {
  const { t } = useTranslation();
  return (
    <a {...newTab(url)} dir="ltr" className="break-all font-medium underline">
      {url}
      <span className="sr-only"> {t('settings.smugmug.new_tab')}</span>
    </a>
  );
}

function SmugMugForm() {
  const { t, i18n } = useTranslation();
  const id = useId();
  const urls = smugmugAppUrls(window.location.origin, appRootHostname());
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: STATUS_KEY, queryFn: () => SmugMugService.getStatus() });

  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [helpOpen, setHelpOpen] = useState<boolean | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<SmugMugResultCode | null>(null);

  const hasKeys = Boolean(status.data?.hasKeys);
  const connected = Boolean(status.data?.connected);

  // Instructions are open until keys are saved.
  useEffect(() => {
    if (status.data && helpOpen === null) setHelpOpen(!status.data.hasKeys);
  }, [status.data, helpOpen]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: STATUS_KEY });

  const save = useMutation({
    mutationFn: () => SmugMugService.saveKeys(apiKey, apiSecret),
    onSuccess: () => {
      setApiKey('');
      setApiSecret('');
      setResult(null);
      setNotice(t('settings.smugmug.saved'));
      refresh();
    },
  });
  const test = useMutation({
    mutationFn: () => SmugMugService.test(),
    onSuccess: (code) => {
      setNotice(null);
      setResult(code);
    },
  });
  const connect = useMutation({
    mutationFn: () => SmugMugService.start(),
    onError: (e) => {
      setNotice(null);
      const code = e instanceof SmugMugActionError ? e.code : 'failed';
      setResult(['keys_rejected', 'unreachable', 'no_keys'].includes(code) ? (code as SmugMugResultCode) : 'failed');
    },
  });
  const disconnect = useMutation({
    mutationFn: () => SmugMugService.disconnect(),
    onSuccess: () => {
      setResult(null);
      setNotice(t('settings.smugmug.disconnected'));
      refresh();
    },
  });

  const formatDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(i18n.language === 'he' ? 'he-IL' : 'en-GB') : '';
  const resultIsGood = result === 'keys' || result === 'account';
  const canSave = apiKey.trim() !== '' && apiSecret.trim() !== '';

  return (
    <section className="space-y-4" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="text-lg font-semibold text-foreground">
        {t('settings.smugmug.title')}
      </h2>
      <p className="text-sm text-muted-foreground">{t('settings.smugmug.intro')}</p>

      <details
        className="rounded-md border border-border p-3"
        open={helpOpen ?? false}
        onToggle={(e) => setHelpOpen((e.currentTarget as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer text-sm font-medium">{t('settings.smugmug.help_title')}</summary>
        <ol className="mt-3 list-decimal space-y-2 ps-5 text-sm">
          <li>
            <Trans i18nKey="settings.smugmug.step_sign_in" components={{ page: <a {...newTab(SMUGMUG_SITE_URL)}>smugmug.com</a> }} />
          </li>
          <li>
            {t('settings.smugmug.step_open')} <OpenLink url={SMUGMUG_APPLY_URL} />
          </li>
          <li>
            {t('settings.smugmug.step_fill')}
            <ul className="mt-1 list-disc space-y-1 ps-5">
              <li>{t('settings.smugmug.field_name')}</li>
              <li>{t('settings.smugmug.field_type')}</li>
              <li>{t('settings.smugmug.field_description')}</li>
              <li>
                {t('settings.smugmug.field_app_url')} <CopyUrl url={urls.appUrl} />
              </li>
              <li>
                {t('settings.smugmug.field_callback_url')} <CopyUrl url={urls.callbackUrl} />
              </li>
            </ul>
          </li>
          <li>{t('settings.smugmug.step_submit')}</li>
          <li>
            <Trans i18nKey="settings.smugmug.step_copy" components={{ page: <a {...newTab(SMUGMUG_API_DOC_URL)}>{SMUGMUG_API_DOC_URL}</a> }} />
          </li>
          <li>{t('settings.smugmug.step_paste')}</li>
          <li>{t('settings.smugmug.step_connect')}</li>
        </ol>
      </details>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor={`${id}-key`} className="block text-sm font-medium">{t('settings.smugmug.api_key')}</label>
          <Input
            id={`${id}-key`}
            dir="ltr"
            autoComplete="off"
            spellCheck={false}
            value={apiKey}
            placeholder={hasKeys ? t('settings.smugmug.saved_placeholder') : ''}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${id}-secret`} className="block text-sm font-medium">{t('settings.smugmug.api_secret')}</label>
          <Input
            id={`${id}-secret`}
            type="password"
            dir="ltr"
            autoComplete="off"
            spellCheck={false}
            value={apiSecret}
            placeholder={hasKeys ? t('settings.smugmug.saved_placeholder') : ''}
            onChange={(e) => setApiSecret(e.target.value)}
          />
        </div>
      </div>
      {hasKeys && status.data?.keysUpdatedAt && (
        <p className="text-xs text-muted-foreground">
          {t('settings.smugmug.keys_saved_on', { date: formatDate(status.data.keysUpdatedAt) })}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="primary" isLoading={save.isPending} disabled={!canSave} onClick={() => save.mutate()}>
          {t('settings.smugmug.save')}
        </Button>
        <Button size="sm" variant="outline" isLoading={test.isPending} disabled={!hasKeys} onClick={() => test.mutate()}>
          {t('settings.smugmug.test')}
        </Button>
        <Button size="sm" variant={connected ? 'outline' : 'secondary'} isLoading={connect.isPending} disabled={!hasKeys}
          onClick={() => connect.mutate()}>
          {connected ? t('settings.smugmug.reconnect') : t('settings.smugmug.connect')}
        </Button>
        {connected && (
          <Button size="sm" variant="ghost" isLoading={disconnect.isPending} onClick={() => disconnect.mutate()}>
            {t('settings.smugmug.disconnect')}
          </Button>
        )}
      </div>

      <div aria-live="polite" className="space-y-1 text-sm">
        {notice && <p className="text-muted-foreground">{notice}</p>}
        {result && (
          <p className={resultIsGood ? 'text-success' : 'text-error'}>{t(`settings.smugmug.result.${result}`)}</p>
        )}
      </div>
      {(save.error || disconnect.error) && (
        <p role="alert" className="text-sm text-error">{t('settings.smugmug.result.failed')}</p>
      )}

      {status.data && (
        <p className="text-sm">
          {connected
            ? t('settings.smugmug.connected_since', { date: formatDate(status.data.connectedAt) })
            : t('settings.smugmug.not_connected')}
        </p>
      )}
    </section>
  );
}
