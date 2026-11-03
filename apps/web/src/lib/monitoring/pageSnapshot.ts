/**
 * "Snapshot with text hidden": a picture of the page the admin is on with every piece of text,
 * every form value and every image replaced by a solid block, while the layout and colours stay.
 *
 * Built in the app from the live DOM (never OCR on an uploaded image, and nothing is sent anywhere
 * from here): the page is copied element by element with its computed styles; each run of text
 * is wrapped in a span whose background is a solid block and whose glyphs are transparent; inputs,
 * textareas, selects, images, svg, canvas, video and iframes become plain blocks of the same size.
 * The copy is then drawn to a canvas through an SVG <foreignObject> and exported as a PNG, so the
 * file holds pixels only. No capture library: this module is loaded on demand (dynamic import)
 * when the admin presses the button, so it adds nothing to the normal app load.
 */

export type SnapshotErrorCode = 'too_large' | 'failed';

export class SnapshotError extends Error {
  constructor(readonly code: SnapshotErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'SnapshotError';
  }
}

/** Pages with more elements than this are refused, to keep the click responsive. */
export const MAX_SNAPSHOT_ELEMENTS = 15000;

/** Marks the spans that hide text; assertMasked() checks that every text node sits in one. */
const MASK_ATTR = 'data-masked';

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'TEMPLATE', 'HEAD', 'TITLE', 'BASE', 'SOURCE', 'TRACK']);
const MEDIA_TAGS = new Set([
  'IMG', 'PICTURE', 'VIDEO', 'CANVAS', 'SVG', 'IFRAME', 'OBJECT', 'EMBED', 'AUDIO', 'MAP', 'METER', 'PROGRESS',
]);
const FORM_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

const TEXT_FALLBACK = '#1f2937';
const FORM_BLOCK = '#374151';
const MEDIA_BLOCK = '#9ca3af';

export interface MaskedClone {
  root: HTMLElement;
  width: number;
  height: number;
  elementCount: number;
}

function isTransparent(color: string): boolean {
  const c = color.replace(/\s+/g, '').toLowerCase();
  return c === 'transparent' || /^rgba\(\d+,\d+,\d+,0(\.0+)?\)$/.test(c);
}

/** Copies the computed style of a live element onto a copy, minus anything that could pull in content. */
function copyStyles(cs: CSSStyleDeclaration, to: HTMLElement): void {
  for (let i = 0; i < cs.length; i++) {
    const name = cs[i];
    to.style.setProperty(name, cs.getPropertyValue(name), cs.getPropertyPriority(name));
  }
  to.style.setProperty('background-image', 'none');
  to.style.setProperty('list-style-image', 'none');
  to.style.setProperty('border-image-source', 'none');
  to.style.setProperty('mask-image', 'none');
  to.style.setProperty('animation', 'none');
  to.style.setProperty('transition', 'none');
}

/**
 * Builds the masked copy of the page as it is now: the visible part of the document (the viewport),
 * without the open dialog (the report window itself) or anything marked data-snapshot-ignore.
 */
