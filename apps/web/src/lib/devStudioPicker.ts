/// <reference types="vite/client" />

/**
 * Dev website only: one address for every test studio.
 *
 * The live app finds the studio from the address (creativeballet.opalswift.com). The free
 * Cloudflare address of the dev website has no per-studio part, so there the studio is
 * picked from a list instead and remembered in this browser.
 *
 * On only when the build sets VITE_DEV_STUDIO_PICKER (a comma-separated list of test studio
 * subdomains, one per skin). The production release refuses that variable, so a live build
 * never has the picker.
 */

import { appRootHostname } from './tenantUrl';

const STORAGE_KEY = 'opalswift.devStudio';
/** Stored instead of a studio when the OpalSwift platform pages (sign-up, welcome) are chosen. */
export const DEV_PLATFORM_CHOICE = '__platform__';

const SUBDOMAIN_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/** Parses the configured list: trimmed, lower-case, valid subdomains, no repeats. */
export function parseDevStudioList(raw: string | undefined | null): string[] {
  const out: string[] = [];
  for (const part of (raw ?? '').split(',')) {
    const s = part.trim().toLowerCase();
    if (s && SUBDOMAIN_RE.test(s) && !out.includes(s)) out.push(s);
  }
  return out;
}

/** The test studios offered in the picker; empty when the picker is off. */
export function devStudioList(): string[] {
  return parseDevStudioList(import.meta.env.VITE_DEV_STUDIO_PICKER as string | undefined);
}

export function isDevStudioPickerOn(): boolean {
  return devStudioList().length > 0;
}

/** Picker on, and this is the dev website's single address (the root itself). */
export function isDevPickerActive(): boolean {
  if (typeof window === 'undefined' || !isDevStudioPickerOn()) return false;
  return window.location.hostname.trim().toLowerCase().replace(/\.$/, '') === appRootHostname();
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The current choice: a studio subdomain, DEV_PLATFORM_CHOICE, or null (nothing picked yet).
 * A `?studio=` in the address wins and is remembered, so a link can open a given studio.
 */
export function readDevStudioChoice(search: string = typeof window === 'undefined' ? '' : window.location.search): string | null {
  const fromUrl = new URLSearchParams(search).get('studio')?.trim().toLowerCase();
  if (fromUrl) {
    const choice = fromUrl === 'app' || fromUrl === 'platform' ? DEV_PLATFORM_CHOICE : fromUrl;
    if (choice === DEV_PLATFORM_CHOICE || SUBDOMAIN_RE.test(choice)) {
      storage()?.setItem(STORAGE_KEY, choice);
      return choice;
    }
  }
  const stored = storage()?.getItem(STORAGE_KEY) ?? null;
  if (stored === DEV_PLATFORM_CHOICE || (stored && SUBDOMAIN_RE.test(stored))) return stored;
  return null;
}

/** Picks a studio (or the platform pages, or nothing) and reloads onto the start page. */
export function chooseDevStudio(choice: string | null): void {
  const s = storage();
  if (choice) s?.setItem(STORAGE_KEY, choice);
  else s?.removeItem(STORAGE_KEY);
  window.location.assign('/');
}

/**
 * The dev website or a local dev build: never the live site. Testing-only switches (such as the
 * Takbull test keys) exist only here.
 */
export function isDevSite(): boolean {
  return isDevStudioPickerOn() || import.meta.env.DEV === true;
}
