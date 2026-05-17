// backend/src/routes/auth.routes.ts
import { Router, Request, Response } from "express";
import crypto from "crypto";
import bcrypt from "bcrypt";
import rateLimit from "express-rate-limit";
import {
  oauthConfig,
} from "../config/auth.js";
import { TokenService } from "../services/token.service.js";
import { prisma } from "../config/database.js";
import { redis } from "../config/redis.js";
import console from "console";
import { validateForgotPassword, validateLogin, validateResetPassword, validateSignup } from "../middleware/validate.js";
import { authenticate } from "../middleware/authenticate.js";
import { AuthService } from "../services/auth.service.js";

const router = Router();

// Rate limiters
const oauthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 per 15 minutes per IP
  message: {
    error: "rate_limit_exceeded",
    error_description: "Too many requests. Please try again later.",
  },
});

// Rate limiters
const oauthRegisterLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 user registration per hour per IP
  message: {
    error: "rate_limit_exceeded",
    error_description: "Too many registration attempts. Please try again later.",
  },
});

const oauthLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 login attempts per 15 minutes
  message: {
    error: "rate_limit_exceeded",
    error_description: "Too many login attempts. Please try again later.",
  },
});

// Authorization Endpoint
router.get("/authorize", oauthLimiter, async (req: Request, res: Response) => {
  try {
    const {
      response_type,
      client_id,
      redirect_uri,
      scope,
      state,
      code_challenge,
      code_challenge_method,
    } = req.query;
    console.log("oauth query", req.query);

    // Validate required parameters
    if (response_type !== "code") {
      return res.status(400).json({ error: "unsupported_response_type" });
    }

    if (!client_id || !redirect_uri) {
      return res.status(400).json({ error: "invalid_request" });
    }

    // Validate PKCE
    if (oauthConfig.pkce.required && !code_challenge) {
      return res.status(400).json({
        error: "invalid_request",
        error_description: "PKCE code_challenge is required",
      });
    }

    if (code_challenge_method && code_challenge_method !== "S256") {
      return res.status(400).json({
        error: "invalid_request",
        error_description: "Only S256 code_challenge_method is supported",
      });
    }

    // Validate client
    const client = await prisma.oAuthClient.findUnique({
      where: { clientId: client_id as string },
    });

    if (!client) {
      return res.status(401).json({ error: "invalid_client" });
    }

    // Validate redirect URI
    if (!client.redirectUris.includes(redirect_uri as string)) {
      return res.status(400).json({ error: "invalid_redirect_uri" });
    }

    // Store authorization request
    const requestId = crypto.randomUUID();
    await redis.setex(
      `auth_request:${requestId}`,
      600, // 10 minutes
      JSON.stringify({
        clientId: client_id,
        redirectUri: redirect_uri,
        scope: scope || "openid",
        state,
        codeChallenge: code_challenge,
        codeChallengeMethod: code_challenge_method || "S256",
      })
    );

    // Redirect to login page with request ID
    // In production, you'd render a login/consent page
    res.redirect(
      `${process.env.FRONTEND_URL}/auth/consent?request_id=${requestId}`
    );
  } catch (error) {
    console.error("Authorization error:", error);
    res.status(500).json({ error: "server_error" });
  }
});

// Token Endpoint
router.post("/token", async (req: Request, res: Response) => {
  try {
    console.log('TOKEN : ', req.body);
    const { grant_type } = req.body;

    switch (grant_type) {
      case "authorization_code":
        return await handleAuthorizationCodeGrant(req, res);
      case "refresh_token":
        return await handleRefreshTokenGrant(req, res);
      default:
        return res.status(400).json({ error: "unsupported_grant_type" });
    }
  } catch (error) {
    console.error("Token error:", error);
    res.status(500).json({ error: "server_error" });
  }
});

async function handleAuthorizationCodeGrant(req: Request, res: Response) {
  const { code, redirect_uri, client_id, code_verifier } = req.body;

  if (!code || !code_verifier) {
    return res.status(400).json({ error: "invalid_request" });
  }
  // Retrieve and validate authorization code
  const codeData = await redis.get(`auth_code:${code}`);
  if (!codeData) {
    throw new Error("Invalid or expired authorization code");
  }

  const authData = JSON.parse(codeData);

  try {
    const tokens = await TokenService.exchangeCodeForTokens(
      code,
      code_verifier,
      authData.clientId,
      redirect_uri
    );

    res.json({
      access_token: tokens.accessToken,
      token_type: "Bearer",
      expires_in: tokens.expiresIn,
      refresh_token: tokens.refreshToken,
      id_token: tokens.idToken,
    });
  } catch (error: any) {
    res.status(400).json({
      error: "invalid_grant",
      error_description: error.message,
    });
  }
}

