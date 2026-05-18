// backend/src/__mocks__/auth.service.ts

export class AuthService {
  static validateCredentials = jest.fn(async (_email: string, _password: string) => {
    return { id: 'test-user-id', email: 'test@example.com', name: 'Test User', roles: ['user'] };
  });

  static register = jest.fn(async (_data: any) => {
    return { id: 'new-user-id', email: data.email, name: data.name };
  });
}
