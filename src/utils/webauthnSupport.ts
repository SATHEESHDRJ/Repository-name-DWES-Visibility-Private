/** Must match DWES_HOSTNAME / RP_ID used for LAN HTTPS (see DEPLOY-LAN.md). */
export const DWES_HOSTNAME =
  import.meta.env.VITE_DWES_HOSTNAME?.trim() || 'dwes.local';

/** Public HTTPS gateway port (dev:https). Plain HTTP dev uses 5175 — not valid for WebAuthn. */
export const CANONICAL_HTTPS_PORT =
  import.meta.env.VITE_DWES_HTTPS_PORT?.trim() || '5173';

/** URL users should open for fingerprint enrollment (hostname + HTTPS gateway). */
export function fingerprintEntryUrl(): string {
  if (typeof window !== 'undefined') {
    const { hostname, protocol, port } = window.location;
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
    const validHostname = !isIpHostname(hostname);
    const portOk = !port || port === CANONICAL_HTTPS_PORT;
    if (protocol === 'https:' && portOk && (validHostname || isLocal)) {
      return window.location.origin;
    }
  }
  return `https://${DWES_HOSTNAME}:${CANONICAL_HTTPS_PORT}`;
}

export function isIpHostname(hostname: string): boolean {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname);
}

export interface WebAuthnContextAssessment {
  supported: boolean;
  message?: string;
  suggestedUrl?: string;
}

/** Browser-side check: secure context + valid hostname (not raw LAN IP). */
export function assessWebAuthnContext(): WebAuthnContextAssessment {
  const { hostname, protocol, port } = window.location;
  const entryUrl = fingerprintEntryUrl();
  const portOk = !port || port === CANONICAL_HTTPS_PORT;

  if (isIpHostname(hostname)) {
    return {
      supported: false,
      message: `Fingerprint requires HTTPS + a hostname — open at ${entryUrl}`,
      suggestedUrl: entryUrl,
    };
  }

  // RP_ID is dwes.local — enrollment only works when the address bar shows that hostname.
  if (hostname !== DWES_HOSTNAME) {
    const onLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    return {
      supported: false,
      message: onLocalhost
        ? `You are on plain HTTP dev — stop dev:all, run npm run dev:fingerprint, add hosts (127.0.0.1 ${DWES_HOSTNAME}), then open ${entryUrl}`
        : `Fingerprint requires HTTPS + a hostname — open at ${entryUrl}`,
      suggestedUrl: entryUrl,
    };
  }

  if (protocol !== 'https:') {
    return {
      supported: false,
      message: `Fingerprint requires HTTPS — open at ${entryUrl} (not ${window.location.origin})`,
      suggestedUrl: entryUrl,
    };
  }

  if (!portOk) {
    return {
      supported: false,
      message: `Use the HTTPS gateway port — open at ${entryUrl}`,
      suggestedUrl: entryUrl,
    };
  }

  return { supported: true };
}

/** Map WebAuthn / API errors to user-friendly text. */
export function friendlyWebAuthnError(err: unknown): string {
  const axiosMsg = (err as { response?: { status?: number; data?: { message?: string } } })
    ?.response?.data?.message;
  const status = (err as { response?: { status?: number } })?.response?.status;

  if (status === 401) {
    return 'You must be signed in to enable fingerprint sign-in.';
  }

  const raw =
    axiosMsg ??
    (err instanceof Error ? err.message : '') ??
    '';

  if (
    /invalid for this domain/i.test(raw) ||
    /ERROR_INVALID_RP_ID/i.test(raw) ||
    /SecurityError/i.test(String(err))
  ) {
    const ctx = assessWebAuthnContext();
    return ctx.message ?? `Fingerprint requires HTTPS + a hostname — open at ${ctx.suggestedUrl ?? suggestedUrl()}`;
  }

  if (err instanceof Error && err.name === 'NotAllowedError') {
    return 'Fingerprint was cancelled or not recognised — try again.';
  }

  if (err instanceof Error && err.name === 'AbortError') {
    return 'Fingerprint setup was cancelled.';
  }

  return raw || 'Fingerprint setup failed — try again.';
}

function suggestedUrl(): string {
  return fingerprintEntryUrl();
}
