# OAuth2 PKCE Authorization Server

A full-stack OAuth 2.0 Authorization Server with **PKCE** (Proof Key for Code Exchange) and **OpenID Connect** support, built with Node.js/Express on the backend and Next.js 14 on the frontend.

---

## Overview

This project implements a **self-hosted OAuth 2.0 Authorization Server** — meaning _your_ backend issues and validates tokens, rather than delegating to a third-party like Google or Auth0. The PKCE extension hardens the authorization code flow against interception attacks, making it safe for public clients (browser apps) without client secrets.

```
┌─────────────────────┐        ┌──────────────────────┐        ┌─────────────────┐
│   Next.js Frontend  │◄──────►│  Express OAuth Server │◄──────►│   PostgreSQL    │
│   (Next Auth v5)    │  HTTP  │    (Port 4000)        │        │   + Redis       │
│   (Port 3000)       │        │                       │        └─────────────────┘
└─────────────────────┘        └──────────────────────┘
```

---

## PKCE Flow

```
1.  Browser                 → GET /oauth/authorize
                              ?response_type=code
                              &code_challenge=BASE64URL(SHA256(verifier))
                              &code_challenge_method=S256
                              &client_id=...
                              &redirect_uri=...

2.  Backend                 → Validates request, stores in Redis (10 min)
                            → 302 Redirect to /auth/consent?request_id=<uuid>

3.  Frontend (consent page) → User authenticates / grants consent
                            → Calls backend to issue authorization code

4.  Frontend                → POST /oauth/token
                              grant_type=authorization_code
                              &code=<auth_code>
                              &code_verifier=<original_random_string>

5.  Backend                 → SHA256(code_verifier) must equal stored code_challenge
                            → Issues: access_token (JWT/RS256) + refresh_token + id_token

6.  Frontend (NextAuth)     → Stores tokens in encrypted JWT session cookie
                            → Automatically refreshes access token before expiry
```

> **Only S256 is accepted** — plain-text code challenges are rejected.

---

## Project Structure

```
outh2-pkce/
├── backend/                  # Express OAuth 2.0 Authorization Server
│   ├── src/
│   │   ├── app.ts            # Express app (middleware, routes, rate limiting)
│   │   ├── config/
│   │   │   ├── auth.ts       # OAuth config + PKCE helper functions
│   │   │   ├── database.ts   # Prisma client (PostgreSQL via pg adapter)
│   │   │   └── redis.ts      # ioredis singleton
│   │   ├── routes/
│   │   │   ├── auth.routes.ts    # /oauth/* endpoints
│   │   │   ├── api.routes.ts     # /api/* protected endpoints
│   │   │   └── client.routes.ts  # OAuth client registration
│   │   ├── services/
│   │   │   └── token.service.ts  # Token lifecycle management
│   │   └── middleware/
│   │       ├── authenticate.ts   # JWT auth + scope/role guards
│   │       └── errorHandler.ts   # Global error handler
│   ├── prisma/
│   │   └── schema.prisma     # User, OAuthClient, AuthorizationCode models
│   └── .env.example
│
└── frontend/                 # Next.js 14 App Router client
    └── src/
        ├── app/
        │   ├── auth/         # Sign-in / error pages
        │   └── dashboard/    # Protected pages
        ├── components/auth/
        │   └── AuthProvider.tsx   # SessionProvider wrapper + token sync
        ├── hooks/
        │   └── useAuth.ts    # Session state + redirect hook
        ├── lib/
        │   ├── auth.ts       # NextAuth v5 config (custom OAuth + credentials)
        │   └── api-client.ts # Typed HTTP client (auto-attaches Bearer token)
        └── middleware.ts     # Route protection + RBAC
```

---

## Backend

### Tech Stack

| Package | Purpose |
|---|---|
| Express 5 | HTTP server |
| Prisma 7 + `@prisma/adapter-pg` | ORM (PostgreSQL, native pg driver) |
| ioredis | Redis client |
| jsonwebtoken | JWT signing / verification |
| bcrypt | Password hashing |
| helmet | HTTP security headers |
| express-rate-limit | Rate limiting |
| express-validator | Input validation |
| TypeScript 6 + tsx | Type-safe development |

### API Endpoints

#### OAuth Endpoints (`/oauth/*`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/oauth/authorize` | — | Start PKCE authorization flow |
| `POST` | `/oauth/token` | — | Exchange code or refresh token |
| `GET` | `/oauth/userinfo` | Bearer token | Return authenticated user's profile |
| `GET` | `/oauth/.well-known/openid-configuration` | — | OIDC discovery document |
| `GET` | `/oauth/.well-known/jwks.json` | — | Public keys for token verification |

**`POST /oauth/token` — Grant Types**

