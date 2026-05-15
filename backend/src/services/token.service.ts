// backend/src/services/token.service.ts
import jwt from "jsonwebtoken";
import { oauthConfig } from "../config/auth.js";
import { prisma } from "../config/database.js";
import { redis } from "../config/redis.js";
import crypto from "crypto";

await redis.on('error', (err) => { console.error('Service Redis Client Error:', err) });

export interface TokenPayload {
  sub: string;
  email: string;
  name: string;
  roles: string[];
  scope: string;
  audience: string;
}

export class TokenService {
  // Generate authorization code with PKCE
  static async generateAuthorizationCode(
    clientId: string,
    userId: string,
    redirectUri: string,
    codeChallenge: string,
    codeChallengeMethod: string,
    scope: string
  ): Promise<string> {
    const code = crypto.randomBytes(32).toString("hex");

    // Store code with PKCE data
    await redis.setex(
      `auth_code:${code}`,
      oauthConfig.accessTokenExpiry,
      JSON.stringify({
        clientId,
        userId,
        redirectUri,
        codeChallenge,
        codeChallengeMethod,
        scope,
        used: false,
      })
    );

    return code;
  }

  // Exchange authorization code for tokens
  static async exchangeCodeForTokens(
    code: string,
    codeVerifier: string,
    clientId: string,
    redirectUri: string
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    idToken: string;
    expiresIn: number;
  }> {
    // Retrieve and validate authorization code
    const codeData = await redis.get(`auth_code:${code}`);
    if (!codeData) {
      throw new Error("Invalid or expired authorization code");
    }

    const authData = JSON.parse(codeData);

    // Check if code was already used
    if (authData.used) {
      // Potential replay attack - revoke all tokens for this user
      await this.revokeAllUserTokens(authData.userId);
      throw new Error("Authorization code already used");
    }

    // Validate PKCE
    if (authData.codeChallenge) {
      const challenge = crypto
        .createHash("sha256")
        .update(codeVerifier)
        .digest("base64url");

      if (challenge !== authData.codeChallenge) {
        throw new Error("Invalid code verifier");
      }
    }

    // Validate client
    // if (authData.clientId !== clientId) {
    //   throw new Error("Invalid client");
    // }

    // Validate client and redirect URI
    if (authData.redirectUri !== redirectUri) {
      throw new Error("Invalid redirect URI");
    }

    // Mark code as used
    authData.used = true;
    await redis.setex(
      `auth_code:${code}`,
      60, // Keep for 1 minute for audit
      JSON.stringify(authData)
    );

    // Get user data
    const user = await prisma.user.findUnique({
      where: { id: authData.userId },
    });

    if (!user) {
      throw new Error("User not found");
    }

    // Generate tokens
    const payload: TokenPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      roles: user.roles,
      scope: authData.scope,
      audience: clientId,
    };

    const accessToken = this.generateAccessToken(payload, clientId);
    const refreshToken = this.generateRefreshToken(user.id);
    const idToken = this.generateIdToken(payload);

    // Store refresh token
    await redis.setex(
      `refresh_token:${refreshToken}`,
      oauthConfig.refreshTokenExpiry,
      JSON.stringify({
        userId: user.id,
        clientId,
        scope: authData.scope,
      })
    );

    return {
      accessToken,
      refreshToken,
      idToken,
      expiresIn: oauthConfig.accessTokenExpiry,
    };
  }

  // Generate Access Token
  static generateAccessToken(payload: TokenPayload, clientId?: string): string {
    return jwt.sign(payload, oauthConfig.jwt.privateKey, {
      algorithm: oauthConfig.jwt.algorithm,
      expiresIn: oauthConfig.accessTokenExpiry,
      issuer: oauthConfig.issuer,
      audience: clientId,
    });
  }

  // Generate Refresh Token
  static generateRefreshToken(userId: string): string {
    return jwt.sign(
      { sub: userId, type: "refresh" },
      oauthConfig.jwt.secret,
      {
        algorithm: "HS256",
        expiresIn: oauthConfig.refreshTokenExpiry,
      }
    );
  }

  // Generate ID Token (OpenID Connect)
  static generateIdToken(payload: TokenPayload): string {
    return jwt.sign(
      {
        sub: payload.sub,
        email: payload.email,
        name: payload.name,
        email_verified: true,
      },
      oauthConfig.jwt.privateKey,
      {
        algorithm: oauthConfig.jwt.algorithm,
        expiresIn: oauthConfig.accessTokenExpiry,
        issuer: oauthConfig.issuer,
        audience: payload.audience,
      }
    );
  }

  // Refresh Access Token
  static async refreshAccessToken(
    refreshToken: string
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    // Verify refresh token exists
    const tokenData = await redis.get(`refresh_token:${refreshToken}`);
    if (!tokenData) {
      throw new Error("Invalid refresh token");
    }

    const { userId, clientId, scope } = JSON.parse(tokenData);

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error("User not found");
    }

    // Rotate refresh token (security best practice)
    await redis.del(`refresh_token:${refreshToken}`);

    const payload: TokenPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      roles: user.roles,
      scope,
      audience: clientId,
    };

    const newAccessToken = this.generateAccessToken(payload, clientId);
    const newRefreshToken = this.generateRefreshToken(user.id);

    // Store new refresh token
    await redis.setex(
      `refresh_token:${newRefreshToken}`,
      oauthConfig.refreshTokenExpiry,
      JSON.stringify({ userId, clientId, scope })
    );

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: oauthConfig.accessTokenExpiry,
    };
  }

  // Revoke all tokens for a user
  static async revokeAllUserTokens(userId: string): Promise<void> {
    const keys = await redis.keys("refresh_token:*");
    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        const tokenData = JSON.parse(data);
        if (tokenData.userId === userId) {
          await redis.del(key);
        }
      }
    }
  }

  // Verify Access Token
  static verifyAccessToken(token: string): TokenPayload {
    return jwt.verify(token, oauthConfig.jwt.publicKey, {
      algorithms: [oauthConfig.jwt.algorithm],
      issuer: oauthConfig.issuer,
    }) as TokenPayload;
  }

}
