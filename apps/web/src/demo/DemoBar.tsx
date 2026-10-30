import { useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import queryClient from '@/lib/query-client';
import { currentView, demoClient, signInAs, type DemoView } from './demoClient';
import { getOutbox, subscribeOutbox, type OutboxMessage } from './outbox';
import { DEMO_GALLERY_HOST, DEMO_INVOICE_HOST } from './seed';
import { invoiceForPayment } from './extensions';
import { demoGallery } from './images/manifest';
import { getInvoice, subscribeInvoice, closeInvoice, showInvoice, type DemoInvoice } from './invoice';
import { formatIls } from './functions';
import './demo.css';

const COPY = {
  en: {
    banner: 'Demo. Data resets when you refresh. No real emails or payments.',
    view: 'View as',
    admin: 'Photographer',
    client: 'Client',
    outbox: 'Sent messages',
    outboxEmpty: 'Nothing sent yet. Emails and WhatsApp messages the app sends appear here.',
    close: 'Close',
    to: 'To',
    galleryTitle: 'Gallery preview',
    invoiceTitle: 'Receipt / tax invoice',
    invoiceNote: 'Sample document. In the live app the payment provider issues this.',
    paid: 'Paid',
  },
  he: {
    banner: 'גרסת הדגמה. הנתונים מתאפסים ברענון. לא נשלחים מיילים ולא מבוצעים תשלומים.',
    view: 'תצוגה',
    admin: 'צלם/ת',
    client: 'לקוח',
    outbox: 'הודעות שנשלחו',
    outboxEmpty: 'עדיין לא נשלח דבר. מיילים והודעות וואטסאפ שהמערכת שולחת יופיעו כאן.',
    close: 'סגירה',
    to: 'אל',
    galleryTitle: 'תצוגת גלריה',
    invoiceTitle: 'קבלה / חשבונית מס',
    invoiceNote: 'מסמך לדוגמה. במערכת האמיתית ספק התשלומים מפיק אותו.',
    paid: 'שולם',
  },
} as const;

function useView(): DemoView {
  return useSyncExternalStore(
    (cb) => demoClient.onUserChange(cb),
    () => currentView(),
  );
}

function useOutbox(): OutboxMessage[] {
  const [, force] = useState(0);
  useEffect(() => subscribeOutbox(() => force((n) => n + 1)), []);
  return getOutbox();
}

function useInvoice(): DemoInvoice | null {
  return useSyncExternalStore(subscribeInvoice, getInvoice);
}

function switchView(view: DemoView) {
  signInAs(view);
  queryClient.clear();
  window.location.hash = view === 'admin' ? '#/admin/jobs' : '#/dashboard';
}

export function DemoBar() {
  const { i18n } = useTranslation();
  const lang = i18n.language?.startsWith('he') ? 'he' : 'en';
  const c = COPY[lang];
  const view = useView();
  const outbox = useOutbox();
  const invoice = useInvoice();
  const [outboxOpen, setOutboxOpen] = useState(false);
  const [seen, setSeen] = useState(0);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const unread = Math.max(0, outbox.length - seen);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setGalleryOpen(false);
      setOutboxOpen(false);
      closeInvoice();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Gallery and invoice links point at placeholder hosts. The artifact host may
  // take over clicks on external links (new tab / popup), so such links never
  // stay in the page: they are rewritten to in-page anchors (no target) and
  // open the sample gallery or invoice in place. window.open is covered too.
  useEffect(() => {
    const openDemoTarget = (url: string): boolean => {
      if (url.startsWith(DEMO_GALLERY_HOST)) {
        setGalleryOpen(true);
        return true;
      }
      if (url.startsWith(DEMO_INVOICE_HOST)) {
        const inv = invoiceForPayment(demoClient.ctx(), url.slice(DEMO_INVOICE_HOST.length + 1));
        if (inv) showInvoice(inv);
        return true;
      }
      return false;
    };
    const rewrite = (root: Document | Element | DocumentFragment) => {
      root.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
        const href = a.getAttribute('href') ?? '';
        if (!href.startsWith(DEMO_GALLERY_HOST) && !href.startsWith(DEMO_INVOICE_HOST)) return;
        a.dataset.demoHref = href;
        a.setAttribute('href', href.startsWith(DEMO_GALLERY_HOST) ? '#demo-gallery' : '#demo-invoice');
        a.removeAttribute('target');
        a.removeAttribute('rel');
      });
    };
    rewrite(document);
    const observer = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'attributes') rewrite((r.target.parentNode as Element | null) ?? document);
        r.addedNodes.forEach((n) => {
          if (n instanceof Element) rewrite((n.parentNode as Element | null) ?? n);
        });
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['href'] });

    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a');
      const url = a?.dataset.demoHref ?? a?.getAttribute('href') ?? '';
      if (a && openDemoTarget(url)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    // Window capture runs before any document-level listener.
    window.addEventListener('click', onClick, true);
    const realOpen = window.open.bind(window);
    window.open = (url?: string | URL, ...rest) => (openDemoTarget(String(url ?? '')) ? null : realOpen(url, ...rest));
    return () => {
      observer.disconnect();
      window.removeEventListener('click', onClick, true);
      window.open = realOpen;
    };
  }, []);

  return (
    <>
      <div className="demo-bar" role="region" aria-label="Demo controls" dir={lang === 'he' ? 'rtl' : 'ltr'}>
        <p className="demo-bar__note">
          <span className="demo-bar__badge">DEMO</span>
          {c.banner}
        </p>
        <div className="demo-bar__controls">
          <span className="demo-bar__label" id="demo-view-label">{c.view}</span>
          <div className="demo-seg" role="group" aria-labelledby="demo-view-label">
            <button type="button" aria-pressed={view === 'admin'} onClick={() => switchView('admin')}>{c.admin}</button>
            <button type="button" aria-pressed={view === 'client'} onClick={() => switchView('client')}>{c.client}</button>
          </div>
          <button
            type="button"
            className="demo-btn"
            onClick={() => {
              setOutboxOpen((o) => !o);
              setSeen(outbox.length);
            }}
            aria-expanded={outboxOpen}
          >
            {c.outbox}
            {unread > 0 && <span className="demo-count">{unread}</span>}
          </button>
        </div>
      </div>

      {outboxOpen && (
        <div className="demo-panel" role="dialog" aria-label={c.outbox} dir={lang === 'he' ? 'rtl' : 'ltr'}>
          <div className="demo-panel__head">
            <h2>{c.outbox}</h2>
            <button type="button" className="demo-btn" onClick={() => setOutboxOpen(false)}>{c.close}</button>
          </div>
          {outbox.length === 0 ? (
            <p className="demo-muted">{c.outboxEmpty}</p>
          ) : (
            <ul className="demo-outbox">
              {outbox.map((m) => (
                <li key={m.id}>
                  <div className="demo-outbox__meta">
                    {c.to}: <span dir="ltr">{m.to}</span> · {new Date(m.at).toLocaleTimeString()}
                  </div>
                  <div className="demo-outbox__subject">{m.subject}</div>
                  <p className="demo-outbox__body">{m.body}</p>
                  {m.link && (
                    <a
                      className="demo-link"
                      href={m.link.href}
                      onClick={(e) => {
                        if (m.link?.href.startsWith(DEMO_GALLERY_HOST)) {
                          e.preventDefault();
                          setGalleryOpen(true);
                          return;
                        }
                        // Email links are opened by the recipient, who is not signed in.
                        signInAs('signed-out');
                        queryClient.clear();
                        setOutboxOpen(false);
                      }}
                    >
                      {m.link.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {galleryOpen && (
        <div className="demo-modal" role="dialog" aria-modal="true" aria-label={c.galleryTitle}>
          <div className="demo-modal__inner demo-modal__inner--wide">
            <div className="demo-panel__head">
              <h2>{c.galleryTitle}</h2>
              <button type="button" className="demo-btn" onClick={() => setGalleryOpen(false)}>{c.close}</button>
            </div>
            <div className="demo-gallery">
              {demoGallery.map((g) => (
                <img key={g.src} src={g.src} alt={g.alt} loading="lazy" />
              ))}
            </div>
          </div>
        </div>
      )}

      {invoice && (
        <div className="demo-modal" role="dialog" aria-modal="true" aria-label={c.invoiceTitle}>
          <div className="demo-modal__inner demo-invoice" dir={lang === 'he' ? 'rtl' : 'ltr'}>
            <div className="demo-panel__head">
              <h2>{c.invoiceTitle} #{invoice.number}</h2>
              <button type="button" className="demo-btn" onClick={closeInvoice}>{c.close}</button>
            </div>
            <dl className="demo-invoice__grid">
              <dt>Lumen &amp; Light Photography</dt>
              <dd dir="ltr">12 Yefet St, Jaffa · Licensed dealer 515551234</dd>
              <dt>{lang === 'he' ? 'לקוח' : 'Billed to'}</dt>
              <dd>{invoice.clientName}</dd>
              <dt>{lang === 'he' ? 'תאריך' : 'Date'}</dt>
              <dd>{new Date(invoice.paidAt).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB')}</dd>
              <dt>{lang === 'he' ? 'פריט' : 'Item'}</dt>
              <dd>{invoice.description}</dd>
              <dt>{lang === 'he' ? 'לפני מע״מ' : 'Before VAT'}</dt>
              <dd dir="ltr">{formatIls(Math.round(invoice.amountMinor / 1.18))}</dd>
              <dt>{lang === 'he' ? 'מע״מ 18%' : 'VAT 18%'}</dt>
              <dd dir="ltr">{formatIls(invoice.amountMinor - Math.round(invoice.amountMinor / 1.18))}</dd>
              <dt className="demo-invoice__total">{lang === 'he' ? 'סה״כ' : 'Total'}</dt>
              <dd className="demo-invoice__total" dir="ltr">{formatIls(invoice.amountMinor)} · {c.paid}</dd>
            </dl>
            <p className="demo-muted">{c.invoiceNote}</p>
          </div>
        </div>
      )}
    </>
  );
}
