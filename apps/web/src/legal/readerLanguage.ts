import i18n from '@/i18n/i18n';

/** The app language the reader uses: forms are shown in it when the studio has that version. */
export function readerLanguage(): 'he' | 'en' {
  return i18n.language?.startsWith('he') ? 'he' : 'en';
}
