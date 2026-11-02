/**
 * The "Finish setup" checklist: which rows a studio sees, and which tick themselves.
 * Pure: the hook gathers the facts, this decides what to show.
 */

export type SetupRowId =
  | 'branding'
  | 'levels'
  | 'season'
  | 'classes'
  | 'packages'
  | 'offerings'
  | 'payments'
  | 'connect_payments'
  | 'legal'
  | 'leads'
  | 'test_enrolment'
  | 'first_quote';

/** What we know about the studio right now (from real data). */
export interface SetupFacts {
  hasLogo: boolean;
  levels: number;
  seasons: number;
  /** Active classes (dance) or active packages/services (everything else). */
  offerings: number;
  enrolments: number;
  leads: number;
  quotes: number;
  /** Studio has said how customers pay (instructions written, or a card provider connected). */
  paymentsReady: boolean;
  /** The studio chose online card payment (a provider, not pay-at-the-studio). */
  onlinePayments: boolean;
  /** Online payment keys are saved. */
  paymentsConnected: boolean;
  /** Legal pages published. */
  legalPublished: boolean;
}

export const EMPTY_FACTS: SetupFacts = {
  hasLogo: false,
  levels: 0,
  seasons: 0,
  offerings: 0,
  enrolments: 0,
  leads: 0,
  quotes: 0,
  paymentsReady: false,
  onlinePayments: false,
  paymentsConnected: false,
  legalPublished: false,
};

export type SetupFlavour = 'dance' | 'photographer' | 'general';

export function setupFlavour(vertical: string | null | undefined): SetupFlavour {
  if (vertical === 'dance-studio') return 'dance';
  if (vertical === 'photographer') return 'photographer';
  return 'general';
}

/** Row order per kind of studio. "Connect online payments" is added after "payments" only for studios on online payment. Dance follows the order the owner must build things in. */
const ROWS: Record<SetupFlavour, readonly SetupRowId[]> = {
  dance: ['branding', 'levels', 'season', 'classes', 'payments', 'legal', 'test_enrolment'],
  photographer: ['branding', 'packages', 'payments', 'legal', 'leads', 'first_quote'],
  general: ['branding', 'offerings', 'payments', 'legal', 'leads'],
};

export interface SetupRow {
  id: SetupRowId;
  done: boolean;
}

export function isRowDone(id: SetupRowId, f: SetupFacts): boolean {
  switch (id) {
    case 'branding':
      return f.hasLogo;
    case 'levels':
      return f.levels > 0;
    case 'season':
      return f.seasons > 0;
    case 'classes':
    case 'packages':
    case 'offerings':
      return f.offerings > 0;
    case 'payments':
      return f.paymentsReady;
    case 'connect_payments':
      return f.paymentsConnected;
    case 'legal':
      return f.legalPublished;
    case 'leads':
      return f.leads > 0;
    case 'test_enrolment':
      return f.enrolments > 0;
    case 'first_quote':
      return f.quotes > 0;
  }
}

export function buildSetupRows(vertical: string | null | undefined, facts: SetupFacts): SetupRow[] {
  return ROWS[setupFlavour(vertical)]
    .flatMap((id): SetupRowId[] => (id === 'payments' && facts.onlinePayments ? [id, 'connect_payments'] : [id]))
    .map((id) => ({ id, done: isRowDone(id, facts) }));
}

export interface SetupProgress {
  /** Rows that are done or skipped. */
  resolved: number;
  total: number;
  /** First row still to do: the "next step". */
  next: SetupRow | null;
  complete: boolean;
}

/** Rows that cannot be skipped: going live depends on them (legal: parents can't sign until it's confirmed). */
export const UNSKIPPABLE_ROWS: readonly SetupRowId[] = ['legal'];

export function canSkipRow(id: SetupRowId): boolean {
  return !UNSKIPPABLE_ROWS.includes(id);
}

export function setupProgress(rows: SetupRow[], skipped: readonly string[]): SetupProgress {
  const open = rows.filter((r) => !r.done && !(skipped.includes(r.id) && canSkipRow(r.id)));
  return {
    resolved: rows.length - open.length,
    total: rows.length,
    next: open[0] ?? null,
    complete: open.length === 0,
  };
}
