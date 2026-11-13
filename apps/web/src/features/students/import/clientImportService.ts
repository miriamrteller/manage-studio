import { supabase } from '@/lib/supabase';
import type { Json } from '@shared/database.types';
import type { ImportClient } from './clientImportRows';

export type MatchReason = 'email' | 'phone' | 'name';

export interface ClientMatch {
  /** 0-based position in the clients sent. */
  index: number;
  person_id: string;
  name: string;
  reason: MatchReason;
}

export interface ClientImportResult {
  batch_id: string;
  clients: number;
  students: number;
  skipped: number;
}

export interface ClientImportBatch {
  id: string;
  file_name: string;
  sheet_name: string | null;
  clients_count: number;
  students_count: number;
  skipped_count: number;
  created_at: string;
}

function payload(clients: ImportClient[]) {
  return clients.map(({ rowNumbers: _rows, ...c }) => c);
}

/** Client spreadsheet import (client_import_matches / import_clients). */
export const ClientImportService = {
  async matches(clients: ImportClient[]): Promise<ClientMatch[]> {
    const { data, error } = await supabase.rpc('client_import_matches', {
      p_clients: clients.map((c) => ({ name: c.name, email: c.email, phone: c.phone })) as unknown as Json,
    });
    if (error) throw error;
    return (data ?? []) as unknown as ClientMatch[];
  },

  async importClients(args: {
    fileName: string;
    sheetName: string | null;
    mapping: Record<string, string>;
    clients: ImportClient[];
  }): Promise<ClientImportResult> {
    // One call, one transaction; never retried (a retry after a timeout is skipped as
    // duplicates anyway, but one clear failure is easier to read).
    const { data, error } = await supabase.rpc('import_clients', {
      p_file_name: args.fileName,
      p_sheet_name: args.sheetName ?? '',
      p_mapping: args.mapping as Json,
      p_clients: payload(args.clients) as unknown as Json,
    });
    if (error) throw error;
    return data as unknown as ClientImportResult;
  },

  async listBatches(tenantId: string): Promise<ClientImportBatch[]> {
    const { data, error } = await supabase
      .from('client_import_batches')
      .select('id, file_name, sheet_name, clients_count, students_count, skipped_count, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return (data ?? []) as ClientImportBatch[];
  },
};
