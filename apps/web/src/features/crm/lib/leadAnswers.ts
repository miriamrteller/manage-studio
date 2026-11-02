import { answerText, type LeadFormLang, type StoredAnswer } from '@shared/index';

interface WithAnswers {
  answers: Record<string, StoredAnswer> | null;
}

export interface AnswerFilterOption {
  key: string;
  label: string;
  values: string[];
}

/** Questions that appear in these leads' answers, with the distinct answers given. */
export function answerFilterOptions(leads: WithAnswers[], lang: LeadFormLang): AnswerFilterOption[] {
  const byKey = new Map<string, { label: string; values: Set<string> }>();
  for (const lead of leads) {
    for (const [key, answer] of Object.entries(lead.answers ?? {})) {
      const entry = byKey.get(key) ?? { label: answer.label[lang] || answer.label.en, values: new Set<string>() };
      for (const value of answerValues(answer, lang)) entry.values.add(value);
      byKey.set(key, entry);
    }
  }
  return [...byKey]
    .map(([key, { label, values }]) => ({ key, label, values: [...values].sort((a, b) => a.localeCompare(b)) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Leads whose answer to `key` includes `value` (multi-select answers match any picked option). */
export function filterByAnswer<T extends WithAnswers>(leads: T[], key: string, value: string, lang: LeadFormLang): T[] {
  if (!key || !value) return leads;
  return leads.filter((lead) => {
    const answer = lead.answers?.[key];
    return answer ? answerValues(answer, lang).includes(value) : false;
  });
}

function answerValues(answer: StoredAnswer, lang: LeadFormLang): string[] {
  if (answer.display && answer.display.length > 0) return answer.display.map((d) => d[lang] || d.en);
  return [answerText(answer, lang)];
}
