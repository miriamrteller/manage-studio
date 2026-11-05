// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  init: vi.fn(),
  addEventProcessor: vi.fn(),
  breadcrumbsIntegration: vi.fn(),
  captureException: vi.fn(),
  captureFeedback: vi.fn((..._args: unknown[]) => 'feedback-1'),
  lastEventId: vi.fn(() => 'evt-last'),
  setTag: vi.fn(),
  setUser: vi.fn(),
  withScope: vi.fn(),
}));
vi.mock('../lib/monitoring/sdk', () => sdk);

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];

function file(bytes: number[], name: string, type: string, padTo = 0): File {
  const data = new Uint8Array(Math.max(bytes.length, padTo));
  data.set(bytes);
  return new File([data], name, { type });
}

async function load() {
  vi.resetModules();
  vi.stubEnv('VITE_SENTRY_DSN', 'https://k@o1.ingest.de.sentry.io/1');
  return import('../lib/monitoring');
}

beforeEach(() => {
  Object.values(sdk).forEach((fn) => fn.mockClear());
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('checkScreenshot', () => {
  it('accepts a real PNG, JPEG and WebP', async () => {
    const { checkScreenshot } = await load();
    expect(await checkScreenshot(file(PNG, 'a.png', 'image/png'))).toBeNull();
    expect(await checkScreenshot(file(JPEG, 'a.jpg', 'image/jpeg'))).toBeNull();
    expect(await checkScreenshot(file(WEBP, 'a.webp', 'image/webp'))).toBeNull();
  });

  it('refuses other types (GIF, PDF, SVG, text)', async () => {
    const { checkScreenshot } = await load();
    for (const type of ['image/gif', 'application/pdf', 'image/svg+xml', 'text/plain', '']) {
      expect(await checkScreenshot(file(PNG, 'x', type))).toBe('type');
    }
  });

  it('refuses a file that is not really the image type it claims to be', async () => {
    const { checkScreenshot } = await load();
    expect(await checkScreenshot(file([0x25, 0x50, 0x44, 0x46], 'doc.png', 'image/png'))).toBe('type');
    expect(await checkScreenshot(file(PNG, 'a.jpg', 'image/jpeg'))).toBe('type');
  });

  it('allows up to 5 MB and refuses anything larger', async () => {
    const { checkScreenshot, SCREENSHOT_MAX_BYTES } = await load();
    expect(SCREENSHOT_MAX_BYTES).toBe(5 * 1024 * 1024);
    expect(await checkScreenshot(file(PNG, 'ok.png', 'image/png', SCREENSHOT_MAX_BYTES))).toBeNull();
    expect(await checkScreenshot(file(PNG, 'big.png', 'image/png', SCREENSHOT_MAX_BYTES + 1))).toBe('size');
  });
});

describe('sendProblemReport with a screenshot', () => {
  it('sends the image as an attachment with a generic file name and the right type', async () => {
    const { sendProblemReport } = await load();
    const id = await sendProblemReport('Save did nothing', file(PNG, 'Dana Levi payment 0501234567.png', 'image/png', 20));
    expect(id).toBe('feedback-1');
    const [params, hint] = sdk.captureFeedback.mock.calls[0] as unknown as [
      Record<string, unknown>,
      { attachments: Array<{ filename: string; contentType: string; data: Uint8Array }> },
    ];
    expect(params.source).toBe('report-problem');
    expect(hint.attachments).toHaveLength(1);
    expect(hint.attachments[0].filename).toBe('screenshot.png');
    expect(hint.attachments[0].contentType).toBe('image/png');
    expect(hint.attachments[0].data).toBeInstanceOf(Uint8Array);
    expect(hint.attachments[0].data).toHaveLength(20);
    expect(Array.from(hint.attachments[0].data.slice(0, 4))).toEqual(PNG.slice(0, 4));
    // The picked file's own name (it can hold a person's name or number) goes nowhere.
    expect(JSON.stringify(params) + hint.attachments[0].filename).not.toContain('Dana');
  });

  it('still scrubs the text', async () => {
    const { sendProblemReport } = await load();
    await sendProblemReport('Call dana@example.com on 050-123-4567', file(JPEG, 's.jpg', 'image/jpeg'));
    const params = sdk.captureFeedback.mock.calls[0][0] as unknown as { message: string };
    expect(params.message).not.toContain('dana@example.com');
    expect(params.message).not.toContain('123-4567');
  });

  it('sends nothing, and no attachment, when the image is not valid', async () => {
    const { sendProblemReport } = await load();
    expect(await sendProblemReport('x', file(PNG, 'a.gif', 'image/gif'))).toBeNull();
    expect(sdk.captureFeedback).not.toHaveBeenCalled();
  });

  it('sends no attachment at all when none was chosen (nothing is captured automatically)', async () => {
    const { sendProblemReport } = await load();
    await sendProblemReport('Just text');
    await sendProblemReport('Just text', null);
    expect(sdk.captureFeedback).toHaveBeenCalledTimes(2);
    for (const call of sdk.captureFeedback.mock.calls) {
      expect(call[1]).toBeUndefined();
    }
  });
});
