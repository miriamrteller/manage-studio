import { describe, expect, it } from 'vitest'
import {
  EXISTING_STUDIO_PROFILE,
  GENERAL_PROFILE,
  profileFromTenant,
  resolveEntityLabels,
  resolveStudioLabels,
} from '@shared/index'

describe('resolveStudioLabels', () => {
  it('a studio that teaches classes keeps exactly the wording it has today', () => {
    for (const locale of ['en', 'he'] as const) {
      for (const vertical of ['generic', 'photographer', 'dance-studio', 'beautician'] as const) {
        expect(resolveStudioLabels(EXISTING_STUDIO_PROFILE, {}, locale, vertical)).toEqual(
          resolveEntityLabels('programs', {}, locale, vertical),
        )
      }
    }
  })

  it('a general studio says Client, Service, Project and Session, with no class words', () => {
    const en = resolveStudioLabels(GENERAL_PROFILE, {}, 'en')
    expect(en.contact.plural).toBe('Clients')
    expect(en.offering.plural).toBe('Services')
    expect(en.engagement.plural).toBe('Projects')
    expect(en.session.singular).toBe('Session')
    const text = JSON.stringify(en)
    for (const classWord of ['Student', 'Class', 'Family', 'Level', 'Teacher', 'Enrolment']) {
      expect(text).not.toContain(classWord)
    }
    const he = resolveStudioLabels(GENERAL_PROFILE, {}, 'he')
    expect(he.contact.singular).toBe('לקוח')
    expect(he.engagement.singular).toBe('פרויקט')
    expect(he.session.singular).toBe('מפגש')
    expect(JSON.stringify(he)).not.toMatch(/תלמיד|משפחה|שיעור|רמה|מורה|הרשמה/)
  })

  it('the skin layer sits over the general wording, and the studio\'s own words win last', () => {
    expect(resolveStudioLabels(GENERAL_PROFILE, {}, 'en', 'photographer').engagement.plural).toBe('Shoots')
    const own = { engagement: { singular: 'Job', plural: 'Jobs' } }
    expect(resolveStudioLabels(GENERAL_PROFILE, own, 'en', 'photographer').engagement.plural).toBe('Jobs')
  })

  it('a row without profile fields reads as an existing studio', () => {
    expect(profileFromTenant({})).toEqual(EXISTING_STUDIO_PROFILE)
  })
})
