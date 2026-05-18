// backend/jest.setup.ts

// Ensure environment variables are set for tests
process.env.JWT_PRIVATE_KEY = 'test-private-key';
process.env.JWT_PUBLIC_KEY = 'test-public-key';
process.env.JWT_SECRET = 'test-secret';
process.env.OAUTH_ISSUER = 'http://localhost';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
process.env.FRONTEND_URL = 'http://localhost:3000';

// Mock modules that have top-level await (ESM-incompatible with CommonJS transform)
// Use jest.mock with relative paths from the project root
jest.mock('src/services/token.service', () => {
  const jwt = require('jsonwebtoken');
  return {
    TokenService: {
      generateAuthorizationCode: jest.fn(async () => 'mock-code'),
      exchangeCodeForTokens: jest.fn(async () => ({
        accessToken: 'mock-access',
        refreshToken: 'mock-refresh',
        id_token: 'mock-id',
        expiresIn: 3600,
      })),
      generateAccessToken: jest.fn(() => 'mock-access-token'),
      generateRefreshToken: jest.fn(() => 'mock-refresh-token'),
      generateIdToken: jest.fn(() => 'mock-id-token'),
      refreshAccessToken: jest.fn(async () => ({
        accessToken: 'mock-access',
        refreshToken: 'mock-refresh',
        expiresIn: 3600,
      })),
      revokeAllUserTokens: jest.fn(async () => {}),
      verifyAccessToken: jest.fn((token: string) => {
        if (token === 'mock-access-token') {
          return { sub: 'test-user-id', email: 'test@example.com', name: 'Test User', roles: ['user'], scope: 'openid', audience: 'client-123' };
        }
        throw new Error('Invalid token');
      }),
    },
  };
});

jest.mock('src/services/auth.service', () => ({
  AuthService: {
    validateCredentials: jest.fn(async () => null),
    register: jest.fn(async () => null),
  },
}));

jest.mock('src/config/redis', () => {
  const store: Record<string, string> = {};
  return {
    redis: {
      get: jest.fn(async (key: string) => store[key] ?? null),
      setex: jest.fn(async (key: string, _ttl: number, value: string) => { store[key] = value; }),
      del: jest.fn(async (key: string) => { delete store[key]; return 1; }),
      keys: jest.fn(async (pattern: string) => {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        return Object.keys(store).filter((k) => regex.test(k));
      }),
      on: jest.fn(),
    },
  };
});

jest.mock('src/config/database', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where?.id === 'test-user-id') {
          return { id: 'test-user-id', email: 'test@example.com', name: 'Test User', roles: ['user'], picture: null };
        }
        return null;
      }),
    },
    oAuthClient: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where?.clientId === 'client-123') {
          return { clientId: 'client-123', redirectUris: ['http://localhost/callback'] };
        }
        return null;
      }),
    },
  },
}));

jest.mock('src/config/auth', () => ({
  oauthConfig: {
    issuer: 'http://localhost',
    accessTokenExpiry: 3600,
    refreshTokenExpiry: 30 * 24 * 3600,
    authorizationCodeExpiry: 600,
    pkce: { required: true, methods: ['S256'] },
    scopes: ['openid', 'profile', 'email', 'read', 'write'],
    jwt: {
      secret: 'test-secret',
      algorithm: 'RS256',
      publicKey: 'test-public-key',
      privateKey: 'test-private-key',
    },
  },
  generateCodeVerifier: jest.fn(() => 'test-verifier'),
  generateCodeChallenge: jest.fn(() => 'test-challenge'),
  verifyCodeChallenge: jest.fn(() => true),
}));
