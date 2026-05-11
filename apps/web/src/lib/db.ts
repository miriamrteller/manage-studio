import { supabase } from './supabase';
import type { Tenant } from '@shared/schemas';

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
   */
  static selectFor(
    table: string,
    tenant: Tenant,
    selectOptions?: { count?: 'exact' | 'planned' | 'estimated' }
  ) {
    if (!tenant?.id) throw new Error('Tenant ID required for query');
    // Use .select() with default options, then add tenant filter
    return supabase
      .from(table)
      .select('*', selectOptions)
      .eq('tenant_id', tenant.id);
  }

  /**
   * Insert with automatic tenant_id injection.
   * Raises error if tenant_id is already in data (prevent override).
   */
  static insert(
    table: string,
    tenant: Tenant,
    data: Record<string, unknown>
  ) {
    if (!tenant?.id) throw new Error('Tenant ID required for insert');
    if ('tenant_id' in data && data.tenant_id !== tenant.id) {
      throw new Error('Cannot insert with different tenant_id');
    }
    
    return supabase
      .from(table)
      .insert({ ...data, tenant_id: tenant.id });
  }

  /**
   * Update with tenant safety check.
   * Ensures we can't accidentally update another tenant's row.
   */
  static update(
    table: string,
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
      .update(data)
      .eq('id', id)
      .eq('tenant_id', tenant.id);
  }

  /**
   * Delete with tenant safety check.
   * Can only delete rows belonging to the tenant.
   */
  static delete(table: string, tenant: Tenant, id: string) {
    if (!tenant?.id) throw new Error('Tenant ID required for delete');
    
    return supabase
      .from(table)
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenant.id);
  }
}
