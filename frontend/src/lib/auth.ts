// frontend/src/lib/auth.ts
import NextAuth from "next-auth";
import { JWT } from "next-auth/jwt";
import { Session } from "next-auth";

async function makeTokenRequest(context: any) {
  console.log("params: ", context.params)
  console.log('host: ', process.env.BACKEND_URL, 'nextAuthUrl: ', process.env.NEXTAUTH_URL)

  const formData = new URLSearchParams();
  formData.append('grant_type', 'authorization_code')
  formData.append('code', context.params.code)
  formData.append('client_id', `${process.env.OAUTH_CLIENT_ID}`)
  formData.append('redirect_uri', `${process.env.NEXTAUTH_URL}/api/auth/callback/custom-oauth`)
  formData.append('code_verifier', context.authorization.code_verifier)

  console.log('formData: ' + formData)

  const url = `${process.env.BACKEND_URL}/oauth/token`
  const request = await fetch(url, {

    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(formData)

  }).then(function (response) {
    console.log('url: ' + url + ", formData: " + formData.toString());
    var json = response.json();
    console.log('response: ' + json)

    return json;
  }).then(function (data) {
    return data;
  });
  return request;
}

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
      wellKnown: `${process.env.BACKEND_URL}/oauth/.well-known/openid-configuration`,
      // redirectProxyUrl: `${process.env.NEXTAUTH_URL}`,

      // Enable PKCE
      authorization: {
        url: `${process.env.BACKEND_URL}/oauth/authorize`,
        params: {
          scope: "openid profile email",
          response_type: "code",
          // PKCE is enabled by default in NextAuth v5
        },
      },

      // Token endpoint configuration
      token: {
        url: `${process.env.BACKEND_URL}/oauth/token`,
        // params: {
        //   redirect_uri: context.provider.callbackUrl,
        //   code: context.authorization.code,
        //   client_id: context.client.clientId,
        //   code_verifier: context.authorization.code_verifier,
        //   grant_type: "authorization_code",
        // },
        async request(context) {
          console.log("Context 1", context);
          // console.log("Context 1", context.client.clientSecret);
          const tokens = await makeTokenRequest(context)
          console.log('tokens: {}', tokens)
          return { tokens }
        },
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

    async redirect({ url, baseUrl }) {
      // Allows relative callback URLs
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      // Allows callback URLs on the same origin
      else if (new URL(url).origin === baseUrl) return url;
      return baseUrl;
    },
  },

  // Custom pages
  pages: {
    // signIn: "/auth/consent",
    error: "/auth/error",
  },

  // Events
  events: {
    async signIn({ user, account, profile, isNewUser }) {
      console.log("User signed in:", user.email, "Is new user:", isNewUser);
    },
    //   async signOut({ session, token }) {
    //     // Call backend logout to revoke tokens
    //     if (token?.accessToken) {
    //       try {
    //         await fetch(`${process.env.BACKEND_URL}/oauth/logout`, {
    //           method: "POST",
    //           headers: {
    //             "Content-Type": "application/json",
    //             Authorization: `Bearer ${token.accessToken}`,
    //           },
    //           body: JSON.stringify({
    //             refresh_token: token.refreshToken,
    //           }),
    //         });
    //       } catch (error) {
    //         console.error("Logout error:", error);
    //       }
    //     }
    //   },
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


// Type declarations
declare module "next-auth" {
  interface Session {
    accessToken?: string;
    idToken?: string;
    error?: string;
    user: {
      id: string;
      email: string;
      name: string;
      image?: string;
    };
  }

  interface User {
    accessToken?: string;
    refreshToken?: string;
    idToken?: string;
    accessTokenExpires?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    email?: string;
    name?: string;
    picture?: string;
    accessToken?: string;
    refreshToken?: string;
    idToken?: string;
    accessTokenExpires?: number;
    error?: string;
  }
}