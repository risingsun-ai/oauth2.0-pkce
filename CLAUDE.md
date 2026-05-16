# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a full-stack **OAuth 2.0 Authorization Server** with **PKCE** (Proof Key for Code Exchange) and **OpenID Connect** support. The backend issues and validates tokens; the frontend is a Next.js 14 client using NextAuth v5.

## Project Structure

```
outh2-pkce/
├── backend/           # Express OAuth 2.0 Authorization Server (port 4000)
└── frontend/          # Next.js 14 App Router client (port 3000)
```

## Commands

### Backend
```bash
cd backend
npm run dev      # Start with tsx watch (hot reload)
npm run build    # TypeScript compile → dist/
npm start        # Run compiled output

# Prisma
npx prisma generate    # Generate Prisma client after schema changes
npx prisma migrate dev # Create and apply migration
npx prisma studio      # Open database GUI
```

### Frontend
```bash
cd frontend
npm run dev      # Start Next.js dev server
npm run build    # Production build
npm start        # Serve production build
```

## Architecture

### Backend (Express OAuth Server)

Core components in `backend/src/`:
- `config/auth.ts` — OAuth config, PKCE helpers
- `config/database.ts` — Prisma client with PostgreSQL adapter
- `config/redis.ts` — Redis client singleton
- `services/token.service.ts` — Token generation/exchange logic
- `routes/oauth.routes.ts` — OAuth endpoints (`/auth/*`)
- `routes/account.mgt.routes.ts` — Accounts Managment endpoints (`/account/*`)
- `routes/client.routes.ts` — OAuth client registration
- `routes/api.routes.ts` — Protected API endpoints (`/api/*`)
- `middleware/authenticate.ts` — JWT auth, scope/role guards
- `middleware/errorHandler.ts` — Global error handling

**Token Architecture:**
- Authorization codes: Redis, 10-min expiry, single-use
- Access tokens: Stateless JWT (RS256), 1-hour expiry
- Refresh tokens: Redis (HS256), 30-day expiry, rotated on use

**Key API Endpoints:**
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/oauth/authorize` | Start PKCE authorization flow |
| POST | `/oauth/token` | Exchange code or refresh token |
| GET | `/oauth/userinfo` | User profile (Bearer token required) |
| GET | `/oauth/.well-known/openid-configuration` | OIDC discovery |
| GET | `/oauth/.well-known/jwks.json` | Public keys |
| POST | `/client/register` | Register OAuth client |

### Frontend (Next.js + NextAuth v5)

Key modules in `frontend/src/`:
- `lib/auth.ts` — NextAuth v5 configuration (custom OAuth + credentials providers)
- `lib/api-client.ts` — Typed HTTP client, auto-attaches Bearer token
- `components/auth/AuthProvider.tsx` — SessionProvider wrapper
- `hooks/useAuth.ts` — Auth state hook with redirect logic
- `middleware.ts` — Route protection (Edge runtime)

**Protected Routes:**
- `/dashboard/*`, `/profile/*` — Requires valid session
- `/admin/*` — Requires valid session + admin role

## Database

PostgreSQL with Prisma ORM. Models: `User`, `OAuthClient`, `AuthorizationCode`.

## Required Services

- PostgreSQL (connection via `DATABASE_URL`)
- Redis (connection via `REDIS_URL`)
- RSA key pair for JWT RS256 signing

## Security Notes

- PKCE is **mandatory** — only S256 method accepted
- Authorization codes are single-use (reuse triggers token revocation)
- Refresh tokens are rotated on each use
- Rate limiting: global 100 req/15 min, OAuth endpoints 20 req/15 min