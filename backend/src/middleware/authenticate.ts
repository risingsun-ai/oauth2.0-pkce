// backend/src/middleware/authenticate.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { TokenService, TokenPayload } from "../services/token.service.js";

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "unauthorized",
      error_description: "Missing or invalid authorization header",
    });
  }

  const token = authHeader.substring(7);

  try {
    const payload = TokenService.verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        error: "token_expired",
        error_description: "Access token has expired",
      });
    }

    return res.status(401).json({
      error: "invalid_token",
      error_description: "Invalid access token",
    });
  }
}

// Scope-based authorization middleware
export function requireScope(...requiredScopes: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const userScopes = req.user.scope.split(" ");
    const hasScope = requiredScopes.some((scope) =>
      userScopes.includes(scope)
    );

    if (!hasScope) {
      return res.status(403).json({
        error: "insufficient_scope",
        error_description: `Required scope: ${requiredScopes.join(", ")}`,
      });
    }

    next();
  };
}

// Role-based authorization middleware
export function requireRole(...requiredRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const hasRole = req.user.roles.some((role) =>
      requiredRoles.includes(role)
    );

    if (!hasRole) {
      return res.status(403).json({
        error: "insufficient_permissions",
        error_description: `Required role: ${requiredRoles.join(", ")}`,
      });
    }

    next();
  };
}
