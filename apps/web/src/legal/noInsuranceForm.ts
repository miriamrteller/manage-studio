import { NO_INSURANCE_DECLARATION } from '@shared/legal/signed-template';
import type { ConsentTemplate } from '@shared/schemas';

type Lang = 'he' | 'en';

const HEBREW = /[֐-׿]/;

function formLang(template: Pick<ConsentTemplate, 'language' | 'content'>): Lang {
  return template.language ?? (HEBREW.test(template.content) ? 'he' : 'en');
}

/**
 * A stored health declaration (plain text) with the no-insurance sentence
 * added at the end of its Declaration list, as new forms get it. Null when the
 * form already says it, or has no Declaration list (not a health declaration).
 */
export function withNoInsuranceNote(template: Pick<ConsentTemplate, 'language' | 'content'>): string | null {
  const { content } = template;
  if (content.includes(NO_INSURANCE_DECLARATION.en) || content.includes(NO_INSURANCE_DECLARATION.he)) return null;
  const list = /^(?:\d+\.\s*)?(?:Declaration|הצהרה)[ \t]*\n\n(?:- .*(?:\n|$))+/m.exec(content);
  if (!list) return null;
  const block = list[0];
  const end = list.index + block.length;
  const line = `- ${NO_INSURANCE_DECLARATION[formLang(template)]}`;
  const insert = block.endsWith('\n') ? `${line}\n` : `\n${line}`;
  return content.slice(0, end) + insert + content.slice(end);
}

/** Active forms that would get the sentence. */
export function formsMissingNoInsuranceNote<T extends Pick<ConsentTemplate, 'status' | 'language' | 'content'>>(
  templates: T[],
): T[] {
  return templates.filter((tpl) => tpl.status === 'active' && withNoInsuranceNote(tpl) !== null);
}
