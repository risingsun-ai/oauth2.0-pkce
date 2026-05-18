// backend/src/__tests__/route/oauth.routes.test.ts

import request from 'supertest';
import express from 'express';
import oauthRouter from '../../src/routes/oauth.routes.js';
import { generatePkcePair, mockUser, mockClient, storeMockAuthCode, generateAccessToken } from '../../src/test/helpers/route.test-utils.js';

// Create an isolated Express app for testing
const app = express();
app.use(express.json());
app.use('/auth', oauthRouter);

describe('OAuth Routes', () => {
  describe('GET /auth/authorize', () => {
    it('should reject missing required query parameters', async () => {
      const res = await request(app).get('/auth/authorize');
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should enforce PKCE requirement and S256 method', async () => {
      const res = await request(app)
        .get('/auth/authorize')
        .query({ response_type: 'code', client_id: mockClient.clientId, redirect_uri: mockClient.redirectUris[0] });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_request');
    });

    it('should successfully create an auth request and redirect', async () => {
      const { verifier, challenge } = generatePkcePair();
      const res = await request(app)
        .get('/auth/authorize')
        .query({
          response_type: 'code',
          client_id: mockClient.clientId,
          redirect_uri: mockClient.redirectUris[0],
          code_challenge: challenge,
          code_challenge_method: 'S256',
          scope: 'openid',
        });
      // Expect a redirect (302) to the frontend consent page
      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/\/auth\/consent\?request_id=/);
    });
  });

  describe('POST /auth/token', () => {
    const tokenEndpoint = '/auth/token';

    it('should reject unsupported grant_type', async () => {
      const res = await request(app).post(tokenEndpoint).send({ grant_type: 'client_credentials' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('unsupported_grant_type');
    });

    it('should exchange authorization code for tokens', async () => {
      const { verifier, challenge } = generatePkcePair();
      const code = 'test-auth-code';
      // Store mock auth code in Redis
      await storeMockAuthCode({ code, codeChallenge: challenge });

      const res = await request(app)
        .post(tokenEndpoint)
        .send({
          grant_type: 'authorization_code',
          code,
          redirect_uri: mockClient.redirectUris[0],
          client_id: mockClient.clientId,
          code_verifier: verifier,
        });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        access_token: expect.any(String),
        refresh_token: expect.any(String),
        id_token: expect.any(String),
        expires_in: expect.any(Number),
      });
    });

    it('should reject reused authorization code', async () => {
      const { verifier, challenge } = generatePkcePair();
      const code = 'reused-code';
      // Store mock auth code and mark as used
      await storeMockAuthCode({ code, codeChallenge: challenge });
      // First exchange (valid)
      await request(app)
        .post(tokenEndpoint)
        .send({
          grant_type: 'authorization_code',
          code,
          redirect_uri: mockClient.redirectUris[0],
          client_id: mockClient.clientId,
          code_verifier: verifier,
        });
      // Second exchange should fail
      const res = await request(app)
        .post(tokenEndpoint)
        .send({
          grant_type: 'authorization_code',
          code,
          redirect_uri: mockClient.redirectUris[0],
          client_id: mockClient.clientId,
          code_verifier: verifier,
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_grant');
    });
  });

  describe('GET /auth/userinfo', () => {
    it('should reject missing Bearer token', async () => {
      const res = await request(app).get('/auth/userinfo');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('unauthorized');
    });

    it('should return user info for a valid access token', async () => {
      const accessToken = generateAccessToken();
      const res = await request(app)
        .get('/auth/userinfo')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        sub: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
        picture: null,
      });
    });
  });
});
