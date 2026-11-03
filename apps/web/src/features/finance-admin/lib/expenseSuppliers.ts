/**
 * Suppliers the studio has already recorded expenses for, so a new expense can suggest the
 * name and fill the supplier's VAT number (prefill rule: never ask blank what we know).
 */

export interface KnownSupplier {
  name: string;
  /** VAT number from the supplier's latest expense that had one. */
  vatNumber: string | null;
}

export interface SupplierExpenseRow {
  supplier_name: string | null;
  supplier_vat_number: string | null;
}

function supplierKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

/** Rows must be newest first; one entry per supplier (case-insensitive), newest spelling kept. */
export function knownSuppliers(rows: ReadonlyArray<SupplierExpenseRow>): KnownSupplier[] {
  const byKey = new Map<string, KnownSupplier>();
  for (const row of rows) {
    const name = row.supplier_name?.trim();
    if (!name) continue;
    const key = supplierKey(name);
    const vat = row.supplier_vat_number?.trim() || null;
    const known = byKey.get(key);
    if (!known) byKey.set(key, { name, vatNumber: vat });
    else if (!known.vatNumber && vat) known.vatNumber = vat;
  }
  return [...byKey.values()];
}

/** The known supplier whose name matches what was typed (ignoring case and extra spaces). */
export function findKnownSupplier(suppliers: ReadonlyArray<KnownSupplier>, typed: string): KnownSupplier | null {
  const key = supplierKey(typed);
  if (!key) return null;
  return suppliers.find((s) => supplierKey(s.name) === key) ?? null;
}
