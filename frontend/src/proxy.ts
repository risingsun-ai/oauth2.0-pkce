// frontend/src/middleware.ts (Next.js 16 compatible)

import { NextResponse } from "next/server"

import { auth } from "./lib/auth";

export const proxy = auth((req) => {
  /**
   * Next.js 16 edge‑runtime middleware using the new export pattern.
   * It integrates with NextAuth v5 and handles:
   *   • Refresh token errors – redirects to sign‑in and clears the session cookie.
   *   • Role‑based protection for admin routes.
   */
  // Request handler (Edge runtime)
  const isLoggedIn = !!req.auth
  // const isAdmin = req.auth?.user?.role === 'admin';
  const pathname = req.nextUrl.pathname;
  // const isOnDashboard = pathname.startsWith("/dashboard");
  const isApi = pathname.startsWith("/api/auth");
  const isDash = pathname.startsWith("/dashboard");

  const protectedRoutes = ["/profile", "/settings"];
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route));
  console.info(`USER DATA: `, req.auth?.expires);

  // if (isApi) return; // NextAuth handles /api/auth

  // const token = request.nextauth?.token;
  // const { pathname } = request.nextUrl;

  // If the token refresh failed, redirect to sign‑in and delete the session cookie.
  // if (token?.error === "RefreshAccessTokenError") {
  //   const response = NextResponse.redirect(new URL("/auth/signin", request.url));
  //   response.cookies.delete("next-auth.session-token");
  //   return response;
  // }

  // Block non‑admin users from accessing /admin routes.
  // if (pathname.startsWith("/admin") && token?.role !== "admin") {
  //   return NextResponse.redirect(new URL("/unauthorized", request.url));
  // }

  // Allow the request to continue.
  return NextResponse.next();


})

// Matcher configuration – same routes as before.
export const config = {
  matcher: ["/dashboard/:path*", "/profile/:path*", "/admin/:path*"],
}
