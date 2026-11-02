import { describe, expect, it } from 'vitest';
import { hostedFormHash } from './hostedForm';

const base = 'https://demo.example/index.html#/admin/leads';

describe('hostedFormHash', () => {
  it('maps the hosted and embedded form to the demo route, keeping the tags', () => {
    expect(hostedFormHash('https://demo.example/inquire?src=instagram&campaign=spring', base)).toBe(
      '#/inquire?src=instagram&campaign=spring',
    );
    expect(hostedFormHash('https://demo.example/embed/inquire?lang=he', base)).toBe('#/inquire?lang=he');
  });

  it('leaves other pages and other sites alone', () => {
    expect(hostedFormHash('https://demo.example/book', base)).toBeNull();
    expect(hostedFormHash('https://wa.me/?text=hi', base)).toBeNull();
    expect(hostedFormHash('https://other.example/inquire', base)).toBeNull();
    expect(hostedFormHash('not a url ::', 'about:blank')).toBeNull();
  });
});
