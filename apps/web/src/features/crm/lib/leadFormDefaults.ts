import { LEAD_CHANNELS, type LeadChannel } from '../services/leadService';

const CHANNEL_KEY = 'leads:last-manual-channel';

/** The channel the admin chose for their last hand-added lead (this browser), or 'website'. */
export function lastLeadChannel(): LeadChannel {
  try {
    const saved = window.localStorage.getItem(CHANNEL_KEY);
    if (saved && (LEAD_CHANNELS as readonly string[]).includes(saved)) return saved as LeadChannel;
  } catch {
    // Storage blocked: fall back.
  }
  return 'website';
}

export function rememberLeadChannel(channel: LeadChannel): void {
  try {
    window.localStorage.setItem(CHANNEL_KEY, channel);
  } catch {
    // Storage blocked: nothing to remember.
  }
}

/** Tomorrow's date (YYYY-MM-DD) in local time. */
export function tomorrowLocal(now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
