// backend/src/test/helpers/route.test-utils.ts

/**
 * Helper utilities for testing OAuth route handlers.
 * Provides functions to generate mock users, clients, authorization codes, and JWTs.
 */
import crypto from 'crypto';
import { TokenService, TokenPayload } from '../../../src/services/token.service.js';
import { oauthConfig } from '../../../src/config/auth.js';

export const mockUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  name: 'Test User',
  roles: ['user'],
};

export const mockClient = {
  clientId: 'client-123',
  redirectUris: ['http://localhost/callback'],
  // other client fields can be added as needed
};

/** Generate a PKCE code verifier and its S256 challenge */
export function generatePkcePair() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

/** Create a mock authorization code entry stored in Redis */
export async function storeMockAuthCode({
  code,
  clientId = mockClient.clientId,
  userId = mockUser.id,
  redirectUri = mockClient.redirectUris[0],
  codeChallenge,
  codeChallengeMethod = 'S256',
  scope = 'openid',
}: {
  code: string;
  clientId?: string;
  userId?: string;
  redirectUri?: string;
  codeChallenge: string;
  codeChallengeMethod?: string;
  scope?: string;
}) {
  // Use the same storage format as TokenService.generateAuthorizationCode
  const redis = (await import('../../../src/config/redis.js')).redis;
  await redis.setex(
    `auth_code:${code}`,
    oauthConfig.accessTokenExpiry,
    JSON.stringify({
      clientId,
      userId,
      redirectUri,
      codeChallenge,
      codeChallengeMethod,
      scope,
      used: false,
    })
  );
}

/** Generate a signed access token for a mock user */
export function generateAccessToken(payloadOverrides: Partial<TokenPayload> = {}): string {
  const payload: TokenPayload = {
    sub: mockUser.id,
    email: mockUser.email,
    name: mockUser.name,
    roles: mockUser.roles,
    scope: 'openid',
    audience: mockClient.clientId,
    ...payloadOverrides,
  };
  return TokenService.generateAccessToken(payload, mockClient.clientId);
}

/** Generate a signed refresh token for a mock user */
export function generateRefreshToken(): string {
  return TokenService.refreshAccessToken(mockUser.id);
}
