import { linkMyGuardianAccounts } from '../linkAuthUser';
import {
  NoFamilyAccountError,
  resolveGuardianProfile,
  type ResolveGuardianProfileInput,
  type ResolveGuardianProfileResult,
} from './resolveGuardianProfile';

/**
 * Resolves the signed-in parent's guardian profile. If the login has no family account
 * yet, asks the database once to link it to family rows carrying the login's verified
 * email (link_my_guardian_accounts) and looks again. This covers a parent who enrolled
 * as a guest and signs in later, when no earlier step linked them.
 */
export async function resolveGuardianWithLink(
  input: ResolveGuardianProfileInput,
): Promise<ResolveGuardianProfileResult> {
  const first = await resolveGuardianProfile(input);
  if (first.status !== 'missing_account' || !(first.error instanceof NoFamilyAccountError)) {
    return first;
  }

  let linked = 0;
  try {
    linked = await linkMyGuardianAccounts();
  } catch (err) {
    console.warn('[Portal] could not link family account:', err instanceof Error ? err.message : err);
    return first;
  }

  return linked > 0 ? resolveGuardianProfile(input) : first;
}
