/** The sample invoice shown after a demo payment. */
export interface DemoInvoice {
  number: string;
  clientName: string;
  description: string;
  amountMinor: number;
  paidAt: string;
}

let current: DemoInvoice | null = null;
let counter = 30480;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function showInvoice(inv: Omit<DemoInvoice, 'number'> & { number?: string }): DemoInvoice {
  counter += 1;
  current = { ...inv, number: inv.number ?? String(counter) };
  emit();
  return current;
}

export function closeInvoice() {
  current = null;
  emit();
}

export function getInvoice(): DemoInvoice | null {
  return current;
}

export function subscribeInvoice(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
