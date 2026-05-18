// backend/src/__tests__/route/oauth.routes.test.ts

import request from 'supertest';
import express from 'express';
import oauthRouter from '../../routes/oauth.routes.js';
import { generatePkcePair, mockUser, mockClient, generateAccessToken } from '../../test/helpers/route.test-utils.js';

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

    it('should reject non-code response_type', async () => {
      const res = await request(app)
        .get('/auth/authorize')
        .query({ response_type: 'token', client_id: 'client-123', redirect_uri: 'http://localhost/callback' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('unsupported_response_type');
    });

    it('should reject missing client_id or redirect_uri', async () => {
      const res = await request(app)
        .get('/auth/authorize')
        .query({ response_type: 'code' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_request');
    });

    it('should reject when PKCE code_challenge is missing', async () => {
      const res = await request(app)
        .get('/auth/authorize')
        .query({
          response_type: 'code',
          client_id: 'client-123',
          redirect_uri: 'http://localhost/callback',
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_request');
      expect(res.body.error_description).toContain('PKCE');
    });

    it('should reject non-S256 code_challenge_method', async () => {
      const res = await request(app)
        .get('/auth/authorize')
        .query({
          response_type: 'code',
          client_id: 'client-123',
          redirect_uri: 'http://localhost/callback',
          code_challenge: 'challenge123',
          code_challenge_method: 'plain',
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_request');
      expect(res.body.error_description).toContain('S256');
    });

    it('should reject unknown client_id', async () => {
      const { challenge } = generatePkcePair();
      const res = await request(app)
        .get('/auth/authorize')
        .query({
          response_type: 'code',
          client_id: 'unknown-client',
          redirect_uri: 'http://localhost/callback',
          code_challenge: challenge,
          code_challenge_method: 'S256',
        });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('invalid_client');
    });

    it('should reject invalid redirect_uri', async () => {
      const { challenge } = generatePkcePair();
      const res = await request(app)
        .get('/auth/authorize')
        .query({
          response_type: 'code',
          client_id: 'client-123',
          redirect_uri: 'http://evil.com/callback',
          code_challenge: challenge,
          code_challenge_method: 'S256',
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_redirect_uri');
    });

    it('should redirect to consent page on valid request', async () => {
      const { challenge } = generatePkcePair();
      const res = await request(app)
        .get('/auth/authorize')
        .query({
          response_type: 'code',
          client_id: 'client-123',
          redirect_uri: 'http://localhost/callback',
          code_challenge: challenge,
          code_challenge_method: 'S256',
          scope: 'openid',
        });
      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/\/auth\/consent\?request_id=/);
    });
  });

  describe('POST /auth/token', () => {
    const tokenEndpoint = '/auth/token';

    it('should reject unsupported grant_type', async () => {
      const res = await request(app)
        .post(tokenEndpoint)
        .send({ grant_type: 'client_credentials' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('unsupported_grant_type');
    });

    it('should reject missing code_verifier', async () => {
      const res = await request(app)
        .post(tokenEndpoint)
        .send({
          grant_type: 'authorization_code',
          code: 'some-code',
          redirect_uri: 'http://localhost/callback',
          client_id: 'client-123',
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_request');
    });

    it('should reject invalid authorization code', async () => {
      const res = await request(app)
        .post(tokenEndpoint)
        .send({
          grant_type: 'authorization_code',
          code: 'invalid-code',
          redirect_uri: 'http://localhost/callback',
          client_id: 'client-123',
          code_verifier: 'verifier123',
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_grant');
    });
  });

  describe('GET /auth/userinfo', () => {
    it('should reject missing authorization header', async () => {
      const res = await request(app).get('/auth/userinfo');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('unauthorized');
    });

    it('should reject malformed authorization header', async () => {
      const res = await request(app)
        .get('/auth/userinfo')
        .set('Authorization', 'Basic abc123');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('unauthorized');
    });

    it('should reject invalid token', async () => {
      const res = await request(app)
        .get('/auth/userinfo')
        .set('Authorization', 'Bearer invalid-token');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('invalid_token');
    });
  });

  describe('GET /auth/.well-known/openid-configuration', () => {
    it('should return OIDC discovery document', async () => {
      const res = await request(app).get('/auth/.well-known/openid-configuration');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        issuer: expect.any(String),
        authorization_endpoint: expect.stringContaining('/oauth/authorize'),
        token_endpoint: expect.stringContaining('/oauth/token'),
        userinfo_endpoint: expect.stringContaining('/oauth/userinfo'),
        jwks_uri: expect.stringContaining('/.well-known/jwks.json'),
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
      });
    });
  });

  describe('GET /auth/.well-known/jwks.json', () => {
    it('should return JWKS with public key', async () => {
      const res = await request(app).get('/auth/.well-known/jwks.json');
      expect(res.status).toBe(200);
      expect(res.body.keys).toBeInstanceOf(Array);
      expect(res.body.keys.length).toBeGreaterThan(0);
      expect(res.body.keys[0]).toHaveProperty('kty', 'RSA');
      expect(res.body.keys[0]).toHaveProperty('use', 'sig');
      expect(res.body.keys[0]).toHaveProperty('alg', 'RS256');
    });
  });
});
