// backend/src/routes/auth.routes.ts
import { Router, Request, Response } from "express";
import {
  oauthConfig,
  generateCodeVerifier,
  generateCodeChallenge,
  verifyCodeChallenge,
} from "../config/auth";
import { TokenService } from "../services/token.service";
import { prisma } from "../config/database";
import { Redis } from "ioredis";

const router = Router();
const redis = new Redis(process.env.REDIS_URL);

// Authorization Endpoint
router.get("/authorize", async (req: Request, res: Response) => {
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

  try {
    const tokens = await TokenService.exchangeCodeForTokens(
      code,
      code_verifier,
      client_id,
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
        // Add your public key components here
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

export default router;
