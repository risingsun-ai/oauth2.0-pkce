# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Structure

**Backend**: `/backend` (Node.js/Express OAuth2-PKCE server)

### Key Directories
- `src/` - Application source code
- `src/config/` - Configuration (auth, database, redis)
- `src/routes/` - Express route handlers
- `src/middleware/` - Express middleware
- `src/services/` - Business logic services
- `src/generated/prisma/` - Generated Prisma client
- `prisma/` - Prisma schema and migrations

## Commands

```bash
# Development
npm run dev      # Start with ts-node-dev (hot reload)
npm run devtsx   # Start with tsx
npm run build    # TypeScript compile to dist/
npm start        # Run compiled JS from dist/

# Database
npx prisma generate    # Generate Prisma client
npx prisma db pull     # Pull schema from database
npx prisma migrate dev # Create and apply migration
```

## Architecture

This is an **OAuth2 Authorization Server** implementing **PKCE flow** with OpenID Connect support.

### Data Flow

```
1. Client → /oauth/authorize (with PKCE code_challenge)
2. Server stores request in Redis → redirects to frontend consent
3. Frontend handles consent → calls /oauth/token with auth code + code_verifier
4. Server validates PKCE, issues tokens
```

### Core Components

| File | Purpose |
|------|---------|
| `src/config/auth.ts` | OAuth config, PKCE helpers |
| `src/config/database.ts` | Prisma client with PG adapter |
| `src/config/redis.ts` | Redis client singleton |
| `src/services/token.service.ts` | Token generation/exchange logic |
| `src/routes/oauth.routes.ts` | OAuth endpoints (authorize, token, userinfo) |
| `src/routes/account.mgt.routes.ts` | User Account Managment endpoints (verify-email, forgot-password) |
| `src/routes/client.routes.ts` | OAuth client registration |
| `src/routes/api.routes.ts` | Protected API endpoints |
| `src/middleware/authenticate.ts` | JWT authentication, scope/role authorization |
| `src/middleware/errorHandler.ts` | Global error handling |

### Token Storage

- **Authorization codes**: Redis, 10-minute expiry
- **Refresh tokens**: Redis, 30-day expiry
- **Access tokens**: JWT (stateless)

### Required Environment Variables

- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `JWT_SECRET` - Secret for refresh token signing
- `JWT_PUBLIC_KEY` - RSA public key for access tokens
- `JWT_PRIVATE_KEY` - RSA private key for access tokens
- `OAUTH_ISSUER` - Token issuer URL

### API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/oauth/authorize` | Authorization endpoint |
| POST | `/oauth/token` | Token exchange |
| GET | `/oauth/userinfo` | User info (requires Bearer token) |
| GET | `/oauth/.well-known/openid-configuration` | OIDC discovery |
| GET | `/oauth/.well-known/jwks.json` | Public keys |
| POST | `/client/register` | Register OAuth client |
| GET | `/api/health` | Health check (public) |
| GET/POST | `/api/profile` | User profile (requires auth) |
| GET | `/api/admin/users` | Admin users list (requires admin role) |

## Database Schema

**Prisma models**: `User`, `OAuthClient`, `AuthorizationCode`

- `User`: id, email, name, password (hashed), roles, emailVerified
- `OAuthClient`: clientId, clientSecret, name, redirectUris, grants, scopes
- `AuthorizationCode`: code, clientId, userId, redirectUri, codeChallenge, scope, used flag

## Notes

- This is an OAuth2 **authorization server** - clients register via `/api/register`
- PKCE is **required** for all authorization requests
- Uses Redis for stateful tokens (authorization codes, refresh tokens)
- Access tokens are JWT with RS256 signing
