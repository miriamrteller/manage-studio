import { describe, expect, it } from 'vitest';
import {
  SIGNER_DETAILS_VERSION,
  canonicalJson,
  isValidBirthDate,
  maskIdNumber,
  normaliseIsraeliId,
  sealSignerDetails,
  validateSignerDetails,
  type SignerDetailsInput,
} from '@shared/signerDetails';
import { isValidIsraeliId } from '@shared/legal/personalIdentity';

const good: SignerDetailsInput = {
  signer: { full_name: 'Dana Levi', id_type: 'israeli_id', id_number: '123456782', phone: '050-123-4567', address: '5 Herzl St, Tel Aviv' },
  child: { full_name: 'Noa Levi', date_of_birth: '2016-05-04' },
  confirmed: true,
  confirmed_wording: 'These details are correct',
};
const today = new Date('2026-11-03T10:00:00Z');

describe('Israeli ID check digit', () => {
  it('accepts valid numbers, with or without leading zeros, spaces and hyphens', () => {
    for (const id of ['123456782', '000000018', '00000018', '1234-56782', '1234 56782']) {
      expect(isValidIsraeliId(id), id).toBe(true);
    }
    // too short to be an ID (fewer than 5 digits), even though it pads to a valid-looking number
    expect(isValidIsraeliId('18')).toBe(false);
  });

  it('pads short numbers to nine digits before checking', () => {
    expect(normaliseIsraeliId('1234-5678')).toBe('012345678');
    expect(normaliseIsraeliId('1234')).toBeNull();
    expect(normaliseIsraeliId('1234567890')).toBeNull();
    expect(normaliseIsraeliId('12a456782')).toBeNull();
  });

  it('rejects a wrong check digit, all zeros and junk', () => {
    for (const bad of ['123456789', '123456780', '000000000', '', 'abcdefghi', '12345', '1234567890']) {
      expect(isValidIsraeliId(bad), bad).toBe(false);
    }
  });

  it('catches every single-digit mistake (the doubled digits map one to one, so no change cancels out)', () => {
    const valid = '123456782';
    for (let i = 0; i < 9; i++) {
      for (let d = 0; d <= 9; d++) {
        if (String(d) === valid[i]) continue;
        expect(isValidIsraeliId(valid.slice(0, i) + d + valid.slice(i + 1)), `${i}:${d}`).toBe(false);
      }
    }
  });
});

describe('validateSignerDetails', () => {
  it('accepts complete details and returns them cleaned up', () => {
    const r = validateSignerDetails(
      { ...good, signer: { ...good.signer, full_name: '  Dana Levi  ', id_number: '1234-56782', phone: ' 050-123-4567 ' } },
      { requireChild: true, today },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.version).toBe(SIGNER_DETAILS_VERSION);
      expect(r.value.signer).toEqual({
        full_name: 'Dana Levi',
        id_type: 'israeli_id',
        id_number: '123456782',
        phone: '050-123-4567',
        address: '5 Herzl St, Tel Aviv',
      });
      expect(r.value.child).toEqual({ full_name: 'Noa Levi', date_of_birth: '2016-05-04' });
      expect(r.value.confirmed).toBe(true);
    }
  });

  it('rejects a missing tick', () => {
    for (const confirmed of [false, undefined, 'true', 1, null]) {
      const r = validateSignerDetails({ ...good, confirmed }, { requireChild: true, today });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.confirmed).toBe('confirm_required');
    }
  });

  it('rejects a bad ID number, and says which problem it is', () => {
    const bad = validateSignerDetails({ ...good, signer: { ...good.signer, id_number: '123456789' } }, { requireChild: true, today });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors['signer.id_number']).toBe('id_invalid');
    const empty = validateSignerDetails({ ...good, signer: { ...good.signer, id_number: '  ' } }, { requireChild: true, today });
    if (!empty.ok) expect(empty.errors['signer.id_number']).toBe('id_required');
  });

  it('requires name, phone and address', () => {
    const r = validateSignerDetails(
      { ...good, signer: { ...good.signer, full_name: 'D', phone: '12', address: 'x' } },
      { requireChild: true, today },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors['signer.full_name']).toBe('signer_name_required');
      expect(r.errors['signer.phone']).toBe('phone_invalid');
      expect(r.errors['signer.address']).toBe('address_required');
    }
  });

  it('accepts international phone formats and rejects letters', () => {
    for (const phone of ['+972 50-123-4567', '(03) 555 1234', '0501234567', '+1 (212) 555-0100']) {
      expect(validateSignerDetails({ ...good, signer: { ...good.signer, phone } }, { requireChild: true, today }).ok, phone).toBe(true);
    }
    for (const phone of ['abc', '050-ABC-4567', '123456', '+9725012345678901234']) {
      expect(validateSignerDetails({ ...good, signer: { ...good.signer, phone } }, { requireChild: true, today }).ok, phone).toBe(false);
    }
  });

  describe('passport instead of an Israeli ID', () => {
    const withPassport = (over: Record<string, unknown>) => ({
      ...good,
      signer: { ...good.signer, id_type: 'passport', id_number: 'ab 123-456', passport_country: 'France', ...over },
    });

    it('needs the passport number and the country, and stores the number normalised', () => {
      const r = validateSignerDetails(withPassport({}), { requireChild: true, today });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.signer.id_type).toBe('passport');
        expect(r.value.signer.id_number).toBe('AB123456');
        expect(r.value.signer.passport_country).toBe('France');
      }
    });

    it('rejects a missing country, a too-short number and symbols', () => {
      const noCountry = validateSignerDetails(withPassport({ passport_country: '' }), { requireChild: true, today });
      if (!noCountry.ok) expect(noCountry.errors['signer.passport_country']).toBe('passport_country_required');
      expect(noCountry.ok).toBe(false);
      for (const id_number of ['AB1', 'AB12*456', '']) {
        expect(validateSignerDetails(withPassport({ id_number }), { requireChild: true, today }).ok, id_number).toBe(false);
      }
    });

    it('does not run the Israeli check digit on a passport', () => {
      expect(validateSignerDetails(withPassport({ id_number: '123456789' }), { requireChild: true, today }).ok).toBe(true);
    });
  });

  describe('the child block', () => {
    it('is required for a minor: name and a real date of birth', () => {
      const missing = validateSignerDetails({ ...good, child: undefined }, { requireChild: true, today });
      expect(missing.ok).toBe(false);
      if (!missing.ok) {
        expect(missing.errors['child.full_name']).toBe('child_name_required');
        expect(missing.errors['child.date_of_birth']).toBe('child_dob_required');
      }
      for (const date_of_birth of ['2016-02-30', '2016/05/04', '2099-01-01', '1800-01-01', 'yesterday']) {
        const r = validateSignerDetails({ ...good, child: { full_name: 'Noa', date_of_birth } }, { requireChild: true, today });
        expect(r.ok, date_of_birth).toBe(false);
        if (!r.ok) expect(r.errors['child.date_of_birth']).toBe('child_dob_invalid');
      }
    });

    it('is dropped when the form is not for a minor', () => {
      const r = validateSignerDetails(good, { requireChild: false, today });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.child).toBeUndefined();
    });
  });

  it('survives junk input without throwing', () => {
    for (const junk of [null, undefined, 5, 'x', [], { signer: 5 }, { signer: null, child: 'x' }]) {
      const r = validateSignerDetails(junk, { requireChild: true, today });
      expect(r.ok).toBe(false);
    }
  });
});

