/**
 * Who gets which auth email, and with which token.
 *
 * email_change (Supabase docs, "Email change behavior and token hash mapping"):
 * - Secure email change ON (both pairs present): two emails. The CURRENT address
 *   (user.email) gets `token` with `token_hash_new`; the NEW address (user.new_email)
 *   gets `token_new` with `token_hash`. The names are reversed for backward compatibility.
 * - Secure email change OFF: one email, to the NEW address, with `token_hash`.
 *
 * email_changed_notification: a notice (no link) to the OLD address after the change.
 * Everything else: one email to user.email with `token_hash`.
 */
export interface AuthHookUser {
  email: string;
  new_email?: string | null;
}

export interface AuthHookEmailData {
  token: string;
  token_hash: string;
  token_new?: string;
  token_hash_new?: string;
  old_email?: string;
  email_action_type: string;
}

export interface PlannedAuthEmail {
  to: string;
  /** Empty for a notice (no link). */
  tokenHash: string;
  /** The 6-digit code shown in the email, if any. */
  token?: string;
}

export function authEmailRecipients(user: AuthHookUser, data: AuthHookEmailData): PlannedAuthEmail[] {
  const action = data.email_action_type;
  if (action === "email_changed_notification") {
    const old = data.old_email?.trim();
    return old ? [{ to: old, tokenHash: "" }] : [];
  }
  if (action === "email_change") {
    const newEmail = user.new_email?.trim();
    if (data.token_hash_new) {
      const out: PlannedAuthEmail[] = [{ to: user.email, tokenHash: data.token_hash_new, token: data.token || undefined }];
      if (newEmail) out.push({ to: newEmail, tokenHash: data.token_hash, token: data.token_new || undefined });
      return out;
    }
    return [{ to: newEmail || user.email, tokenHash: data.token_hash, token: data.token_new || data.token || undefined }];
  }
  return [{ to: user.email, tokenHash: data.token_hash, token: data.token || undefined }];
}
