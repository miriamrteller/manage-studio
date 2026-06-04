import { describe, it, expect } from 'vitest';
import {
  resolveEntityLabels,
  parseEntityLabelOverrides,
  safePreset,
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
