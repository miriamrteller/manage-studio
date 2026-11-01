import type { JobCreatePrefill } from '../components/JobCreateForm';

/** Where "Add client" / "New shoot" go: the Shoots page with the create form open. */
export const NEW_SHOOT_PATH = '/admin/jobs';

/**
 * Router state for the Shoots page create form. With a client, the form opens
 * on "Existing client" with that person selected; without one it opens on
 * "New client" (the photographer way to add a client is to book them).
 */
export function newShootState(client?: { id: string; name: string } | null): {
  newShoot: JobCreatePrefill;
} {
  return client
    ? { newShoot: { clientMode: 'existing', personId: client.id, personName: client.name } }
    : { newShoot: { clientMode: 'new' } };
}
