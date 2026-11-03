/**
 * "Fun setup": the friendly layer on the setup checklist. Pure, so it is easy to test.
 *
 * - Progress counts the set-up wizard as a step already done ("You're 30% there").
 * - A studio level, by how far it is: Getting started → Open for enquiries →
 *   Ready for clients → Fully set up.
 * - Each step has a rough time estimate for the next-step button.
 * - Three moments are celebrated once per studio (stored on tenants.celebrations).
 */
import type { SetupProgress, SetupRowId } from './setupChecklist';

/** Rough minutes per step: shown on the next-step button. */
export const ROW_MINUTES: Record<SetupRowId, number> = {
  branding: 2,
  levels: 3,
  season: 3,
  classes: 5,
  packages: 5,
  offerings: 5,
  payments: 3,
  connect_payments: 5,
  legal: 10,
  leads: 2,
  test_enrolment: 3,
  first_quote: 5,
};

export type SetupLevel = 'getting_started' | 'open_for_enquiries' | 'ready_for_clients' | 'fully_set_up';
export const SETUP_LEVELS: readonly SetupLevel[] = ['getting_started', 'open_for_enquiries', 'ready_for_clients', 'fully_set_up'];

export interface FunProgress {
  /** Steps done, with the set-up wizard counted as the first. */
  done: number;
  total: number;
  percent: number;
  /** Steps still to do (not done, not skipped). */
  remaining: number;
  level: SetupLevel;
  /** 1–4, for the gem. */
  levelNumber: number;
}

export function levelFor(percent: number, complete: boolean): SetupLevel {
  if (complete) return 'fully_set_up';
  if (percent >= 66) return 'ready_for_clients';
  if (percent >= 33) return 'open_for_enquiries';
  return 'getting_started';
}

/** The checklist's progress, with the wizard counted as done. */
export function funProgress(progress: SetupProgress): FunProgress {
  const done = progress.resolved + 1;
  const total = progress.total + 1;
  const percent = Math.round((done / total) * 100);
  const level = levelFor(percent, progress.complete);
  return { done, total, percent, remaining: total - done, level, levelNumber: SETUP_LEVELS.indexOf(level) + 1 };
}

// ── Celebrations ─────────────────────────────────────────────────────────────

export type CelebrationMoment = 'setup_done' | 'first_enquiry' | 'first_paid';
export const CELEBRATION_MOMENTS: readonly CelebrationMoment[] = ['setup_done', 'first_enquiry', 'first_paid'];

/** tenants.celebrations */
export interface CelebrationState {
  /** When each moment was celebrated (or found already reached). */
  fired: Partial<Record<CelebrationMoment, string>>;
  /** "Fewer celebrations": no confetti and no cheers. */
  fewer: boolean;
  /** Set the first time the studio is seen: moments already reached then are not celebrated. */
  since?: string;
}

export function parseCelebrations(raw: unknown): CelebrationState {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const firedRaw = o.fired && typeof o.fired === 'object' && !Array.isArray(o.fired) ? (o.fired as Record<string, unknown>) : {};
  const fired: CelebrationState['fired'] = {};
  for (const m of CELEBRATION_MOMENTS) if (typeof firedRaw[m] === 'string') fired[m] = firedRaw[m] as string;
  return { fired, fewer: o.fewer === true, ...(typeof o.since === 'string' ? { since: o.since } : {}) };
}

export interface MomentFacts {
  setupComplete: boolean;
  leads: number;
  paidClients: number;
}

export function reachedMoments(f: MomentFacts): CelebrationMoment[] {
  return CELEBRATION_MOMENTS.filter((m) =>
    m === 'setup_done' ? f.setupComplete : m === 'first_enquiry' ? f.leads > 0 : f.paidClients > 0,
  );
}

/**
 * What to do now: the moment to celebrate (if any) and the state to store.
 * The first time a studio is seen, moments it has already reached are recorded
 * without a celebration (an existing studio is not congratulated on old news).
 */
export function nextCelebration(
  state: CelebrationState,
  reached: CelebrationMoment[],
  now: string,
): { celebrate: CelebrationMoment | null; next: CelebrationState | null } {
  if (!state.since) {
    const fired = { ...state.fired };
    for (const m of reached) fired[m] = fired[m] ?? now;
    return { celebrate: null, next: { ...state, fired, since: now } };
  }
  const fresh = reached.find((m) => !state.fired[m]) ?? null;
  if (!fresh) return { celebrate: null, next: null };
  return { celebrate: fresh, next: { ...state, fired: { ...state.fired, [fresh]: now } } };
}

// ── Cheers ───────────────────────────────────────────────────────────────────

/** Rows that became done since the last time this device saw the checklist. */
export function newlyDone(doneNow: readonly string[], seenBefore: readonly string[] | null): string[] {
  if (seenBefore === null) return [];
  return doneNow.filter((id) => !seenBefore.includes(id));
}
