import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEV_PLATFORM_CHOICE,
  isDevPickerActive,
  parseDevStudioList,
  readDevStudioChoice,
} from './devStudioPicker';
import { isPlatformAppHost, resolveTenantSite } from './resolveTenantSubdomain';

const DEV_HOST = 'opalswift-app-dev.example.workers.dev';

function setLocation(hostname: string, search = '') {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, hostname, search },
  });
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('parseDevStudioList', () => {
  it('keeps valid subdomains once, in order', () => {
    expect(parseDevStudioList(' Lensstudio, creativeballet ,, lensstudio, bad_name ')).toEqual(['lensstudio', 'creativeballet']);
  });

  it('is empty when unset', () => {
    expect(parseDevStudioList(undefined)).toEqual([]);
  });
});

describe('dev studio picker off (every live build)', () => {
  it('is never active, and the address decides as before', () => {
    vi.stubEnv('VITE_DEV_STUDIO_PICKER', '');
    vi.stubEnv('VITE_APP_ROOT_DOMAIN', 'opalswift.com');
    setLocation('creativeballet.opalswift.com', '?studio=lensstudio');
    expect(isDevPickerActive()).toBe(false);
    expect(resolveTenantSite()).toEqual({ kind: 'subdomain', subdomain: 'creativeballet' });
  });
});

describe('dev studio picker on', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_DEV_STUDIO_PICKER', 'creativeballet,lensstudio');
    vi.stubEnv('VITE_APP_ROOT_DOMAIN', DEV_HOST);
  });

  it('has no studio until one is picked', () => {
    setLocation(DEV_HOST);
    expect(isDevPickerActive()).toBe(true);
    expect(readDevStudioChoice()).toBeNull();
    expect(resolveTenantSite()).toBeNull();
    expect(isPlatformAppHost()).toBe(false);
  });

  it('takes ?studio= and remembers it', () => {
    setLocation(DEV_HOST, '?studio=lensstudio');
    expect(resolveTenantSite()).toEqual({ kind: 'subdomain', subdomain: 'lensstudio' });
    setLocation(DEV_HOST, '');
    expect(resolveTenantSite()).toEqual({ kind: 'subdomain', subdomain: 'lensstudio' });
  });

  it('?studio=app opens the platform pages', () => {
    setLocation(DEV_HOST, '?studio=app');
    expect(readDevStudioChoice()).toBe(DEV_PLATFORM_CHOICE);
    expect(resolveTenantSite()).toBeNull();
    expect(isPlatformAppHost()).toBe(true);
  });

  it('ignores a stored value that is not a subdomain', () => {
    window.localStorage.setItem('opalswift.devStudio', 'not a host!');
    setLocation(DEV_HOST);
    expect(readDevStudioChoice()).toBeNull();
  });

  it('only on the dev address itself', () => {
    setLocation('elsewhere.example.com', '?studio=lensstudio');
    expect(isDevPickerActive()).toBe(false);
  });
});
