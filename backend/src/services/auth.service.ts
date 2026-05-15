// backend/src/services/auth.service.ts
import bcrypt from "bcrypt";
import { prisma } from "../config/database.js";
import { TokenService } from "./token.service.js";
import crypto from "crypto";
import { redis } from "../config/redis.js";

export interface SignupInput {
    email: string;
    password: string;
    name: string;
}

export interface LoginInput {
    email: string;
    password: string;
}

export interface AuthResponse {
    user: {
        id: string;
        email: string;
        name: string;
        picture?: string;
    };
    tokens: {
        accessToken: string;
        refreshToken: string;
        idToken: string;
        expiresIn: number;
    };
}

export class AuthService {
    // User Registration
    static async signup(input: SignupInput): Promise<AuthResponse> {
        const { email, password, name } = input;

        // Check if user already exists
        const existingUser = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
        });

        if (existingUser) {
            throw new Error("User with this email already exists");
        }

        // Hash password
        const saltRounds = 12;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Create user
        const user = await prisma.user.create({
            data: {
                email: email.toLowerCase(),
                name,
                password: hashedPassword,
                roles: ["user"],
                emailVerified: false,
            },
            select: {
                id: true,
                email: true,
                name: true,
                picture: true,
                roles: true,
            },
        });

        // Generate email verification token
        const verificationToken = crypto.randomBytes(32).toString("hex");
        await redis.setex(
            `email_verification:${verificationToken}`,
            24 * 60 * 60, // 24 hours
            user.id
        );

        // Send verification email (implement your email service)
        // await EmailService.sendVerificationEmail(user.email, verificationToken);

        // Generate tokens
        const tokens = await this.generateAuthTokens(user.id, user.email, user.name, user.roles);

        return {
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                picture: user.picture || undefined,
            },
            tokens,
        };
    }

    // User Login
    static async login(input: LoginInput): Promise<AuthResponse> {
        const { email, password } = input;

        // Find user
        const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
        });

        if (!user) {
            throw new Error("Invalid email or password");
        }

        // Check if user has password (might be OAuth-only user)
        if (!user.password) {
            throw new Error("This account uses social login. Please sign in with your social provider.");
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            throw new Error("Invalid email or password");
        }

        // Generate tokens
        const tokens = await this.generateAuthTokens(user.id, user.email, user.name, user.roles);

        return {
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                picture: user.picture || undefined,
            },
            tokens,
        };
    }

    // Verify Email
    static async verifyEmail(token: string): Promise<boolean> {
        const userId = await redis.get(`email_verification:${token}`);

        if (!userId) {
            throw new Error("Invalid or expired verification token");
        }

        await prisma.user.update({
            where: { id: userId },
            data: { emailVerified: true },
        });

        await redis.del(`email_verification:${token}`);

        return true;
    }

    // Resend Verification Email
    static async resendVerificationEmail(email: string): Promise<void> {
        const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
        });

        if (!user) {
            // Don't reveal if user exists
            return;
        }

        if (user.emailVerified) {
            throw new Error("Email is already verified");
        }

        // Generate new verification token
        const verificationToken = crypto.randomBytes(32).toString("hex");
        await redis.setex(
            `email_verification:${verificationToken}`,
            24 * 60 * 60,
            user.id
        );

        // Send verification email
        // await EmailService.sendVerificationEmail(user.email, verificationToken);
    }

    // Forgot Password
    static async forgotPassword(email: string): Promise<void> {
        const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
        });

        if (!user) {
            // Don't reveal if user exists
            return;
        }

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString("hex");
        await redis.setex(
            `password_reset:${resetToken}`,
            1 * 60 * 60, // 1 hour
            user.id
        );

        // Send reset email
        // await EmailService.sendPasswordResetEmail(user.email, resetToken);
    }

    // Reset Password
    static async resetPassword(token: string, newPassword: string): Promise<void> {
        const userId = await redis.get(`password_reset:${token}`);

        if (!userId) {
            throw new Error("Invalid or expired reset token");
        }

        const hashedPassword = await bcrypt.hash(newPassword, 12);

        await prisma.user.update({
            where: { id: userId },
            data: { password: hashedPassword },
        });

        await redis.del(`password_reset:${token}`);

        // Revoke all existing tokens
        await TokenService.revokeAllUserTokens(userId);
    }

    // Generate Auth Tokens
    private static async generateAuthTokens(
        userId: string,
        email: string,
        name: string,
        roles: string[]
    ) {
        const payload = {
            sub: userId,
            email,
            name,
            roles,
            scope: "openid profile email read write",
            audience: "frontend-client",
        };

        const accessToken = TokenService.generateAccessToken(payload);
        const refreshToken = TokenService.generateRefreshToken(userId);
        const idToken = TokenService.generateIdToken(payload);

        // Store refresh token
        await redis.setex(
            `refresh_token:${refreshToken}`,
            30 * 24 * 60 * 60, // 30 days
            JSON.stringify({
                userId,
                clientId: "frontend-client",
                scope: payload.scope,
            })
        );

        return {
            accessToken,
            refreshToken,
            idToken,
            expiresIn: 3600, // 1 hour
        };
    }
}