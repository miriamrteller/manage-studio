import type { Lead } from '../services/leadService';

/** A lead's follow-up date against today (Israel): overdue, today, or nothing to flag. */
export function followUpState(
  lead: Pick<Lead, 'next_follow_up_at' | 'converted_account_id' | 'stage'>,
  today: string,
): 'overdue' | 'today' | null {
  if (!lead.next_follow_up_at || lead.converted_account_id || lead.stage === 'won' || lead.stage === 'lost') return null;
  const day = lead.next_follow_up_at.slice(0, 10);
  return day < today ? 'overdue' : day === today ? 'today' : null;
}
