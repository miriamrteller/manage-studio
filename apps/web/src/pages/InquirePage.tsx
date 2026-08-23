import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { resolveTenantSubdomain } from '@/lib/resolveTenantSubdomain';

/**
 * Public inquiry form — the "website" capture channel, and via ?src= tags the
 * landing spot for every social capture link (Instagram bio, WhatsApp status,
 * LinkedIn) — docs/plans/crm-lead-capture-channels.md. Posts to the public
 * crm-lead-capture edge function; no login required. The hidden `website`
 * field is a honeypot: humans never see it, bots fill it and get silently
 * dropped server-side.
 */
export default function InquirePage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const src = searchParams.get('src');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || status === 'sending') return;
    setStatus('sending');
    try {
      const { data, error } = await supabase.functions.invoke('crm-lead-capture', {
        body: {
          tenantSubdomain: resolveTenantSubdomain(),
          name: name.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          message: message.trim() || null,
          src,
          website: honeypot || null,
        },
      });
      if (error || (data && typeof data === 'object' && 'error' in data)) {
        setStatus('error');
        return;
      }
      setStatus('sent');
    } catch {
      setStatus('error');
    }
  };

  if (status === 'sent') {
    return (
      <div className="max-w-lg mx-auto py-12 px-4 text-center space-y-3">
        <h1 className="text-2xl font-bold">{t('pages.crm.inquire.sent_title')}</h1>
        <p role="status">{t('pages.crm.inquire.sent_message')}</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto py-8 px-4 space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{t('pages.crm.inquire.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('pages.crm.inquire.subtitle')}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" aria-label={t('pages.crm.inquire.title')}>
        <div>
          <label htmlFor="inquire-name" className="block text-sm font-medium mb-1">
            {t('pages.crm.inquire.name')} *
          </label>
          <input
            id="inquire-name"
            required
            autoComplete="name"
            className="w-full border rounded px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="inquire-email" className="block text-sm font-medium mb-1">
            {t('pages.crm.inquire.email')}
          </label>
          <input
            id="inquire-email"
            type="email"
            autoComplete="email"
            className="w-full border rounded px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="inquire-phone" className="block text-sm font-medium mb-1">
            {t('pages.crm.inquire.phone')}
          </label>
          <input
            id="inquire-phone"
            type="tel"
            autoComplete="tel"
            className="w-full border rounded px-3 py-2"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="inquire-message" className="block text-sm font-medium mb-1">
            {t('pages.crm.inquire.message')}
          </label>
          <textarea
            id="inquire-message"
            rows={4}
            className="w-full border rounded px-3 py-2"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t('pages.crm.inquire.message_placeholder')}
          />
        </div>
        {/* Honeypot — off-screen for humans, irresistible to bots. */}
        <div className="sr-only" aria-hidden="true">
          <label htmlFor="inquire-website">Website</label>
          <input
            id="inquire-website"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </div>

        {status === 'error' && (
          <div className="alert-error" role="alert">
            {t('pages.crm.inquire.error')}
          </div>
        )}

        <Button type="submit" variant="primary" disabled={status === 'sending'}>
          {status === 'sending' ? t('common.loading') : t('pages.crm.inquire.submit')}
        </Button>
      </form>
    </div>
  );
}