describe('isValidBirthDate', () => {
  it('accepts a real past date and today, and nothing else', () => {
    expect(isValidBirthDate('2016-05-04', today)).toBe(true);
    expect(isValidBirthDate('2026-11-03', today)).toBe(true);
    expect(isValidBirthDate('2026-11-04', today)).toBe(false);
    expect(isValidBirthDate('2016-13-01', today)).toBe(false);
    expect(isValidBirthDate('2015-02-29', today)).toBe(false);
    expect(isValidBirthDate('2016-02-29', today)).toBe(true);
  });
});

describe('sealSignerDetails', () => {
  const validated = () => {
    const r = validateSignerDetails(good, { requireChild: true, today });
    if (!r.ok) throw new Error('fixture should be valid');
    return r.value;
  };

  it('records whether the submitted date of birth matches the profile', () => {
    expect(sealSignerDetails(validated(), '2016-05-04').child?.dob_differs_from_profile).toBe(false);
    expect(sealSignerDetails(validated(), '2016-05-04T00:00:00Z').child?.dob_differs_from_profile).toBe(false);
    expect(sealSignerDetails(validated(), '2015-05-04').child?.dob_differs_from_profile).toBe(true);
  });

  it('does not flag a mismatch when there is nothing on file to compare with', () => {
    expect(sealSignerDetails(validated(), null).child?.dob_differs_from_profile).toBe(false);
    expect(sealSignerDetails(validated(), undefined).child?.dob_differs_from_profile).toBe(false);
  });

  it('has no child block for an adult signing for themselves', () => {
    const r = validateSignerDetails(good, { requireChild: false, today });
    if (!r.ok) throw new Error('fixture should be valid');
    expect(sealSignerDetails(r.value, null).child).toBeUndefined();
  });
});

describe('maskIdNumber', () => {
  it('shows only the last three characters', () => {
    expect(maskIdNumber('123456782')).toBe('••••••782');
    expect(maskIdNumber('AB123456')).toBe('•••••456');
  });

  it('never shows a short value in full', () => {
    expect(maskIdNumber('123')).toBe('•••');
    expect(maskIdNumber('12')).toBe('•••');
    expect(maskIdNumber('')).toBe('');
    expect(maskIdNumber(null)).toBe('');
  });
});

describe('canonicalJson', () => {
  it('sorts keys at every level, whatever order they arrive in', () => {
    const a = canonicalJson({ b: 1, a: { d: 4, c: [{ z: 1, y: 2 }, 3] } });
    const b = canonicalJson({ a: { c: [{ y: 2, z: 1 }, 3], d: 4 }, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":{"c":[{"y":2,"z":1},3],"d":4},"b":1}');
  });

  it('changes when any value changes, including the ID number', () => {
    const base = validateSignerDetails(good, { requireChild: true, today });
    const other = validateSignerDetails(
      { ...good, signer: { ...good.signer, id_number: '000000018' } },
      { requireChild: true, today },
    );
    if (!base.ok || !other.ok) throw new Error('fixtures should be valid');
    expect(canonicalJson(base.value)).not.toBe(canonicalJson(other.value));
  });
});
