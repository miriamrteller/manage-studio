import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useAuthSession } from '@/hooks/useAuth';
import { buildLegalPack, type LegalPackSection } from '@/legal/legalPack';
import { fetchTenantLegalProfile } from '@/legal/useLegalDocument';

const LANGS = ['en', 'he'] as const;

/** What the lawyer should check (cover page), always in both languages. */
const COVER = {
  en: {
    title: 'Legal pack for review',
    intro:
      'These documents were drafted from templates based on Israeli law and filled with the studio’s details. They are drafts. Please review them before the studio relies on them. If the English and Hebrew versions differ, the English version prevails.',
    checks: [
      'The studio’s details: legal name, business status and number, address, contacts.',
      'Privacy policy: what is collected, retention periods, rights, the processor (OpalSwift).',
      'Terms: prices, payments, cancellations and refunds (Consumer Protection Law).',
      'Signed documents: health declaration or service agreement, and the consent checkboxes.',
      'Accessibility statement: matches the studio’s premises and website.',
      'Anything marked as missing or “______”.',
    ],
  },
  he: {
    title: 'חבילת מסמכים משפטיים לבדיקה',
    intro:
      'המסמכים נוסחו מתבניות המבוססות על הדין בישראל ומולאו בפרטי הסטודיו. אלה טיוטות. יש לבדוק אותם לפני שהסטודיו מסתמך עליהם. אם יש סתירה בין הנוסח האנגלי לעברי, הנוסח האנגלי גובר.',
    checks: [
      'פרטי הסטודיו: שם משפטי, מעמד ומספר עוסק, כתובת, פרטי קשר.',
      'מדיניות פרטיות: איזה מידע נאסף, תקופות שמירה, זכויות, מעבד המידע (OpalSwift).',
      'תנאים: מחירים, תשלומים, ביטולים והחזרים (חוק הגנת הצרכן).',
      'מסמכים לחתימה: הצהרת בריאות או הסכם שירות, ותיבות ההסכמה.',
      'הצהרת נגישות: תואמת את המקום ואת האתר של הסטודיו.',
      'כל מה שמסומן כחסר או "______".',
    ],
  },
};

function SectionBody({ section, lang }: { section: LegalPackSection; lang: 'en' | 'he' }) {
  const body = section.body[lang];
  if (body.html) {
    // renderLegalHtml escapes studio values; the templates are ours.
    return <div className="legal-pack-doc" dangerouslySetInnerHTML={{ __html: body.html }} />;
  }
  return <div className="whitespace-pre-wrap text-sm leading-relaxed">{body.text}</div>;
}

/**
 * The studio's whole legal pack as one printable document: a cover page for
 * the lawyer, then every document in English and in Hebrew. Opens the
 * browser's print dialog so it can be saved as a PDF (Hebrew needs a real
 * browser engine to lay out right-to-left text).
 */
export default function LegalPackPrintPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const tenantId = params.get('tenant') ?? '';
  const { session, isLoading: sessionLoading } = useAuthSession();

  const { data: legal, isLoading: legalLoading } = useQuery({
    queryKey: ['tenant-legal-profile-by-id', tenantId],
    enabled: !!tenantId && !!session,
    queryFn: () => fetchTenantLegalProfile(tenantId),
  });
  const { data: pack } = useQuery({
    queryKey: ['legal-pack', tenantId, legal?.updatedAt, legal?.vertical],
    enabled: !!legal,
    queryFn: () => buildLegalPack(legal!),
  });

  useEffect(() => {
    if (!pack) return;
    const timer = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(timer);
  }, [pack]);

  if (sessionLoading || (session && (legalLoading || (legal && !pack)))) {
    return <p role="status" className="p-6">{t('common.loading')}</p>;
  }
  if (!session) return <p className="p-6">{t('legal.pack.sign_in_needed')}</p>;
  if (!legal || !pack) return <p className="p-6">{t('legal.page.not_found_body')}</p>;

  const today = new Intl.DateTimeFormat('en-GB', { dateStyle: 'long' }).format(new Date());

  return (
    <main className="legal-pack mx-auto max-w-3xl bg-white p-8 text-gray-900">
      <style>{`
        @media print { .legal-pack-break { break-before: page; } .no-print { display: none; } }
        .legal-pack-doc h1 { font-size: 1.5rem; font-weight: 700; margin: 0 0 .75rem; }
        .legal-pack-doc h2 { font-size: 1.15rem; font-weight: 600; margin: 1rem 0 .5rem; }
        .legal-pack-doc p, .legal-pack-doc li { font-size: .9rem; line-height: 1.55; }
        .legal-pack-doc ul { list-style: disc; padding-inline-start: 1.25rem; }
      `}</style>
      <p className="no-print mb-6 text-sm text-gray-700">{t('legal.pack.print_hint')}</p>

      <header className="mb-4 border-b-2 border-gray-300 pb-3">
        <p className="text-xl font-bold">{legal.name}</p>
        <p className="text-xs text-gray-700">{today} · v{pack.version}</p>
      </header>
      <section aria-label={COVER.en.title}>
        {LANGS.map((lang) => (
          <div key={lang} dir={lang === 'he' ? 'rtl' : 'ltr'} lang={lang} className="mt-6">
            <h1 className="text-2xl font-bold">{COVER[lang].title}</h1>
            <p className="mt-2 text-sm">{COVER[lang].intro}</p>
            <ol className="mt-3 list-decimal space-y-1 ps-5 text-sm">
              {COVER[lang].checks.map((c) => <li key={c}>{c}</li>)}
            </ol>
          </div>
        ))}
        <ol className="mt-6 list-decimal ps-5 text-sm">
          {pack.sections.map((s) => (
            <li key={s.id}>
              {s.title.en} / <span lang="he" dir="rtl">{s.title.he}</span>
            </li>
          ))}
        </ol>
      </section>

      {pack.sections.map((section) =>
        LANGS.map((lang) => (
          <section
            key={`${section.id}-${lang}`}
            className="legal-pack-break mt-10"
            dir={lang === 'he' ? 'rtl' : 'ltr'}
            lang={lang}
            aria-label={`${section.title[lang]} (${lang === 'he' ? 'עברית' : 'English'})`}
          >
            <p className="mb-2 border-b border-gray-200 pb-1 text-xs text-gray-700">
              {legal.name} · {section.title[lang]} · {lang === 'he' ? 'עברית' : 'English'}
            </p>
            <SectionBody section={section} lang={lang} />
          </section>
        )),
      )}
    </main>
  );
}
