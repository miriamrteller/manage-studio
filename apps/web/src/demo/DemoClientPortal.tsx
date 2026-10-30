/**
 * Demo build only: stands in for PortalDashboard until the photographer
 * ClientPortal (Thread F) is on main. An adult client's account page — their
 * shoots (with the real payments & gallery card), payment history and account
 * buttons — with none of the class-school parts (children, class registration,
 * date of birth, weekly schedule).
 *
 * Uses only Tailwind classes the app already uses, so the production
 * stylesheet is unchanged.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EnrolmentRow } from '@/components/Dashboard/EnrolmentRow';
import { useParentPortal } from '@/components/Dashboard/useParentPortal';
import { ContactPreferencesEditor } from '@/components/shared/ContactPreferencesEditor';
import { SetPasswordDialog } from '@/components/shared/SetPasswordDialog';

const COPY = {
  en: {
    subtitle: 'Your shoots, payments and galleries.',
    shoots: 'My shoots',
    noShoots: 'No shoots booked yet.',
  },
  he: {
    subtitle: 'הצילומים, התשלומים והגלריות שלך.',
    shoots: 'הצילומים שלי',
    noShoots: 'עדיין לא נקבעו צילומים.',
  },
} as const;

function formatMoney(minor: number, currency: string, language: string) {
  return new Intl.NumberFormat(language === 'he' ? 'he-IL' : 'en-IL', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(minor / 100);
}

export default function DemoClientPortal() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('he') ? 'he' : 'en';
  const c = COPY[lang];
  const { data, isLoading, error } = useParentPortal();
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  if (isLoading) return <div className="p-4">{t('common.loading')}</div>;
  if (error || !data) {
    return (
      <div role="alert" className="bg-red-50 border border-red-200 rounded p-4 text-red-700">
        {t('errors.dashboard_load_failed')}
      </div>
    );
  }

  const personId = data.guardian?.personId ?? data.children[0]?.id ?? null;
  const shoots = personId ? data.enrolmentsByPerson[personId] ?? [] : [];

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-primary mb-2">{t('pages.portal_dashboard')}</h2>
          <p className="text-gray-600">{c.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setPrefsOpen(true)}>
            {t('pages.portal.notification_preferences')}
          </Button>
          <Button variant="outline" onClick={() => setPasswordOpen(true)}>
            {t('pages.portal.login_password')}
          </Button>
        </div>
      </section>

      <ContactPreferencesEditor open={prefsOpen} onOpenChange={setPrefsOpen} />
      <SetPasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />

      <section aria-labelledby="demo-shoots-heading">
        <h3 id="demo-shoots-heading" className="text-lg font-semibold text-gray-900 mb-4">
          {c.shoots}
        </h3>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          {shoots.length === 0 ? (
            <p className="text-sm text-gray-500">{c.noShoots}</p>
          ) : (
            <ul className="mt-1" aria-label={c.shoots}>
              {shoots.map((s) => (
                <EnrolmentRow key={s.id} enrolment={s} />
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="demo-payments-heading">
        <h3 id="demo-payments-heading" className="text-lg font-semibold text-gray-900 mb-4">
          {t('pages.portal.payments_heading')}
        </h3>
        {data.payments.length === 0 ? (
          <p className="text-sm text-gray-500">{t('pages.portal.no_payments')}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-start">
                <tr>
                  <th className="px-4 py-2 font-medium text-gray-700">{t('pages.portal.payment_date')}</th>
                  <th className="px-4 py-2 font-medium text-gray-700">{t('pages.portal.payment_amount')}</th>
                  <th className="px-4 py-2 font-medium text-gray-700">{t('pages.portal.payment_status')}</th>
                  <th className="px-4 py-2 font-medium text-gray-700">{t('pages.portal.payment_invoice')}</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((p) => (
                  <tr key={p.id} className="border-t border-gray-100">
                    <td className="px-4 py-2 text-gray-700">
                      {p.paid_at ? new Date(p.paid_at).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB') : '—'}
                    </td>
                    <td className="px-4 py-2 font-medium text-gray-900">
                      {formatMoney(p.total_amount_minor, p.currency, lang)}
                    </td>
                    <td className="px-4 py-2 capitalize text-gray-700">{p.status}</td>
                    <td className="px-4 py-2 text-gray-600">
                      {p.external_document_number ? (
                        p.invoice_url ? (
                          <a href={p.invoice_url} className="text-primary underline" target="_blank" rel="noopener noreferrer">
                            {p.external_document_number}
                          </a>
                        ) : (
                          p.external_document_number
                        )
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