```jsonc
// authorization_code
{
  "grant_type": "authorization_code",
  "code": "<auth_code>",
  "code_verifier": "<pkce_verifier>",
  "client_id": "<client_id>",
  "redirect_uri": "<redirect_uri>"
}

// refresh_token
{
  "grant_type": "refresh_token",
  "refresh_token": "<refresh_token>"
}
```

#### Protected API Endpoints (`/api/*`)

| Method | Path | Required Scope / Role | Description |
|--------|------|-----------------------|-------------|
| `GET` | `/api/health` | — | Health check |
| `GET` | `/api/profile` | `read` scope | Get user profile |
| `PUT` | `/api/profile` | `write` scope | Update user profile |
| `GET` | `/api/admin/users` | `admin` role | List all users |

#### Client Registration (`/client/register`)

```bash
curl -X POST http://localhost:4000/client/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Next.js App",
    "redirectUris": ["http://localhost:3000/api/auth/callback/custom-oauth"],
    "grants": ["authorization_code", "refresh_token"],
    "scopes": ["openid", "profile", "email", "read", "write"]
  }'
```

Response includes `clientId` and `clientSecret` — **the secret is shown only once**.

### Token Architecture

| Token | Storage | Signing | Expiry |
|-------|---------|---------|--------|
| Authorization Code | Redis (`auth_code:<code>`) | — | 10 minutes |
| Access Token | Stateless JWT | RS256 (RSA key pair) | 1 hour |
| Refresh Token | Redis (`refresh_token:<token>`) | HS256 | 30 days |
| ID Token | Stateless JWT | RS256 | 1 hour |

Security properties:
- **Replay protection**: Authorization codes are marked `used: true`; if reused, _all_ tokens for that user are immediately revoked.
- **Refresh token rotation**: Every refresh issues a new refresh token and deletes the old one.
- **Timing-safe comparison**: PKCE challenge verification uses `crypto.timingSafeEqual`.

### Database Schema (Prisma / PostgreSQL)

```prisma
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String?
  password      String?   // bcrypt hashed
  picture       String?
  emailVerified Boolean   @default(false)
  roles         String[]  @default(["user"])
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}

model OAuthClient {
  id           String   @id @default(cuid())
  clientId     String   @unique
  clientSecret String
  name         String
  redirectUris String[]
  grants       String[]
  scopes       String[]
  createdAt    DateTime @default(now())
}

model AuthorizationCode {
  id                  String   @id @default(cuid())
  code                String   @unique
  clientId            String
  userId              String
  redirectUri         String
  codeChallenge       String?
  codeChallengeMethod String?
  scope               String
  expiresAt           DateTime
  used                Boolean  @default(false)
  createdAt           DateTime @default(now())
}
```

### Rate Limiting

| Scope | Window | Max Requests |
|-------|--------|-------------|
| Global | 15 min | 100 |
| `/oauth/*` | 15 min | 20 |

---

## Frontend

### Tech Stack

| Package | Purpose |
|---|---|
| Next.js 14 (App Router) | React framework |
| NextAuth v5 (beta) | Session management |
| TypeScript 5 | Type safety |
| Tailwind CSS 3 | Styling |

### Authentication Providers

The frontend supports **three** sign-in methods, all configured in `src/lib/auth.ts`:

1. **Custom OAuth (this backend)** — Full PKCE flow via the Express server
2. **Google OAuth** — PKCE enabled by default in NextAuth v5
3. **GitHub OAuth** — PKCE enabled by default in NextAuth v5
4. **Credentials** — Email/password via `POST /auth/login` on the Express backend

### Key Frontend Modules

**`src/lib/auth.ts`** — NextAuth configuration
- Registers the custom OAuth provider pointing to the Express backend
- JWT callback stores `accessToken`, `refreshToken`, and `accessTokenExpires`
- Automatically calls `POST /oauth/refresh` when the access token expires
- On `RefreshAccessTokenError`, sets an error flag that triggers re-login

**`src/lib/api-client.ts`** — Typed HTTP client
- Singleton `ApiClient` class wrapping `fetch`
- Auto-attaches `Authorization: Bearer <token>` header
- Redirects to `/auth/signin` on 401 responses
- Exposes typed `get`, `post`, `put`, `delete` methods

**`src/components/auth/AuthProvider.tsx`** — Session bridge
- Wraps the app in `<SessionProvider>`
- Syncs the NextAuth session's `accessToken` into `apiClient` via a `useEffect`
- Any component consuming `apiClient` automatically uses the current token

**`src/hooks/useAuth.ts`** — Auth state hook
- Wraps `useSession`
- Redirects unauthenticated users to `/auth/signin` when `requireAuth = true`
- Returns `{ session, isLoading, isAuthenticated, user }`

