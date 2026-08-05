import { supabase } from './supabase';
import type { Database } from '@shared/database.types';
import type { Tenant } from '@shared/schemas';

type AllTables = Database['public']['Tables'];

/**
 * Tables that carry tenant_id — the only ones TenantDB may touch. Constraining the
 * generic this way lets TypeScript prove the tenant filter is valid, and rejects any
 * table that is not tenant-scoped at compile time.
 */
export type TenantTable = {
  [K in keyof AllTables]: AllTables[K]['Row'] extends { tenant_id: string } ? K : never;
}[keyof AllTables];

/** Tenant-scoped tables that also have an id primary key (update/delete by id). */
export type TenantRowTable = {
  [K in TenantTable]: AllTables[K]['Row'] extends { id: string } ? K : never;
}[TenantTable];

/**
 * TenantDB: Enforces tenant_id on every query
 *
 * CRITICAL: This is the ONLY way features access the DB.
 * Every query/mutation MUST go through these methods.
 * RLS is the fallback; this is the default.
 */
export class TenantDB {
  /**
   * Build a select query for a tenant.
   * Returns builder after initial setup, ready for chaining.
   *
   * Pass `columns` to project specific fields. Chaining a second `.select()` onto
   * the returned builder does not type-check against the generated schema — the
   * first projection already fixed the row type — so ask for the columns here.
   */
  static selectFor<T extends TenantTable>(
    table: T,
    tenant: Tenant,
    columns = '*',
    selectOptions?: { count?: 'exact' | 'planned' | 'estimated' }
  ) {
    if (!tenant?.id) throw new Error('Tenant ID required for query');
    return supabase
      .from(table)
      .select(columns, selectOptions)
      .eq('tenant_id' as never, tenant.id);
  }

  /**
   * Insert with automatic tenant_id injection.
   * Raises error if tenant_id is already in data (prevent override).
   */
  static insert<T extends TenantTable>(
    table: T,
    tenant: Tenant,
    data: Record<string, unknown>
  ) {
    if (!tenant?.id) throw new Error('Tenant ID required for insert');
    if ('tenant_id' in data && data.tenant_id !== tenant.id) {
      throw new Error('Cannot insert with different tenant_id');
    }

    return supabase
      .from(table)
      // The generated Insert type is per-table; callers pass validated shapes.
      .insert({ ...data, tenant_id: tenant.id } as never);
  }

  /**
   * Update with tenant safety check.
   * Ensures we can't accidentally update another tenant's row.
   */
  static update<T extends TenantRowTable>(
    table: T,
    tenant: Tenant,
    id: string,
    data: Record<string, unknown>
  ) {
    if (!tenant?.id) throw new Error('Tenant ID required for update');
    if ('tenant_id' in data) {
      throw new Error('Cannot update tenant_id field');
    }

    return supabase
      .from(table)
      .update(data as never)
      .eq('id' as never, id)
      .eq('tenant_id' as never, tenant.id);
  }

  /**
   * Delete with tenant safety check.
   * Can only delete rows belonging to the tenant.
   */
  static delete<T extends TenantRowTable>(table: T, tenant: Tenant, id: string) {
    if (!tenant?.id) throw new Error('Tenant ID required for delete');

    return supabase
      .from(table)
      .delete()
      .eq('id' as never, id)
      .eq('tenant_id' as never, tenant.id);
  }
}
