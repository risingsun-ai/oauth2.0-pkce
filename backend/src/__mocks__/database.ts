// backend/src/__mocks__/database.ts

export const prisma = {
  user: {
    findUnique: jest.fn(async ({ where }: any) => {
      if (where?.id === 'test-user-id') {
        return { id: 'test-user-id', email: 'test@example.com', name: 'Test User', roles: ['user'], picture: null };
      }
      return null;
    }),
    findMany: jest.fn(async () => []),
    create: jest.fn(async (data: any) => ({ id: 'new-user-id', ...data })),
  },
  oAuthClient: {
    findUnique: jest.fn(async ({ where }: any) => {
      if (where?.clientId === 'client-123') {
        return { clientId: 'client-123', clientSecret: 'secret', redirectUris: ['http://localhost/callback'], grants: ['authorization_code'], scopes: ['openid'] };
      }
      return null;
    }),
  },
  authorizationCode: {
    create: jest.fn(async (data: any) => ({ ...data })),
    update: jest.fn(async () => ({})),
  },
};
