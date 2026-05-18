// backend/src/__mocks__/token.service.ts

import jwt from 'jsonwebtoken';

export interface TokenPayload {
  sub: string;
  email: string;
  name: string;
  roles: string[];
  scope: string;
  audience: string;
}

// Track stored auth codes for PKCE validation
const authCodes: Record<string, any> = {};

export class TokenService {
  static generateAuthorizationCode = jest.fn(async (
    clientId: string,
    userId: string,
    redirectUri: string,
    codeChallenge: string,
    codeChallengeMethod: string,
    scope: string
  ): Promise<string> => {
    const code = 'mock-auth-code-' + Math.random().toString(36).substring(2);
    authCodes[code] = { clientId, userId, redirectUri, codeChallenge, codeChallengeMethod, scope, used: false };
    return code;
  });

  static exchangeCodeForTokens = jest.fn(async (
    code: string,
    codeVerifier: string,
    clientId: string,
    redirectUri: string
  ) => {
    const authData = authCodes[code];
    if (!authData) {
      throw new Error('Invalid or expired authorization code');
    }
    if (authData.used) {
      throw new Error('Authorization code already used');
    }
    // Validate PKCE
    if (authData.codeChallenge && authData.codeChallenge !== codeVerifier) {
      throw new Error('Invalid code verifier');
    }
    if (authData.redirectUri !== redirectUri) {
      throw new Error('Invalid redirect URI');
    }
    authData.used = true;

    const accessToken = jwt.sign(
      { sub: authData.userId, email: 'test@example.com', name: 'Test User', roles: ['user'], scope: authData.scope, audience: clientId },
      'test-private-key',
      { algorithm: 'RS256', expiresIn: 3600 }
    );
    const refreshToken = jwt.sign(
      { sub: authData.userId, type: 'refresh' },
      'test-secret',
      { algorithm: 'HS256', expiresIn: 2592000 }
    );
    const idToken = jwt.sign(
      { sub: authData.userId, email: 'test@example.com', name: 'Test User', email_verified: true },
      'test-private-key',
      { algorithm: 'RS256', expiresIn: 3600, audience: clientId }
    );

    return { accessToken, refreshToken, idToken, expiresIn: 3600 };
  });

  static generateAccessToken = jest.fn((payload: TokenPayload, _clientId?: string): string => {
    return jwt.sign(payload, 'test-private-key', { algorithm: 'RS256', expiresIn: 3600 });
  });

  static generateRefreshToken = jest.fn((_userId: string): string => {
    return jwt.sign({ sub: _userId, type: 'refresh' }, 'test-secret', { algorithm: 'HS256', expiresIn: 2592000 });
  });

  static generateIdToken = jest.fn((payload: TokenPayload): string => {
    return jwt.sign(
      { sub: payload.sub, email: payload.email, name: payload.name, email_verified: true },
      'test-private-key',
      { algorithm: 'RS256', expiresIn: 3600, audience: payload.audience }
    );
  });

  static refreshAccessToken = jest.fn(async (refreshToken: string) => {
    const payload = jwt.verify(refreshToken, 'secret', { algorithms: ['HS256'] }) as any;
    const newAccessToken = jwt.sign(
      { sub: payload.sub, email: 'test@example.com', name: 'Test User', roles: ['user'], scope: 'openid', audience: 'client-123' },
      'test-private-key',
      { algorithm: 'RS256', expiresIn: 3600 }
    );
    const newRefreshToken = jwt.sign({ sub: payload.sub, type: 'refresh' }, 'test-secret', { algorithm: 'HS256', expiresIn: 2592000 });
    return { accessToken: newAccessToken, refreshToken: newRefreshToken, expiresIn: 3600 };
  });

  static revokeAllUserTokens = jest.fn(async (_userId: string): Promise<void> => {});

  static verifyAccessToken = jest.fn((token: string): TokenPayload => {
    return jwt.verify(token, 'test-public-key', { algorithms: ['RS256'] }) as TokenPayload;
  });
}
