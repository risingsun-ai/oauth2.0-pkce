// frontend/src/lib/auth.ts
import NextAuth from "next-auth";
import { JWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    // Custom OAuth Provider with PKCE
    {
      id: "custom-oauth",
      name: "Custom OAuth",
      type: "oauth",
      issuer: process.env.OAUTH_ISSUER,
      clientId: process.env.OAUTH_CLIENT_ID,
      clientSecret: process.env.OAUTH_CLIENT_SECRET,
      
      // Enable PKCE
      authorization: {
        params: {
          scope: "openid profile email",
          response_type: "code",
          // PKCE is enabled by default in NextAuth v5
        },
      },
      
      // Token endpoint configuration
      token: {
        url: `${process.env.BACKEND_URL}/oauth/token`,
      },
      
      // Userinfo endpoint
      userinfo: {
        url: `${process.env.BACKEND_URL}/oauth/userinfo`,
      },
      
      // Profile mapping
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email,
          image: profile.picture,
        };
      },
      
      // Enable PKCE explicitly
      checks: ["pkce", "state"],
    },
	// Google - PKCE enabled by default
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    
    // GitHub - PKCE enabled by default
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
    
    // Custom Credentials (for your Express backend)
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        // Call your Express backend to verify credentials
        const res = await fetch(`${process.env.BACKEND_URL}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(credentials),
        });
        
        const user = await res.json();
        
        if (res.ok && user) {
          return user;
        }
        return null;
      },
    }),
  ],
  
  // Session configuration
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  
  // Callbacks for token management
  callbacks: {
    async jwt({ token, account, profile }) {
      // Initial sign in
      if (account && profile) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.accessTokenExpires = account.expires_at! * 1000;
        token.id = profile.sub;
      }
      
      // Return previous token if not expired
      if (Date.now() < (token.accessTokenExpires as number)) {
        return token;
      }
      
      // Access token expired, refresh it
      return await refreshAccessToken(token);
    },
    
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      session.error = token.error as string;
      session.user.id = token.id as string;
      return session;
    },
  },
  
  // Custom pages
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
  
  // Security
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === "development",
});

// Token refresh function
async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    const response = await fetch(`${process.env.BACKEND_URL}/oauth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: token.refreshToken as string,
        client_id: process.env.OAUTH_CLIENT_ID!,
      }),
    });

    const refreshedTokens = await response.json();

    if (!response.ok) {
      throw refreshedTokens;
    }

    return {
      ...token,
      accessToken: refreshedTokens.access_token,
      accessTokenExpires: Date.now() + refreshedTokens.expires_in * 1000,
      refreshToken: refreshedTokens.refresh_token ?? token.refreshToken,
    };
  } catch (error) {
    console.error("Error refreshing access token", error);
    return {
      ...token,
      error: "RefreshAccessTokenError",
    };
  }
}
