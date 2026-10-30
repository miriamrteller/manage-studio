/** The signed-contract view shown when a demo contract PDF link is opened. */
export interface DemoContractView {
  title: string;
  content: string;
  signerName: string;
  signedAt: string;
}

let current: DemoContractView | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function showContract(view: DemoContractView) {
  current = view;
  emit();
}

export function closeContract() {
  current = null;
  emit();
}

export function getContract(): DemoContractView | null {
  return current;
}

export function subscribeContract(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
