import type { LegalDocId } from './fields';
import { LEGAL_DOC_FILES, type LegalLang } from './render';

/**
 * The legal templates are the Markdown files in docs/legal, bundled as text.
 * Loaded lazily so the main bundle doesn't carry them.
 */
const loaders = import.meta.glob('../../../../docs/legal/0*.md', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>;

export async function loadLegalTemplate(doc: LegalDocId, lang: LegalLang): Promise<string> {
  const file = `${LEGAL_DOC_FILES[doc]}.${lang}.md`;
  const key = Object.keys(loaders).find((k) => k.endsWith(`/${file}`));
  if (!key) throw new Error(`Legal template not found: ${file}`);
  return loaders[key]();
}
