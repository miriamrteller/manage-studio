import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { LabelsProvider } from '@/contexts/LabelsContext';
import { StudioHostGate } from '@/layouts/StudioHostGate';
import { InquiryForm } from '@/features/crm/components/InquiryForm';
import { readEmbedLanguage } from '@/features/crm/lib/inquiryTags';
import NamedFormPage from './NamedFormPage';

/**
 * /embed/inquire — the enquiry form alone, for an <iframe> on the studio's own
 * website (snippet in Settings). No header or menu. This is the ONLY path
 * allowed in a frame: public/_headers relaxes X-Frame-Options and sets
 * frame-ancestors for /embed/* only.
 */
/** /embed/f/<slug>: a named form in an iframe. */
export function EmbedNamedFormPage() {
  return (
    <EmbedLanguage>
      <LanguageProvider>
        <StudioHostGate>
          <LabelsProvider>
            <main className="min-h-0 bg-background text-foreground">
              <NamedFormPage embedded />
            </main>
          </LabelsProvider>
        </StudioHostGate>
      </LanguageProvider>
    </EmbedLanguage>
  );
}

export default function EmbedInquirePage() {
  return (
    <EmbedLanguage>
      <LanguageProvider>
        <StudioHostGate>
          <LabelsProvider>
            <main className="min-h-0 bg-background text-foreground">
              <InquiryForm embedded />
            </main>
          </LabelsProvider>
        </StudioHostGate>
      </LanguageProvider>
    </EmbedLanguage>
  );
}

/**
 * ?lang=en|he from the snippet wins over the studio default. Written before
 * LanguageProvider mounts, which reads the stored choice for guests. Storage
 * can be blocked inside a third-party frame; then the studio default applies.
 */
function EmbedLanguage({ children }: { children: ReactNode }) {
  const [searchParams] = useSearchParams();
  useState(() => {
    const lang = readEmbedLanguage(searchParams);
    if (!lang) return null;
    try {
      localStorage.setItem('language', lang);
    } catch {
      // ignore
    }
    return lang;
  });
  return <>{children}</>;
}
