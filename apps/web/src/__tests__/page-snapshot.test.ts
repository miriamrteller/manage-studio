// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_SNAPSHOT_ELEMENTS,
  SnapshotError,
  assertMasked,
  buildMaskedClone,
} from '@/lib/monitoring/pageSnapshot';

const SECRETS = ['Noa Cohen', '050-123-4567', 'noa@example.com', 'secret note', 'Beginner level', 'PRIVATE PHOTO', 'REPORT DIALOG TEXT'];

function page(html: string) {
  document.body.innerHTML = html;
}

beforeEach(() => {
  document.head.innerHTML = '<title>Dana Levi family</title><style>.big{width:10px}</style>';
  page(`
    <header id="h" class="big">Creative Ballet – <b>Noa Cohen</b></header>
    <p title="phone 050-123-4567">Call 050-123-4567 <a href="https://x.test/?token=abc">now</a></p>
    <form>
      <input value="noa@example.com" placeholder="Email" aria-label="Email">
      <textarea>secret note</textarea>
      <select><option>Beginner level</option></select>
      <input type="checkbox" checked>
    </form>
    <img alt="PRIVATE PHOTO" src="https://x.test/photo.png">
    <svg width="10" height="10"><text>PRIVATE PHOTO</text></svg>
    <canvas></canvas>
    <iframe src="https://x.test/frame"></iframe>
    <div style="display:none">hidden Noa Cohen</div>
    <script>var secret = "Noa Cohen";</script>
    <style>.x{color:red}</style>
    <dialog open><p>REPORT DIALOG TEXT</p></dialog>
    <div data-snapshot-ignore>ignored thing</div>
  `);
});

afterEach(() => {
  document.body.innerHTML = '';
});

function allText(root: Element): string {
  return root.textContent ?? '';
}

describe('buildMaskedClone', () => {
  it('wraps every piece of text in a masking span with transparent glyphs and a solid background', () => {
    const { root } = buildMaskedClone(window);
    const masked = Array.from(root.querySelectorAll('[data-masked="1"]')) as HTMLElement[];
    expect(masked.length).toBeGreaterThan(0);
    for (const span of masked) {
      expect(span.style.color).toBe('transparent');
      expect(span.style.backgroundColor).not.toBe('');
      expect(span.style.backgroundColor).not.toBe('transparent');
    }
    expect(() => assertMasked(root)).not.toThrow();
  });

  it('turns inputs, textareas, selects, images, svg, canvas and iframes into plain blocks', () => {
    const { root } = buildMaskedClone(window);
    for (const tag of ['input', 'textarea', 'select', 'option', 'img', 'svg', 'canvas', 'iframe']) {
      expect(root.querySelector(tag), `${tag} should not be in the copy`).toBeNull();
    }
    // The form is still there, holding block placeholders (4 controls) that keep their place.
    const form = root.querySelector('form') as HTMLElement;
    expect(form.querySelectorAll('div').length).toBe(4);
    expect(root.querySelectorAll('div[style*="background-color"]').length).toBeGreaterThanOrEqual(8);
  });

  it('leaves out scripts, styles, hidden elements, the open dialog and data-snapshot-ignore', () => {
    const { root } = buildMaskedClone(window);
    expect(root.querySelector('script, style, dialog, link, title, head')).toBeNull();
    expect(root.querySelectorAll('[data-snapshot-ignore]').length).toBe(0);
    // Text is only present inside masks, but check the omitted content never even gets that far.
    const text = allText(root);
    expect(text).not.toContain('hidden Noa Cohen');
    expect(text).not.toContain('REPORT DIALOG TEXT');
    expect(text).not.toContain('ignored thing');
    expect(text).not.toContain('var secret');
  });

  it('keeps no attribute that could hold content: no value, placeholder, alt, title, src, href, aria-*', () => {
    const { root } = buildMaskedClone(window);
    const forbidden = ['value', 'placeholder', 'alt', 'title', 'src', 'href', 'srcset', 'aria-label', 'name', 'id', 'class'];
    const serialized = new XMLSerializer().serializeToString(root);
    for (const el of Array.from(root.querySelectorAll('*'))) {
      for (const attr of forbidden) {
        expect(el.hasAttribute(attr), `<${el.localName}> kept ${attr}`).toBe(false);
      }
    }
    for (const secret of ['token=abc', 'photo.png', 'x.test']) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('never carries form values anywhere in the copy', () => {
    const { root } = buildMaskedClone(window);
    const serialized = new XMLSerializer().serializeToString(root);
    for (const secret of ['noa@example.com', 'secret note', 'Beginner level', 'PRIVATE PHOTO']) {
      expect(serialized, secret).not.toContain(secret);
    }
  });

  it('only the visible text of the page remains, and only inside masks (the page text is what layout needs)', () => {
    const { root } = buildMaskedClone(window);
    const remaining = SECRETS.filter((s) => allText(root).includes(s));
    // Text content that stays is visible text that is hidden by its mask: it may only appear in masked spans.
    for (const s of remaining) {
      const holders = Array.from(root.querySelectorAll('*')).filter((el) =>
        Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.nodeValue ?? '').includes(s)),
      );
      expect(holders.length).toBeGreaterThan(0);
      for (const h of holders) expect(h.getAttribute('data-masked')).toBe('1');
    }
  });

  it('sizes the picture to the viewport and puts the page at the scroll position', () => {
    const clone = buildMaskedClone(window);
    expect(clone.width).toBe(window.innerWidth);
    expect(clone.height).toBe(window.innerHeight);
    expect(clone.elementCount).toBeGreaterThan(5);
  });

  it('refuses a page with too many elements', () => {
    try {
      buildMaskedClone(window, 3);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(SnapshotError);
      expect((err as SnapshotError).code).toBe('too_large');
    }
    expect(MAX_SNAPSHOT_ELEMENTS).toBeGreaterThan(1000);
  });
});

describe('assertMasked', () => {
  it('passes for whitespace and masked text, and throws for bare text', () => {
    const ok = document.createElement('div');
    ok.innerHTML = '  <span data-masked="1">hidden</span>\n';
    expect(() => assertMasked(ok)).not.toThrow();

    const bad = document.createElement('div');
    bad.innerHTML = '<p>visible text</p>';
    expect(() => assertMasked(bad)).toThrow(SnapshotError);

    const nested = document.createElement('div');
    nested.innerHTML = '<span data-masked="1"><b>inner</b></span>';
    expect(() => assertMasked(nested)).toThrow(SnapshotError);
  });
});
