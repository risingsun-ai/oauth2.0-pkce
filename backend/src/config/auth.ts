// backend/src/config/auth.ts
import crypto from "crypto";

export const oauthConfig = {
  issuer: process.env.OAUTH_ISSUER!,
  accessTokenExpiry: 3600, // 1 hour
  refreshTokenExpiry: 30 * 24 * 3600, // 30 days
  authorizationCodeExpiry: 600, // 10 minutes
  
  // PKCE Configuration
  pkce: {
    required: true,
    methods: ["S256"], // Only allow S256 method
  },
  
  // Scopes
  scopes: ["openid", "profile", "email", "read", "write"],
  
  // Token signing
  jwt: {
    secret: process.env.JWT_SECRET!,
    algorithm: "RS256" as const,
    publicKey: process.env.JWT_PUBLIC_KEY!,
    privateKey: process.env.JWT_PRIVATE_KEY!,
  },
};

// PKCE Helper Functions
export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function generateCodeChallenge(verifier: string): string {
  return crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
}

export function verifyCodeChallenge(
  verifier: string,
  challenge: string
): boolean {
  const expectedChallenge = generateCodeChallenge(verifier);
  return crypto.timingSafeEqual(
    Buffer.from(challenge),
    Buffer.from(expectedChallenge)
  );
}
