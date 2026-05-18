// backend/src/__mocks__/auth.ts

export const oauthConfig = {
  issuer: 'http://localhost',
  accessTokenExpiry: 3600,
  refreshTokenExpiry: 30 * 24 * 3600,
  authorizationCodeExpiry: 600,
  pkce: {
    required: true,
    methods: ['S256'],
  },
  scopes: ['openid', 'profile', 'email', 'read', 'write'],
  jwt: {
    secret: 'test-secret',
    algorithm: 'RS256' as const,
    publicKey: 'test-public-key',
    privateKey: 'test-private-key',
  },
};

export function generateCodeVerifier(): string {
  return 'test-verifier';
}

export function generateCodeChallenge(verifier: string): string {
  return 'test-challenge';
}

export function verifyCodeChallenge(verifier: string, challenge: string): boolean {
  return verifier === challenge;
}
