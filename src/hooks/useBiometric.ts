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
import {
  assessWebAuthnContext,
  friendlyWebAuthnError,
} from '../utils/webauthnSupport';

export const BIOMETRIC_ENROLLED_KEY  = 'dwes-biometric-enrolled';
export const BIOMETRIC_DISMISSED_KEY = 'dwes-biometric-enroll-dismissed'; // suffixed with userId

// ── Capability + enrolment state ─────────────────────────────────────────────

export function useBiometricAvailable() {
  const [available, setAvailable] = useState(false);
  const [checking, setChecking]   = useState(true);
  const context = useMemo(() => assessWebAuthnContext(), []);

  useEffect(() => {
    if (!context.supported) {
      setAvailable(false);
      setChecking(false);
      return;
    }

    platformAuthenticatorIsAvailable()
      .then(ok => setAvailable(ok))
      .catch(() => setAvailable(false))
      .finally(() => setChecking(false));
  }, [context.supported]);

  const isEnrolled = available && localStorage.getItem(BIOMETRIC_ENROLLED_KEY) === 'true';
  return {
    available,
    checking,
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
    async (username?: string) => {
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

        navigate(ROLE_ROUTES[data.user.role as UserRole] ?? '/', { replace: true });
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
