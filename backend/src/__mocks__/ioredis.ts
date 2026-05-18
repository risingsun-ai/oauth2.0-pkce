// backend/src/__mocks__/ioredis.ts

const mockStore: Record<string, { value: string; ttl?: number }> = {};

const mockRedis = {
  get: jest.fn(async (key: string) => mockStore[key]?.value ?? null),
  setex: jest.fn(async (key: string, ttl: number, value: string) => {
    mockStore[key] = { value, ttl };
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
};

function Redis() {
  return mockRedis;
}

Redis.prototype = mockRedis;

export { Redis };
export default Redis;
