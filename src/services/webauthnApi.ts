import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';
import api from './api';
import type { AuthUser } from '../types';

export interface CredentialInfo {
  id: string;
  deviceLabel: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface BiometricStatus {
  enrolled: boolean;
  count: number;
  credentials: CredentialInfo[];
}

export interface LoginVerifyResponse {
  access_token: string;
  user: AuthUser;
}

export const webAuthnApi = {
  registerOptions: () =>
    api
      .post<PublicKeyCredentialCreationOptionsJSON>('/auth/webauthn/register/options')
      .then(r => r.data),

  registerVerify: (credential: RegistrationResponseJSON, deviceLabel?: string) =>
    api
      .post<{ success: boolean }>('/auth/webauthn/register/verify', {
        credential,
        device_label: deviceLabel,
      })
      .then(r => r.data),

  loginOptions: (username?: string) =>
    api
      .post<{ sessionId: string; options: PublicKeyCredentialRequestOptionsJSON }>(
        '/auth/webauthn/login/options',
        { username },
      )
      .then(r => r.data),

  loginVerify: (sessionId: string, credential: AuthenticationResponseJSON) =>
    api
      .post<LoginVerifyResponse>('/auth/webauthn/login/verify', { sessionId, credential })
      .then(r => r.data),

  status: () =>
    api.get<BiometricStatus>('/auth/webauthn/status').then(r => r.data),

  config: () =>
    api.get<{ rpId: string; rpName: string; origins: string[] }>('/auth/webauthn/config').then(r => r.data),

  removeCredential: (id: string) =>
    api
      .delete<{ success: boolean }>(`/auth/webauthn/credentials/${encodeURIComponent(id)}`)
      .then(r => r.data),
};
