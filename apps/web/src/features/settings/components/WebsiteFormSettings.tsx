import { useId, useMemo, useState } from 'react';
import { InfoTip } from '@/components/ui/InfoTip';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/hooks/useTenant';
import { buildEmbedSnippet, type EmbedLanguage } from '@/features/crm/lib/inquiryTags';

/**
 * Settings → "Enquiry form on your website": a copy-paste <iframe> for the
 * studio's own site, plus a plain link. The admin is on the studio's own host,
 * so window.location.origin is the right form origin with no config.
 */
export function WebsiteFormSettings({
  compact = false,
  path = '/inquire',
  onCopy,
}: {
  compact?: boolean;
  path?: string;
  /** Called after the code or link is copied (ticks the "first leads" checklist). */
  onCopy?: () => void;
}) {
  const { t } = useTranslation();
  const tenant = useTenant();
  const id = useId();
  const [campaign, setCampaign] = useState('');
  const [lang, setLang] = useState<EmbedLanguage>(null);

  const snippet = useMemo(
    () =>
      buildEmbedSnippet({
        origin: window.location.origin,
        title: t('settings.website_form.iframe_title', { studio: tenant?.name || tenant?.subdomain || '' }),
        campaign,
        lang,
        path,
      }),
    [t, tenant?.name, tenant?.subdomain, campaign, lang, path],
  );

  if (!tenant?.subdomain) return null;

  const Heading = compact ? 'h3' : 'h2';

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-1">
          <Heading id={`${id}-title`} className={compact ? 'font-semibold' : 'text-lg font-semibold text-foreground'}>
            {t('settings.website_form.title')}
          </Heading>
          <InfoTip label={t('pages.crm.help.tip_label', { topic: t('settings.website_form.title') })}>
            {t('pages.crm.help.tip_website')}
          </InfoTip>
        </div>
        <p className="text-sm text-muted-foreground">{t('settings.website_form.description')}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-campaign`} className="block text-sm font-medium mb-1">
            {t('settings.website_form.campaign_label')}
          </label>
          <input
            id={`${id}-campaign`}
            className="w-full border rounded px-3 py-2"
            maxLength={100}
            value={campaign}
            onChange={(e) => setCampaign(e.target.value)}
            aria-describedby={`${id}-campaign-hint`}
            dir="ltr"
          />
          <p id={`${id}-campaign-hint`} className="text-xs text-muted-foreground mt-1">
            {t('settings.website_form.campaign_hint')}
          </p>
        </div>
        <div>
          <label htmlFor={`${id}-lang`} className="block text-sm font-medium mb-1">
            {t('settings.website_form.language_label')}
          </label>
          <select
            id={`${id}-lang`}
            className="w-full border rounded px-3 py-2"
            value={lang ?? ''}
            onChange={(e) => setLang(e.target.value === 'en' || e.target.value === 'he' ? e.target.value : null)}
          >
            <option value="">{t('settings.website_form.language_default')}</option>
            <option value="en">{t('settings.website_form.language_en')}</option>
            <option value="he">{t('settings.website_form.language_he')}</option>
          </select>
        </div>
      </div>

      <CopyBlock id={`${id}-snippet`} label={t('settings.website_form.snippet_label')} value={snippet.iframe} multiline onCopied={onCopy} />
      <CopyBlock id={`${id}-link`} label={t('settings.website_form.link_label')} value={snippet.link} onCopied={onCopy} />
      <p className="text-xs text-muted-foreground">{t('settings.website_form.note')}</p>
    </section>
  );
}

function CopyBlock({
  id,
  label,
  value,
  multiline,
  onCopied,
}: {
  id: string;
  label: string;
  value: string;
  multiline?: boolean;
  onCopied?: () => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      onCopied?.();
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable: the text is still selectable.
    }
  };
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <div className="flex flex-wrap items-start gap-2">
        {multiline ? (
          <textarea
            id={id}
            readOnly
            rows={3}
            dir="ltr"
            className="flex-1 min-w-0 font-mono text-xs bg-muted border rounded px-2 py-1"
            value={value}
            onFocus={(e) => e.currentTarget.select()}
          />
        ) : (
          <input
            id={id}
            readOnly
            dir="ltr"
            className="flex-1 min-w-0 font-mono text-xs bg-muted border rounded px-2 py-1"
            value={value}
            onFocus={(e) => e.currentTarget.select()}
          />
        )}
        <Button variant="outline" size="sm" onClick={copy}>
          {copied ? t('pages.crm.leads.copied') : t('common.copy')}
        </Button>
      </div>
      <span aria-live="polite" className="sr-only">
        {copied ? t('pages.crm.leads.copied') : ''}
      </span>
    </div>
  );
}
