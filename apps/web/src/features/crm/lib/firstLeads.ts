/**
 * "Get your first leads" checklist (Leads page). Progress is kept on this
 * device per studio, like the studio-home setup guide (useSetupGuide).
 * Actions in the Get leads panel tick steps through markFirstLeadsStep; the
 * test enquiry ticks itself once the studio has any lead.
 */
export const FIRST_LEADS_STEPS = ['share_link', 'instagram', 'poster', 'test_enquiry', 'website'] as const;
export type FirstLeadsStep = (typeof FIRST_LEADS_STEPS)[number];
/** Optional: not counted in progress (most studios have no website). */
export const OPTIONAL_STEPS: readonly FirstLeadsStep[] = ['website'];

export interface FirstLeadsState {
  done: FirstLeadsStep[];
  hidden: boolean;
}

export const FIRST_LEADS_EVENT = 'first-leads-updated';
const key = (tenantId: string) => `first-leads:${tenantId}`;

export function loadFirstLeads(tenantId: string | undefined): FirstLeadsState {
  if (!tenantId) return { done: [], hidden: false };
  try {
    const raw = window.localStorage.getItem(key(tenantId));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<FirstLeadsState>;
      return {
        done: Array.isArray(parsed.done)
          ? parsed.done.filter((s): s is FirstLeadsStep => (FIRST_LEADS_STEPS as readonly string[]).includes(s as string))
          : [],
        hidden: parsed.hidden === true,
      };
    }
  } catch {
    /* blocked storage: start fresh */
  }
  return { done: [], hidden: false };
}

export function saveFirstLeads(tenantId: string | undefined, state: FirstLeadsState): void {
  if (!tenantId) return;
  try {
    window.localStorage.setItem(key(tenantId), JSON.stringify(state));
  } catch {
    /* ignore: the list still works for this visit */
  }
  window.dispatchEvent(new CustomEvent(FIRST_LEADS_EVENT));
}

/** Tick a step from anywhere (e.g. "Copy link" in the Get leads panel). */
export function markFirstLeadsStep(tenantId: string | undefined, step: FirstLeadsStep): void {
  const state = loadFirstLeads(tenantId);
  if (state.done.includes(step)) return;
  saveFirstLeads(tenantId, { ...state, done: [...state.done, step] });
}

/** Steps done, counting the test enquiry as done once any lead exists. */
export function effectiveDone(state: FirstLeadsState, leadCount: number): Set<FirstLeadsStep> {
  const done = new Set(state.done);
  if (leadCount > 0) done.add('test_enquiry');
  return done;
}

export function firstLeadsProgress(done: Set<FirstLeadsStep>): { done: number; total: number; complete: boolean } {
  const required = FIRST_LEADS_STEPS.filter((s) => !OPTIONAL_STEPS.includes(s));
  const n = required.filter((s) => done.has(s)).length;
  return { done: n, total: required.length, complete: n === required.length };
}
