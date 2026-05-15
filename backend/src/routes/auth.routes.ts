// backend/src/routes/auth.routes.ts
import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { TokenService } from "../services/token.service.js";
import { AuthService } from "../services/auth.service.js";
import { redis } from "../config/redis.js";
import { authenticate } from "../middleware/authenticate.js";
import {
  validateSignup,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
} from "../middleware/validate.js";

const router = Router();

// Rate limiters
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 signups per hour per IP
  message: {
    error: "rate_limit_exceeded",
    error_description: "Too many signup attempts. Please try again later.",
  },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 login attempts per 15 minutes
  message: {
    error: "rate_limit_exceeded",
    error_description: "Too many login attempts. Please try again later.",
  },
});

// ==================== NEW AUTH ENDPOINTS ====================

// POST /auth/signup - User Registration
router.post("/signup", signupLimiter, validateSignup, async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;

    const result = await AuthService.signup({ email, password, name });

    res.status(201).json({
      success: true,
      message: "Account created successfully. Please verify your email.",
      data: result,
    });
  } catch (error: any) {
    console.error("Signup error:", error);

    if (error.message === "User with this email already exists") {
      return res.status(409).json({
        error: "user_exists",
        error_description: error.message,
      });
    }

    res.status(500).json({
      error: "server_error",
      error_description: "Failed to create account. Please try again.",
    });
  }
});

// POST /auth/login - User Login
router.post("/login", loginLimiter, validateLogin, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const result = await AuthService.login({ email, password });

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error("Login error:", error);

    // Generic error message to prevent user enumeration
    res.status(401).json({
      error: "invalid_credentials",
      error_description: "Invalid email or password",
    });
  }
});

// POST /auth/verify-email - Verify Email Address
router.post("/verify-email", async (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        error: "invalid_request",
        error_description: "Verification token is required",
      });
    }

    await AuthService.verifyEmail(token);

    res.json({
      success: true,
      message: "Email verified successfully",
    });
  } catch (error: any) {
    res.status(400).json({
      error: "invalid_token",
      error_description: error.message,
    });
  }
});

// POST /auth/resend-verification - Resend Verification Email
router.post("/resend-verification", async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        error: "invalid_request",
        error_description: "Email is required",
      });
    }

    await AuthService.resendVerificationEmail(email);

    // Always return success to prevent user enumeration
    res.json({
      success: true,
      message: "If an account exists with this email, a verification link has been sent.",
    });
  } catch (error: any) {
    res.json({
      success: true,
      message: "If an account exists with this email, a verification link has been sent.",
    });
  }
});

// POST /auth/forgot-password - Request Password Reset
router.post("/forgot-password", validateForgotPassword, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    await AuthService.forgotPassword(email);

    // Always return success to prevent user enumeration
    res.json({
      success: true,
      message: "If an account exists with this email, a password reset link has been sent.",
    });
  } catch (error: any) {
    res.json({
      success: true,
      message: "If an account exists with this email, a password reset link has been sent.",
    });
  }
});

// POST /auth/reset-password - Reset Password
router.post("/reset-password", validateResetPassword, async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;

    await AuthService.resetPassword(token, password);

    res.json({
      success: true,
      message: "Password reset successfully. Please login with your new password.",
    });
  } catch (error: any) {
    res.status(400).json({
      error: "invalid_token",
      error_description: error.message,
    });
  }
});

// POST /auth/refresh - Refresh Access Token
router.post("/refresh", async (req: Request, res: Response) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({
        error: "invalid_request",
        error_description: "Refresh token is required",
      });
    }

    const tokens = await TokenService.refreshAccessToken(refresh_token);

    res.json({
      success: true,
      data: tokens,
    });
  } catch (error: any) {
    res.status(401).json({
      error: "invalid_token",
      error_description: "Invalid or expired refresh token",
    });
  }
});

// POST /auth/logout - Logout (Revoke Token)
router.post("/logout", authenticate, async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.substring(7);

    // Add token to blacklist
    if (token) {
      const decoded = TokenService.verifyAccessToken(token);
      const ttl = decoded.exp! - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
        // const redis = new (await import("ioredis")).default(process.env.REDIS_URL);
        await redis.setex(`token_blacklist:${token}`, ttl, "revoked");
      }
    }

    // Revoke refresh token if provided
    const { refresh_token } = req.body;
    if (refresh_token) {
      // const redis = new (await import("ioredis")).default(process.env.REDIS_URL);
      await redis.del(`refresh_token:${refresh_token}`);
    }

    res.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error: any) {
    res.status(500).json({
      error: "server_error",
      error_description: "Failed to logout",
    });
  }
});

// GET /auth/me - Get Current User
router.get("/me", authenticate, async (req: Request, res: Response) => {
  try {
    const { prisma } = await import("../config/database.js");

    const user = await prisma.user.findUnique({
      where: { id: req.user!.sub },
      select: {
        id: true,
        email: true,
        name: true,
        picture: true,
        emailVerified: true,
        roles: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        error: "user_not_found",
        error_description: "User not found",
      });
    }

    res.json({
      success: true,
      data: { user },
    });
  } catch (error: any) {
    res.status(500).json({
      error: "server_error",
      error_description: "Failed to fetch user",
    });
  }
});


export default router;
