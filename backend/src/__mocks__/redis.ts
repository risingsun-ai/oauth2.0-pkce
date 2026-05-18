// backend/src/__mocks__/redis.ts

const mockStore: Record<string, string> = {};

export const redis = {
  get: jest.fn(async (key: string) => mockStore[key] ?? null),
  setex: jest.fn(async (key: string, _ttl: number, value: string) => {
    mockStore[key] = value;
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
};
