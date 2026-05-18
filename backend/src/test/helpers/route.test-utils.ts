// backend/src/test/helpers/route.test-utils.ts

/**
 * Helper utilities for testing OAuth route handlers.
 */
import crypto from 'crypto';
import { TokenService } from '../../services/token.service.js';

export const mockUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  name: 'Test User',
  roles: ['user'],
};

export const mockClient = {
  clientId: 'client-123',
  redirectUris: ['http://localhost/callback'],
};

/** Generate a PKCE code verifier and its S256 challenge */
export function generatePkcePair() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

/** Generate a signed access token for the mock user */
export function generateAccessToken(): string {
  return TokenService.generateAccessToken({
    sub: mockUser.id,
    email: mockUser.email,
    name: mockUser.name,
    roles: mockUser.roles,
    scope: 'openid',
    audience: mockClient.clientId,
  }, mockClient.clientId);
}
