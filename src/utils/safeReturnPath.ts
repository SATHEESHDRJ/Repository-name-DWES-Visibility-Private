/** Allow only same-origin relative install deep links after login. */
export function resolveSafeReturnPath(candidate: string | undefined | null): string | null {
  if (!candidate || typeof candidate !== 'string') return null;
  const path = candidate.trim();
  if (!path.startsWith('/')) return null;
  if (path.startsWith('//')) return null;
  if (path.includes('://')) return null;
  if (!path.startsWith('/install/')) return null;
  const rest = path.slice('/install/'.length);
  if (!rest || rest.includes('/') || rest.includes('?') || rest.includes('#')) return null;
  if (rest.length < 32 || rest.length > 64) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(rest)) return null;
  return path;
}

export function postLoginDestination(
  returnToAfterLogin: string | undefined,
  roleRoute: string,
): string {
  return resolveSafeReturnPath(returnToAfterLogin) ?? roleRoute;
}