async function handleRefreshTokenGrant(req: Request, res: Response) {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    return res.status(400).json({ error: "invalid_request" });
  }

  try {
    const tokens = await TokenService.refreshAccessToken(refresh_token);

    res.json({
      access_token: tokens.accessToken,
      token_type: "Bearer",
      expires_in: tokens.expiresIn,
      refresh_token: tokens.refreshToken,
    });
  } catch (error: any) {
    res.status(400).json({
      error: "invalid_grant",
      error_description: error.message,
    });
  }
}

// UserInfo Endpoint
router.get("/userinfo", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const token = authHeader.substring(7);

  try {
    const payload = TokenService.verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        picture: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "user_not_found" });
    }

    res.json({
      sub: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
    });
  } catch (error) {
    res.status(401).json({ error: "invalid_token" });
  }
});

// JWKS Endpoint (for public key distribution)
router.get("/.well-known/jwks.json", (req: Request, res: Response) => {
  // Return public keys for token verification
  res.json({
    keys: [
      {
        kty: "RSA",
        use: "sig",
        alg: "RS256",
        kid: "key-1",
		e: "AQAB",
		n: "iUeQbc1qpzFtycjYMVJgFXSDXiGydwYFur81WEQ8Js_bX1yzZ2Pt3cYM4tQUFhgz11GB3BtixinS0gzkPb1QYTR8BBbYKJWXuNcZ4pZ3E-YKd8b0l1-HnTcy7dgW3vwlvi6IVqXu2BznGP4j3nYwgl_VYyH7laVPzT5C8sX-n7rGmK85R_NgDNGHODHfp_zLa11DWQtpn4eclUkr-WlY-tOlRJDwLEnST3L0-EsOh68k5bkA7VyMMDi-n_u7v7jXbthmJF219cUfWFKXUIDaKdgLNw0qYTRK9_PqclVmt5By500ZP7V41XqNVaLy5XUw8L4sRO6SnVFS3v-OEX_giQ"
      },
    ],
  });
});

// OpenID Configuration
router.get("/.well-known/openid-configuration", (req: Request, res: Response) => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;

  res.json({
    issuer: oauthConfig.issuer,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    userinfo_endpoint: `${baseUrl}/oauth/userinfo`,
    jwks_uri: `${baseUrl}/oauth/.well-known/jwks.json`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: oauthConfig.scopes,
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
  });
});

// ==================== LEGACY AUTH ENDPOINTS ====================

// User Registration (Signup) endpoint
router.post("/register", oauthRegisterLimiter, validateSignup, async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "email_and_password_required" });
    }
    // Check if user exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "user_already_exists" });
    }
    // Hash password
    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, password: hashed, name },
      select: { id: true, email: true, name: true },
    });
    res.status(201).json(user);
  } catch (e) {
    console.error("Signup error:", e);
    res.status(500).json({ error: "server_error" });
  }
});


// User Login endpoint (for consent page)
router.post("/login", oauthLoginLimiter, validateLogin, async (req: Request, res: Response) => {
  try {
    const { email, password, request_id } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "email_and_password_required" });
    }
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: "invalid_credentials" });
    }

    // Check if user has password (might be OAuth-only user)
    if (!user.password) {
      throw new Error("This account uses social login. Please sign in with your social provider.");
    }

    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      return res.status(401).json({ error: "invalid_credentials" });
    }

    // Retrieve stored auth request to get redirect URI and PKCE data
    const authRequest = await redis.get(`auth_request:${request_id}`);
    if (!authRequest) {
      return res.status(400).json({ error: "auth_request_not_found" });
    }
    const authData = JSON.parse(authRequest);

    // Generate authorization code using stored PKCE data
    const code = await TokenService.generateAuthorizationCode(
      authData.clientId,
      user.id,
      authData.redirectUri,
      authData.codeChallenge,
      authData.codeChallengeMethod || "S256",
      authData.scope || "openid"
    );

    // Return code, state, and redirectUri in JSON response
    res.json({
      code,
      state: authData.state, // Use original state from auth request
      redirectUri: authData.redirectUri,
      client_id: authData.clientId,
    });
  } catch (e) {
    console.error("Login error:", e);
    res.status(500).json({ error: "server_error" });
  }
});


export default router;
