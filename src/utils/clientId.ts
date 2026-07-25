/**
 * Identifies THIS browser tab (not the user).
 *
 * Mutations carry it so the live stream can tell an echo of a change this tab just made
 * from a change made elsewhere. Keying on the user would be wrong: the same person
 * signed in on a tablet and a desktop must still see each device update the other.
 */
export const DWES_CLIENT_ID_HEADER = 'X-DWES-Client-Id';

export const DWES_CLIENT_ID: string =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `c_${Date.now()}_${Math.random().toString(36).slice(2)}`;
