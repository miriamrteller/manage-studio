import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import en from '@/i18n/en.json'
import he from '@/i18n/he.json'

const DIR = resolve(__dirname, '../features/classes/requirements/components')
const FILES = ['ClassRequirementsPanel.tsx', 'ClassAgeRangeForm.tsx'].map((f) => resolve(DIR, f))

function lookup(tree: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], tree)
}

describe('ClassRequirementsPanel translations', () => {
  const source = FILES.map((f) => readFileSync(f, 'utf8')).join('\n')
  const keys = [...new Set([...source.matchAll(/\bt\('([^']+)'/g)].map((m) => m[1]))]

  it('finds the keys used by the panel', () => {
    expect(keys.length).toBeGreaterThan(10)
  })

  it.each(keys)('%s exists in English and Hebrew', (key) => {
    expect(typeof lookup(en, key)).toBe('string')
    expect(typeof lookup(he, key)).toBe('string')
  })
})
