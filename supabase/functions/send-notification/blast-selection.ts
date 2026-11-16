/**
 * Which of the resolved blast recipients actually get the email.
 *
 * The admin sees the recipient list with a tick per person and can untick
 * some. The form sends the ticked emails (selectedRecipientEmails); older
 * callers may send person ids (selectedPersonIds). A selection may only
 * narrow the resolved list, never add to it. With no selection, everyone
 * resolved is sent to.
 */
export interface SelectableRecipient {
  recipient_email: string;
  person_id: string | null;
}

export type SelectionResult<T> = { rows: T[] } | { error: string };

export function normaliseBlastEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function applyBlastSelection<T extends SelectableRecipient>(
  rows: T[],
  selection: { selectedRecipientEmails?: unknown; selectedPersonIds?: unknown },
): SelectionResult<T> {
  let out = rows;

  if (selection.selectedRecipientEmails !== undefined) {
    if (!Array.isArray(selection.selectedRecipientEmails)) {
      return { error: "selectedRecipientEmails must be an array" };
    }
    const wanted = new Set(
      selection.selectedRecipientEmails
        .filter((e): e is string => typeof e === "string" && e.trim().length > 0)
        .map(normaliseBlastEmail),
    );
    if (wanted.size === 0) return { error: "No recipients selected" };
    const resolved = new Set(out.map((row) => normaliseBlastEmail(row.recipient_email)));
    for (const email of wanted) {
      if (!resolved.has(email)) return { error: "Invalid recipient selection" };
    }
    out = out.filter((row) => wanted.has(normaliseBlastEmail(row.recipient_email)));
  }

  if (selection.selectedPersonIds !== undefined) {
    if (!Array.isArray(selection.selectedPersonIds)) {
      return { error: "selectedPersonIds must be an array" };
    }
    const wanted = new Set(
      selection.selectedPersonIds.filter((id): id is string => typeof id === "string" && id.length > 0),
    );
    if (wanted.size === 0) return { error: "No recipients selected" };
    const resolved = new Set(out.map((row) => row.person_id).filter((id): id is string => id !== null));
    for (const id of wanted) {
      if (!resolved.has(id)) return { error: "Invalid recipient selection" };
    }
    out = out.filter((row) => row.person_id !== null && wanted.has(row.person_id));
  }

  return { rows: out };
}
