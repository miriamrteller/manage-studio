import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/hooks/useTenant';
import { WebsiteFormSettings } from '@/features/settings/components/WebsiteFormSettings';
import {
  DEFAULT_FORM,
  SHARE_CHANNELS,
  composeHref,
  fileSlug,
  formLink,
  type FormTarget,
  type ShareChannel,
} from '../lib/shareTargets';
import { downloadBlob, qrMatrix, qrPng, qrSvgPath } from '../lib/qr';
import { posterPdf, type PosterContent } from '../lib/poster';
import { WEBSITE_PLATFORMS, WEBSITE_PLATFORM_NAMES, WEBSITE_STEPS } from '@shared/index';
import { EmailInstructionsForm, SendFormSection } from './SendFormSection';

/** Copy text; returns false when the clipboard is not available (the text stays selectable). */
async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * "Get leads": everything a studio needs to collect enquiries, assuming it has
 * NO website. In order: its hosted form (copy / open / share, QR code and
 * poster, a tagged link per channel), then embedding for studios that do have
 * a site, then the lead email address. Takes a form target so the same panel
 * serves named forms later.
 */
export function GetLeadsPanel({
  target = DEFAULT_FORM,
  headingLevel = 2,
  formSlug = null,
}: {
  target?: FormTarget;
  headingLevel?: 2 | 3;
  /** Set for a named form: sharing, sending and embedding use /f/<slug>; the lead email section is left out. */
  formSlug?: string | null;
}) {
  const { t, i18n } = useTranslation();
  const tenant = useTenant();
  const id = useId();
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const lang: 'en' | 'he' = i18n.language?.startsWith('he') ? 'he' : 'en';
  const origin = window.location.origin;
  const studio = tenant?.name || tenant?.subdomain || '';

  const link = formLink(origin, target);
  const flyerLink = formLink(origin, target, 'flyer');
  const qr = useMemo(() => qrSvgPath(qrMatrix(flyerLink)), [flyerLink]);
  const shareMessage = t('pages.crm.get_leads.share_message', { studio });
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const leadEmail = useMemo(() => {
    if (!tenant?.subdomain) return null;
    // The lead inbox is on the platform email domain (Email Routing catch-all →
    // lead-email-ingest). Dev roots are never email domains.
    const root: string = import.meta.env.VITE_APP_ROOT_DOMAIN || '';
    const domain = root && !root.includes('localhost') && !root.includes(':') ? root : 'opalswift.com';
    return `leads-${tenant.subdomain}@${domain}`;
  }, [tenant?.subdomain]);

  if (!tenant?.subdomain) return null;

  const H = `h${headingLevel}` as 'h2' | 'h3';
  const H2 = `h${headingLevel + 1}` as 'h3' | 'h4';

  const announce = (message: string) => {
    setStatus('');
    // Re-set on the next tick so screen readers announce a repeat.
    setTimeout(() => setStatus(message), 10);
  };

  const copy = async (value: string, what: string) => {
    announce((await copyText(value)) ? t('pages.crm.get_leads.copied', { what }) : t('pages.crm.get_leads.copy_failed'));
  };

  const share = async () => {
    try {
      await navigator.share({ title: studio, text: shareMessage, url: link });
    } catch {
      // Cancelled by the user, or not allowed: nothing to do.
    }
  };

  const posterContent = (): PosterContent => {
    const other = lang === 'he' ? 'en' : 'he';
    return {
      studioName: studio,
      formTitle: target.title ?? null,
      url: flyerLink,
      scanLine: t('pages.crm.get_leads.scan_to_enquire', { lng: lang }),
      scanLineOther: t('pages.crm.get_leads.scan_to_enquire', { lng: other }),
      logoUrl: tenant.logo_url ?? null,
      colour: tenant.white_label?.primary_color ?? null,
      dir: lang === 'he' ? 'rtl' : 'ltr',
    };
  };

  const download = async (kind: 'qr' | 'poster') => {
    setBusy(kind);
    try {
      const base = fileSlug(tenant.subdomain || studio);
      if (kind === 'qr') downloadBlob(await qrPng(flyerLink), `${base}-qr.png`);
      else downloadBlob(await posterPdf(posterContent()), `${base}-poster.pdf`);
      announce(t('pages.crm.get_leads.downloaded'));
    } catch {
      announce(t('pages.crm.get_leads.download_failed'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-4">
      <div className="space-y-1">
        <H id={`${id}-title`} className="text-lg font-semibold text-foreground">
          {t('pages.crm.get_leads.title')}
        </H>
        <p className="text-sm text-muted-foreground">{t('pages.crm.get_leads.intro')}</p>
      </div>

      {/* 1. The hosted form: the main way in. */}
      <div className="card p-4 space-y-4">
        <H2 className="font-semibold">{t('pages.crm.get_leads.form_title')}</H2>
        <p className="text-sm text-muted-foreground">{t('pages.crm.get_leads.form_hint')}</p>
        <div className="space-y-2">
          <label htmlFor={`${id}-link`} className="sr-only">
            {t('pages.crm.get_leads.form_link')}
          </label>
          <input
            id={`${id}-link`}
            readOnly
            dir="ltr"
            className="w-full font-mono text-sm bg-muted border rounded px-3 py-2"
            value={link}
            onFocus={(e) => e.currentTarget.select()}
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Button variant="primary" onClick={() => copy(link, t('pages.crm.get_leads.form_link'))}>
              {t('pages.crm.get_leads.copy_link')}
            </Button>
            <Button variant="outline" onClick={() => window.open(link, '_blank', 'noopener,noreferrer')}>
              {t('pages.crm.get_leads.open_form')}
            </Button>
            {canShare && (
              <Button variant="outline" onClick={share}>
                {t('pages.crm.get_leads.share')}
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <svg
            role="img"
            aria-label={t('pages.crm.get_leads.qr_alt')}
            viewBox={`0 0 ${qr.size} ${qr.size}`}
            className="h-32 w-32 bg-white border rounded"
            shapeRendering="crispEdges"
          >
            <path d={qr.d} fill="#000" />
          </svg>
          <div className="space-y-2">
            <p className="text-sm">{t('pages.crm.get_leads.qr_hint')}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => download('qr')}>
                {t('pages.crm.get_leads.download_qr')}
              </Button>
              <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => download('poster')}>
                {busy === 'poster' ? t('common.loading') : t('pages.crm.get_leads.download_poster')}
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <H2 className="font-medium text-sm">{t('pages.crm.get_leads.channels_title')}</H2>
          <ul className="divide-y border rounded">
            {SHARE_CHANNELS.map((channel) => (
              <ChannelRow
                key={channel}
                channel={channel}
                link={formLink(origin, target, channel)}
                message={shareMessage}
                onCopy={copy}
              />
            ))}
          </ul>
        </div>
      </div>

      {/* 2. Send the form to one person. */}
      <SendFormSection
        headingLevel={headingLevel === 2 ? 3 : 4}
        formLinkForWhatsApp={formLink(origin, target, 'whatsapp')}
        shareMessage={shareMessage}
        country={(tenant as { country?: string | null }).country}
        formSlug={formSlug}
      />

      {/* 3. Only for studios with a website. */}
      <details className="card p-4">
        <summary className="cursor-pointer font-semibold">{t('pages.crm.get_leads.website_title')}</summary>
        <div className="pt-4 space-y-4">
          <WebsiteFormSettings compact path={target.path} />
          <div className="grid gap-3 sm:grid-cols-2">
            {WEBSITE_PLATFORMS.map((platform) => (
              <div key={platform} className="space-y-1">
                <p className="text-sm font-medium">{WEBSITE_PLATFORM_NAMES[platform]}</p>
                <ol className="list-decimal ps-5 text-sm space-y-0.5">
                  {WEBSITE_STEPS[lang][platform].map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
          {!formSlug && <EmailInstructionsForm />}
        </div>
      </details>

      {/* 4. The lead inbox. */}
      {leadEmail && !formSlug && (
        <div className="card p-4 space-y-2">
          <H2 className="font-semibold">{t('pages.crm.get_leads.email_title')}</H2>
          <p className="text-sm text-muted-foreground">{t('pages.crm.get_leads.email_hint')}</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="text-sm bg-muted border rounded px-2 py-1 break-all" dir="ltr">
              {leadEmail}
            </code>
            <Button variant="outline" size="sm" onClick={() => copy(leadEmail, t('pages.crm.get_leads.email_title'))}>
              {t('common.copy')}
            </Button>
          </div>
        </div>
      )}

      <p aria-live="polite" className="sr-only">
        {status}
      </p>
      {status && (
        <p className="text-sm" aria-hidden="true">
          {status}
        </p>
      )}
    </section>
  );
}


function ChannelRow({
  channel,
  link,
  message,
  onCopy,
}: {
  channel: ShareChannel;
  link: string;
  message: string;
  onCopy: (value: string, what: string) => void;
}) {
  const { t } = useTranslation();
  const name = t(`pages.crm.leads.channel_${channel}`);
  const compose = composeHref(channel, link, message);
  return (
    <li className="p-3 flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="font-medium text-sm min-w-28">{name}</span>
      <span className="text-xs text-muted-foreground flex-1 min-w-48">{t(`pages.crm.get_leads.howto_${channel}`)}</span>
      <span className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => onCopy(link, name)} aria-label={t('pages.crm.get_leads.copy_for', { channel: name })}>
          {t('common.copy')}
        </Button>
        {compose && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(compose, '_blank', 'noopener,noreferrer')}
            aria-label={t('pages.crm.get_leads.open_in', { channel: name })}
          >
            {t('pages.crm.get_leads.open')}
          </Button>
        )}
      </span>
    </li>
  );
}
