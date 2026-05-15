// frontend/src/components/auth/AuthProvider.tsx
"use client";

import { apiClient } from "@/src/lib/api-client";
import { SessionProvider, useSession } from "next-auth/react";
import { useEffect } from "react";

function AuthSync({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (session?.accessToken) {
      apiClient.setAccessToken(session.accessToken);
    } else {
      apiClient.setAccessToken(null);
    }
  }, [session]);

  return <>{children}</>;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AuthSync>{children}</AuthSync>
    </SessionProvider>
  );
}
