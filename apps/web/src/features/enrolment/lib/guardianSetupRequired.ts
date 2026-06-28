export type GuardianResolveStatus =
  | 'found'
  | 'missing_person'
  | 'missing_account'
  | 'loading'
  | 'error';

export function computeGuardianSetupRequired(input: {
  isAdultIntake: boolean;
  resolveStatus: GuardianResolveStatus;
  dateOfBirth: string | null;
}): boolean {
  if (!input.isAdultIntake) return false;
  if (input.resolveStatus === 'missing_person') return true;
  if (input.resolveStatus === 'found' && !input.dateOfBirth) return true;
  return false;
}
