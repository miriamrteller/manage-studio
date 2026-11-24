import { describe, expect, it } from 'vitest'
import i18next from 'i18next'
import he from '../i18n/he.json'
import dance from '../i18n/verticals/dance.he.json'
import noFamilies from '../i18n/verticals/no-families.he.json'
import photographer from '../i18n/verticals/photographer.he.json'

// Hebrew has a separate plural form for exactly two ("two"). Without a
// `_two` key i18next shows the raw key when count is 2.
function missingTwo(obj: unknown, path = ''): string[] {
  if (!obj || typeof obj !== 'object') return []
  const rec = obj as Record<string, unknown>
  const out: string[] = []
  for (const [key, value] of Object.entries(rec)) {
    if (value && typeof value === 'object') {
      out.push(...missingTwo(value, `${path}${key}.`))
    } else if (key.endsWith('_one')) {
      const base = key.slice(0, -4)
      if (`${base}_other` in rec && !(`${base}_two` in rec)) out.push(`${path}${base}`)
    }
  }
  return out
}

describe('Hebrew plural _two forms', () => {
  it('Intl treats 2 as its own Hebrew plural category', () => {
    expect(new Intl.PluralRules('he').select(2)).toBe('two')
  })

  it.each([
    ['he.json', he],
    ['dance.he.json', dance],
    ['no-families.he.json', noFamilies],
    ['photographer.he.json', photographer],
  ])('%s has a _two key for every _one/_other pair', (_name, json) => {
    expect(missingTwo(json)).toEqual([])
  })

  it('shows real Hebrew for the finance import button with two rows', async () => {
    const i18n = i18next.createInstance()
    await i18n.init({ lng: 'he', resources: { he: { translation: he } }, interpolation: { escapeValue: false } })
    expect(i18n.t('finance.import.import_button', { count: 2 })).toBe('לייבא שתי שורות')
    expect(i18n.t('finance.import.rows_count', { count: 2 })).toBe('שתי שורות')
    expect(i18n.t('finance.import.import_button', { count: 3 })).toBe('לייבא 3 שורות')
  })
})
