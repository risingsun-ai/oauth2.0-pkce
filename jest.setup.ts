// jest.setup.ts

// Mock Redis client to use an in‑memory store
import { Redis } from 'ioredis';

const mockStore: Record<string, { value: string; ttl?: number }> = {};

jest.mock('ioredis', () => {
  const mockRedis = jest.fn().mockImplementation(() => {
    return {
      get: jest.fn(async (key: string) => mockStore[key]?.value ?? null),
      setex: jest.fn(async (key: string, ttl: number, value: string) => {
        mockStore[key] = { value, ttl };
        // Simple TTL handling – clear after ttl seconds (not perfectly accurate for tests)
        setTimeout(() => delete mockStore[key], ttl * 1000);
      }),
      del: jest.fn(async (key: string) => {
        delete mockStore[key];
        return 1;
      }),
      keys: jest.fn(async (pattern: string) => {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        return Object.keys(mockStore).filter((k) => regex.test(k));
      }),
      on: jest.fn(),
    } as unknown as Redis;
  });
  return mockRedis;
});

// Mock Prisma client with minimal behavior for user lookup
import { PrismaClient } from '../../backend/generated/prisma/client.js';

jest.mock('../../backend/generated/prisma/client.js', () => {
  const mockPrisma = {
    user: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where?.id === 'test-user-id') {
          return { id: 'test-user-id', email: 'test@example.com', name: 'Test User', roles: ['user'] };
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
  } as unknown as PrismaClient;
  return { PrismaClient: jest.fn(() => mockPrisma) };
});

// Ensure environment variables are set for tests
process.env.JWT_PRIVATE_KEY = 'test-private-key';
process.env.JWT_PUBLIC_KEY = 'test-public-key';
process.env.JWT_SECRET = 'test-secret';
process.env.OAUTH_ISSUER = 'http://localhost';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
process.env.FRONTEND_URL = 'http://localhost:3000';
