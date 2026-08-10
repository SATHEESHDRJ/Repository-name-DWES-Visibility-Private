import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  platformAuthenticatorIsAvailable,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { webAuthnApi } from '../services/webauthnApi';
import { ROLE_ROUTES } from '../types';
import type { UserRole } from '../types';
import { postLoginDestination } from '../utils/safeReturnPath';
import {
  assessWebAuthnContext,
  friendlyWebAuthnError,
} from '../utils/webauthnSupport';

export const BIOMETRIC_ENROLLED_KEY  = 'dwes-biometric-enrolled';
export const BIOMETRIC_DISMISSED_KEY = 'dwes-biometric-enroll-dismissed'; // suffixed with userId

// ── Capability + enrolment state ─────────────────────────────────────────────

/**
 * Device/browser biometric capability, expressed as an explicit state so the UI
 * never claims fingerprint support just because a sensor exists. Capability is the
 * real WebAuthn *platform authenticator* result inside a secure context; enrolment
 * is tracked separately (backend credentials + this-device flag).
 *
 * - `loading`        — capability probe still running
 * - `no-context`     — not HTTPS / wrong hostname (secure-context requirement unmet)
 * - `unsupported`    — secure context, but no platform authenticator on this device
 * - `error`          — the capability probe itself threw (check failed)
 * - `ready`          — platform authenticator available (enrol / sign-in allowed)
 */
export type BiometricStatus = 'loading' | 'no-context' | 'unsupported' | 'error' | 'ready';

export function useBiometricAvailable() {
  const [available, setAvailable] = useState(false);
  const [checking, setChecking]   = useState(true);
  const [failed,   setFailed]     = useState(false);
  const context = useMemo(() => assessWebAuthnContext(), []);

  useEffect(() => {
    if (!context.supported) {
      setAvailable(false);
      setFailed(false);
      setChecking(false);
      return;
    }

    let cancelled = false;
    setChecking(true);
    setFailed(false);
    platformAuthenticatorIsAvailable()
      .then(ok => { if (!cancelled) setAvailable(ok); })
      .catch(() => { if (!cancelled) { setAvailable(false); setFailed(true); } })
      .finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, [context.supported]);

  const isEnrolled = available && localStorage.getItem(BIOMETRIC_ENROLLED_KEY) === 'true';

  const status: BiometricStatus =
      checking            ? 'loading'
    : !context.supported  ? 'no-context'
    : failed              ? 'error'
    : available           ? 'ready'
    :                       'unsupported';

  return {
    available,
    checking,
    failed,
    status,
    isEnrolled,
    contextSupported: context.supported,
    contextMessage: context.message,
    suggestedUrl: context.suggestedUrl,
  };
}

// ── Enrolment flow (call from a protected page, after password login) ─────────

export function useEnrollBiometric() {
  const [enrolling, setEnrolling] = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const token = useAuthStore(s => s.token);

  const enroll = useCallback(async (deviceLabel?: string): Promise<boolean> => {
    const ctx = assessWebAuthnContext();
    if (!ctx.supported) {
      setError(ctx.message ?? 'Fingerprint is not available on this page.');
      return false;
    }

    if (!token && !localStorage.getItem('dwes_token')) {
      setError('You must be signed in to enable fingerprint sign-in.');
      return false;
    }

    setEnrolling(true);
    setError(null);
    try {
      const opts       = await webAuthnApi.registerOptions();
      const credential = await startRegistration({ optionsJSON: opts });
      await webAuthnApi.registerVerify(credential, deviceLabel);
      localStorage.setItem(BIOMETRIC_ENROLLED_KEY, 'true');
      return true;
    } catch (e: unknown) {
      setError(friendlyWebAuthnError(e));
      return false;
    } finally {
      setEnrolling(false);
    }
  }, [token]);

  return { enroll, enrolling, error, clearError: () => setError(null) };
}

// ── Biometric login flow ──────────────────────────────────────────────────────

export function useBiometricLogin() {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const navigate              = useNavigate();

  const loginWithBiometric = useCallback(
    async (username?: string, returnToAfterLogin?: string) => {
      const ctx = assessWebAuthnContext();
      if (!ctx.supported) {
        setError(ctx.message ?? 'Fingerprint is not available on this page.');
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const { sessionId, options } = await webAuthnApi.loginOptions(username);
        const credential             = await startAuthentication({ optionsJSON: options });
        const data                   = await webAuthnApi.loginVerify(sessionId, credential);

        // Mirror exactly what useAuthStore.login() does on success
        localStorage.setItem('dwes_token', data.access_token);
        localStorage.setItem('dwes_user',  JSON.stringify(data.user));
        useAuthStore.setState({
          user:      data.user,
          token:     data.access_token,
          isLoading: false,
          error:     null,
        });

        const dest = postLoginDestination(
          returnToAfterLogin,
          ROLE_ROUTES[data.user.role as UserRole] ?? '/',
        );
        navigate(dest, { replace: true });
      } catch (e: unknown) {
        const msg =
          (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '';

        if (
          msg.includes('not enrolled') ||
          (e instanceof Error && e.name === 'NotAllowedError')
        ) {
          localStorage.removeItem(BIOMETRIC_ENROLLED_KEY);
          setError('not-enrolled');
        } else if (e instanceof Error && e.name === 'AbortError') {
          setError(null);
        } else {
          setError(friendlyWebAuthnError(e));
        }
      } finally {
        setLoading(false);
      }
    },
    [navigate],
  );

  return { loginWithBiometric, loading, error, clearError: () => setError(null) };
}
