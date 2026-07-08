/**
 * Shared LAN hostname for DWES HTTPS + WebAuthn (must match RP_ID in backend/.env).
 * Override: DWES_HOSTNAME=mycompany.local
 */
export const DWES_HOSTNAME = process.env.DWES_HOSTNAME || 'dwes.local';
