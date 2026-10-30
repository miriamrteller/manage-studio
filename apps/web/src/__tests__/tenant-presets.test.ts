import { describe, it, expect } from 'vitest';
import {
  resolveEntityLabels,
  parseEntityLabelOverrides,
  safePreset,
  safeVertical,
  isAppointmentVertical,
} from '@shared/index';

describe('resolveEntityLabels', () => {
  it('returns exact DEFAULT_LABELS.programs for empty overrides', () => {
    const labels = resolveEntityLabels('programs', {});
    expect(labels.contact).toEqual({ singular: 'Student', plural: 'Students' });
    expect(labels.account).toEqual({ singular: 'Family', plural: 'Families' });
    expect(labels.offering).toEqual({ singular: 'Class', plural: 'Classes' });
    expect(labels.season).toEqual({ singular: 'Term', plural: 'Terms' });
    expect(labels.category).toEqual({ singular: 'Level', plural: 'Levels' });
    expect(labels.staff).toEqual({ singular: 'Teacher', plural: 'Teachers' });
    expect(labels.engagement).toEqual({ singular: 'Enrolment', plural: 'Enrolments' });
    expect(labels.session).toEqual({ singular: 'Session', plural: 'Sessions' });
  });

  it('overrides offering while leaving all others unchanged', () => {
    const labels = resolveEntityLabels('programs', {
      offering: { singular: 'Workshop', plural: 'Workshops' },
    });
    expect(labels.offering).toEqual({ singular: 'Workshop', plural: 'Workshops' });
    expect(labels.contact).toEqual({ singular: 'Student', plural: 'Students' });
    expect(labels.account).toEqual({ singular: 'Family', plural: 'Families' });
    expect(labels.season).toEqual({ singular: 'Term', plural: 'Terms' });
    expect(labels.category).toEqual({ singular: 'Level', plural: 'Levels' });
    expect(labels.staff).toEqual({ singular: 'Teacher', plural: 'Teachers' });
    expect(labels.engagement).toEqual({ singular: 'Enrolment', plural: 'Enrolments' });
    expect(labels.session).toEqual({ singular: 'Session', plural: 'Sessions' });
  });

  it('returns Hebrew defaults when locale is he', () => {
    const labels = resolveEntityLabels('programs', {}, 'he');
    expect(labels.offering).toEqual({ singular: 'שיעור', plural: 'שיעורים' });
    expect(labels.contact).toEqual({ singular: 'תלמיד', plural: 'תלמידים' });
    expect(labels.account).toEqual({ singular: 'משפחה', plural: 'משפחות' });
  });

  it('layers photographer vocabulary over the preset (en + he)', () => {
    const en = resolveEntityLabels('services', {}, 'en', 'photographer');
    expect(en.account).toEqual({ singular: 'Client', plural: 'Clients' });
    expect(en.engagement).toEqual({ singular: 'Shoot', plural: 'Shoots' });
    expect(en.offering).toEqual({ singular: 'Package', plural: 'Packages' });

    const he = resolveEntityLabels('services', {}, 'he', 'photographer');
    expect(he.account).toEqual({ singular: 'לקוח', plural: 'לקוחות' });
    expect(he.engagement).toEqual({ singular: 'צילום', plural: 'צילומים' });
    expect(he.offering).toEqual({ singular: 'חבילה', plural: 'חבילות' });
  });

  it('tenant overrides still win over photographer vocabulary', () => {
    const labels = resolveEntityLabels(
      'services',
      { engagement: { singular: 'Session', plural: 'Sessions' } },
      'en',
      'photographer',
    );
    expect(labels.engagement).toEqual({ singular: 'Session', plural: 'Sessions' });
    expect(labels.offering).toEqual({ singular: 'Package', plural: 'Packages' });
  });

  it('leaves dance/generic tenants unchanged', () => {
    expect(resolveEntityLabels('programs', {}, 'en', 'dance-studio')).toEqual(
      resolveEntityLabels('programs', {}, 'en'),
    );
    expect(resolveEntityLabels('programs', {}, 'he', 'generic')).toEqual(
      resolveEntityLabels('programs', {}, 'he'),
    );
  });
});

describe('safeVertical / isAppointmentVertical', () => {
  it('accepts known verticals and falls back to generic', () => {
    expect(safeVertical('photographer')).toBe('photographer');
    expect(safeVertical('dance-studio')).toBe('dance-studio');
    expect(safeVertical('nope')).toBe('generic');
    expect(safeVertical(undefined)).toBe('generic');
  });

  it('flags appointment-based verticals', () => {
    expect(isAppointmentVertical('photographer')).toBe(true);
    expect(isAppointmentVertical('beautician')).toBe(true);
    expect(isAppointmentVertical('dance-studio')).toBe(false);
    expect(isAppointmentVertical('generic')).toBe(false);
  });
});

describe('parseEntityLabelOverrides', () => {
  it('returns {} for empty JSON string', () => {
    expect(parseEntityLabelOverrides('{}')).toEqual({});
  });

  it('parses a valid JSON string with a known key', () => {
    expect(
      parseEntityLabelOverrides('{"offering":{"singular":"X","plural":"Y"}}')
    ).toEqual({ offering: { singular: 'X', plural: 'Y' } });
  });

  it('returns {} for invalid JSON string', () => {
    expect(parseEntityLabelOverrides('not valid json')).toEqual({});
  });

  it('strips unknown keys from a plain object', () => {
    expect(parseEntityLabelOverrides({ unknown_key: 'foo' })).toEqual({});
  });

  it('returns {} for null input', () => {
    expect(parseEntityLabelOverrides(null)).toEqual({});
  });
});

describe('safePreset', () => {
  it('returns "programs" for "programs"', () => {
    expect(safePreset('programs')).toBe('programs');
  });

  it('returns "programs" for unknown string', () => {
    expect(safePreset('garbage')).toBe('programs');
  });

  it('returns "programs" for undefined', () => {
    expect(safePreset(undefined)).toBe('programs');
  });
});