export function buildMaskedClone(win: Window = window, maxElements = MAX_SNAPSHOT_ELEMENTS): MaskedClone {
  const live = win.document;
  const scratch = live.implementation.createHTMLDocument('');
  const width = Math.max(1, Math.round(win.innerWidth));
  const height = Math.max(1, Math.round(win.innerHeight));
  let elementCount = 0;

  const bump = () => {
    elementCount += 1;
    if (elementCount > maxElements) throw new SnapshotError('too_large');
  };

  const placeholder = (el: Element, cs: CSSStyleDeclaration, color: string): HTMLElement => {
    bump();
    const rect = el.getBoundingClientRect();
    const block = scratch.createElement('div');
    copyStyles(cs, block);
    const display = cs.display === 'inline' || cs.display === 'contents' ? 'inline-block' : cs.display;
    block.style.setProperty('display', display);
    block.style.setProperty('box-sizing', 'border-box');
    block.style.setProperty('width', `${rect.width}px`);
    block.style.setProperty('height', `${rect.height}px`);
    block.style.setProperty('background-color', color);
    block.style.setProperty('border-color', color);
    block.style.setProperty('color', 'transparent');
    block.style.setProperty('overflow', 'hidden');
    return block;
  };

  const maskText = (text: Text, parentColor: string): Node => {
    const data = text.data;
    // Whitespace-only text keeps the spacing between inline elements and holds no content.
    if (data.trim() === '') return scratch.createTextNode(data);
    bump();
    const span = scratch.createElement('span');
    const block = isTransparent(parentColor) ? TEXT_FALLBACK : parentColor;
    span.setAttribute(MASK_ATTR, '1');
    span.style.setProperty('color', 'transparent');
    span.style.setProperty('-webkit-text-fill-color', 'transparent');
    span.style.setProperty('text-shadow', 'none');
    span.style.setProperty('text-decoration', 'none');
    span.style.setProperty('background-color', block);
    span.style.setProperty('box-decoration-break', 'clone');
    span.style.setProperty('-webkit-box-decoration-break', 'clone');
    span.appendChild(scratch.createTextNode(data));
    return span;
  };

  const cloneChildren = (from: Element, to: HTMLElement, parentColor: string) => {
    for (const child of Array.from(from.childNodes)) {
      if (child.nodeType === 3) {
        to.appendChild(maskText(child as Text, parentColor));
      } else if (child.nodeType === 1) {
        const copy = cloneElement(child as Element);
        if (copy) to.appendChild(copy);
      }
    }
  };

  const cloneElement = (el: Element): HTMLElement | null => {
    const tag = el.localName.toUpperCase();
    if (SKIP_TAGS.has(tag)) return null;
    if (el.matches('dialog[open], [data-snapshot-ignore]')) return null;
    const cs = win.getComputedStyle(el);
    if (cs.display === 'none') return null;

    if (FORM_TAGS.has(tag)) return placeholder(el, cs, FORM_BLOCK);
    if (MEDIA_TAGS.has(tag)) return placeholder(el, cs, MEDIA_BLOCK);

    bump();
    const copy = scratch.createElement(tag.toLowerCase());
    copyStyles(cs, copy);
    cloneChildren(el, copy, cs.color);
    return copy;
  };

  const body = live.body;
  const bodyCs = win.getComputedStyle(body);
  const htmlCs = win.getComputedStyle(live.documentElement);
  const bodyRect = body.getBoundingClientRect();

  const wrapper = scratch.createElement('div');
  wrapper.style.setProperty('position', 'relative');
  wrapper.style.setProperty('overflow', 'hidden');
  wrapper.style.setProperty('transform', 'translateZ(0)');
  wrapper.style.setProperty('width', `${width}px`);
  wrapper.style.setProperty('height', `${height}px`);
  const pageBg = !isTransparent(bodyCs.backgroundColor)
    ? bodyCs.backgroundColor
    : !isTransparent(htmlCs.backgroundColor)
      ? htmlCs.backgroundColor
      : '#ffffff';
  wrapper.style.setProperty('background-color', pageBg);

  const page = scratch.createElement('div');
  copyStyles(bodyCs, page);
  page.style.setProperty('position', 'absolute');
  page.style.setProperty('margin', '0');
  page.style.setProperty('left', `${-win.scrollX}px`);
  page.style.setProperty('top', `${-win.scrollY}px`);
  page.style.setProperty('width', `${bodyRect.width}px`);
  page.style.setProperty('min-height', `${bodyRect.height}px`);
  cloneChildren(body, page, bodyCs.color);
  wrapper.appendChild(page);

  assertMasked(wrapper);
  return { root: wrapper, width, height, elementCount };
}

/** Throws unless every piece of text in the copy is inside a masking span. A safety net, not the mechanism. */
export function assertMasked(root: Element): void {
  const walker = root.ownerDocument.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if ((node.nodeValue ?? '').trim() === '') continue;
    const parent = node.parentElement;
    if (!parent || parent.getAttribute(MASK_ATTR) !== '1') {
      throw new SnapshotError('failed', 'unmasked text in snapshot');
    }
  }
}

function svgDataUrl(clone: MaskedClone): string {
  const html = new XMLSerializer().serializeToString(clone.root);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${clone.width}" height="${clone.height}">` +
    `<foreignObject x="0" y="0" width="${clone.width}" height="${clone.height}">${html}</foreignObject></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Takes the snapshot and returns it as a PNG file ready to attach. */
export async function capturePageSnapshot(win: Window = window): Promise<File> {
  try {
    const clone = buildMaskedClone(win);
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new SnapshotError('failed', 'snapshot could not be drawn'));
      img.src = svgDataUrl(clone);
    });
    const canvas = win.document.createElement('canvas');
    canvas.width = clone.width;
    canvas.height = clone.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new SnapshotError('failed', 'canvas is not available');
    ctx.drawImage(img, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new SnapshotError('failed', 'snapshot could not be saved');
    return new File([blob], 'screenshot.png', { type: 'image/png' });
  } catch (err) {
    if (err instanceof SnapshotError) throw err;
    // A browser that taints the canvas or cannot draw foreignObject lands here.
    throw new SnapshotError('failed', err instanceof Error ? err.message : undefined);
  }
}
