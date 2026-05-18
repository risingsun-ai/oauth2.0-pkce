// backend/src/__mocks__/prisma.ts

export const PrismaClient = jest.fn(() => ({
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
}));
