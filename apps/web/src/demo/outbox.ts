/**
 * Demo outbox: every email/WhatsApp the app would have sent is recorded here
 * instead, so the demo bar can show it and offer the client-side link.
 */
export interface OutboxMessage {
  id: number;
  at: string;
  to: string;
  subject: string;
  body: string;
  /** In-app link (hash route) the recipient would open, if any. */
  link?: { label: string; href: string };
}

let seq = 0;
const messages: OutboxMessage[] = [];
const listeners = new Set<() => void>();

export function sendToOutbox(msg: Omit<OutboxMessage, 'id' | 'at'>): OutboxMessage {
  seq += 1;
  const full = { ...msg, id: seq, at: new Date().toISOString() };
  messages.unshift(full);
  for (const l of listeners) l();
  return full;
}

export function getOutbox(): OutboxMessage[] {
  return messages;
}

export function subscribeOutbox(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