**`src/middleware.ts`** — Route protection (Edge runtime)
- Protects `/dashboard/*`, `/profile/*`, `/admin/*`
- Redirects to `/auth/signin` on `RefreshAccessTokenError` and clears the stale session cookie
- Blocks `/admin/*` for non-admin roles → `/unauthorized`

### Protected Routes

```
/dashboard/*   → Requires valid session
/profile/*     → Requires valid session
/admin/*       → Requires valid session + role === "admin"
```

---

## Setup & Installation

### Prerequisites

- Node.js ≥ 20
- PostgreSQL instance
- Redis instance
- An RSA key pair (for JWT RS256 signing)

### 1. Generate RSA Keys

```bash
# Generate private key
openssl genrsa -out private.pem 2048

# Extract public key
openssl rsa -in private.pem -pubout -out public.pem

# Format for .env (replace newlines with \n)
awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' private.pem
awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' public.pem
```

### 2. Backend Setup

```bash
cd backend
cp .env.example .env
# Fill in .env (see Environment Variables section)

npm install

# Generate Prisma client
npx prisma generate

# Apply database migrations
npx prisma migrate dev

# Start development server (hot reload)
npm run dev
```

### 3. Register Your Frontend as an OAuth Client

```bash
curl -X POST http://localhost:4000/client/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Frontend",
    "redirectUris": ["http://localhost:3000/api/auth/callback/custom-oauth"],
    "grants": ["authorization_code", "refresh_token"],
    "scopes": ["openid", "profile", "email", "read", "write"]
  }'
```

Copy the returned `clientId` and `clientSecret` into the frontend `.env.local`.

### 4. Frontend Setup

```bash
cd frontend
# Copy and edit environment file
cp .env.local.example .env.local   # or create manually (see below)

npm install
npm run dev
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Server port | `4000` |
| `FRONTEND_URL` | Allowed CORS origin | `http://localhost:3000` |
| `OAUTH_ISSUER` | Token issuer URL | `http://localhost:4000` |
| `JWT_SECRET` | HS256 secret for refresh tokens | `a-long-random-secret` |
| `JWT_PRIVATE_KEY` | RSA private key (PEM, `\n`-escaped) | `-----BEGIN RSA PRIVATE KEY-----\n...` |
| `JWT_PUBLIC_KEY` | RSA public key (PEM, `\n`-escaped) | `-----BEGIN PUBLIC KEY-----\n...` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/db` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |

### Frontend (`frontend/.env.local`)

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXTAUTH_URL` | App base URL | `http://localhost:3000` |
| `NEXTAUTH_SECRET` | NextAuth session encryption key | `a-random-secret` |
| `OAUTH_ISSUER` | Points to backend OIDC issuer | `http://localhost:4000` |
| `OAUTH_CLIENT_ID` | Client ID from registration step | `abc123...` |
| `OAUTH_CLIENT_SECRET` | Client secret from registration step | `xyz789...` |
| `NEXT_PUBLIC_API_URL` | Public API base URL (client-side) | `http://localhost:4000` |
| `BACKEND_URL` | Server-side backend URL | `http://localhost:4000` |

---

## Development Commands

### Backend

```bash
npm run dev      # Start with tsx watch (hot reload)
npm run devtsx   # Start with tsx (no watch)
npm run build    # TypeScript compile → dist/
npm start        # Run compiled output

# Prisma
npx prisma generate       # Regenerate client after schema changes
npx prisma migrate dev    # Create + apply a new migration
npx prisma db pull        # Introspect existing DB into schema
npx prisma studio         # Open Prisma Studio (GUI)
```

### Frontend

```bash
npm run dev      # Start Next.js dev server (port 3000)
npm run build    # Production build
npm start        # Serve production build
```

---

## Security Notes

- **PKCE is mandatory** — the server rejects any authorization request without a `code_challenge`.
- **Only S256** is accepted — the plain challenge method is not supported.
- **Authorization codes are single-use** — reuse triggers automatic revocation of all user tokens (replay attack mitigation).
- **Refresh token rotation** — every `/oauth/token` refresh call invalidates the previous refresh token.
- **RS256 asymmetric signing** — access and ID tokens are signed with a private RSA key; any service can verify them with only the public key (available via `/oauth/.well-known/jwks.json`).
- **Helmet** sets security-relevant HTTP response headers.
- **Rate limiting** is applied globally (100 req/15 min) and more strictly on OAuth endpoints (20 req/15 min).

---

## References

- [RFC 7636 — PKCE](https://datatracker.ietf.org/doc/html/rfc7636)
- [RFC 6749 — OAuth 2.0](https://datatracker.ietf.org/doc/html/rfc6749)
- [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html)
- [NextAuth.js v5 Docs](https://authjs.dev)
- [Prisma Docs](https://www.prisma.io/docs)
