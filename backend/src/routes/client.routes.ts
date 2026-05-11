// backend/src/routes/client.routes.ts
import { Router, Request, Response } from "express";
import { prisma } from "../config/database";
import crypto from "crypto";

const router = Router();

// Register a new OAuth client
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { name, redirectUris, grants, scopes } = req.body;

    // Generate client credentials
    const clientId = crypto.randomBytes(16).toString("hex");
    const clientSecret = crypto.randomBytes(32).toString("hex");

    const client = await prisma.oAuthClient.create({
      data: {
        clientId,
        clientSecret,
        name,
        redirectUris,
        grants: grants || ["authorization_code", "refresh_token"],
        scopes: scopes || ["openid", "profile", "email"],
      },
    });

    // Return credentials (only shown once!)
    res.status(201).json({
      clientId: client.clientId,
      clientSecret: client.clientSecret,
      name: client.name,
      redirectUris: client.redirectUris,
      message: "Save these credentials - clientSecret won't be shown again!",
    });
  } catch (error) {
    console.error("Client registration error:", error);
    res.status(500).json({ error: "Failed to register client" });
  }
});

export default router;

/*
# Make a POST request to register your frontend
curl -X POST http://localhost:4000/oauth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Next.js Frontend",
    "redirectUris": ["http://localhost:3000/api/auth/callback/custom-oauth"],
    "grants": ["authorization_code", "refresh_token"],
    "scopes": ["openid", "profile", "email", "read", "write"]
  }'
*/
