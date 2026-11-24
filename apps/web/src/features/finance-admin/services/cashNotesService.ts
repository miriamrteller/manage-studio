import { z } from 'zod';
import { supabase } from '@/lib/supabase';

/** A teacher's "cash collected" note waiting for the office (get_cash_to_confirm). */
export const CashNoteSchema = z.object({
  id: z.string(),
  person_id: z.string(),
  person_name: z.string(),
  offering_id: z.string(),
  class_name: z.string(),
  session_date: z.string(),
  amount_minor: z.number().nullable(),
  currency: z.string().nullable(),
  note: z.string().nullable(),
  teacher_name: z.string().nullable(),
  created_at: z.string(),
});
export type CashNote = z.infer<typeof CashNoteSchema>;

export async function fetchCashToConfirm(): Promise<CashNote[]> {
  const { data, error } = await supabase.rpc('get_cash_to_confirm');
  if (error) throw error;
  return z.array(CashNoteSchema).parse(data ?? []);
}

/** Close a note: 'paid' once the payment is recorded, or 'not_received'. */
export async function resolveCashNote(noteId: string, outcome: 'paid' | 'not_received', paymentId?: string) {
  const { error } = await supabase.rpc('resolve_cash_note', {
    p_note_id: noteId,
    p_outcome: outcome,
    ...(paymentId ? { p_payment_id: paymentId } : {}),
  });
  if (error) throw error;
}
