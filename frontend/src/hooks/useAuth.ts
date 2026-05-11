// frontend/src/hooks/useAuth.ts
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function useAuth(requireAuth = true) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isLoading = status === "loading";
  const isAuthenticated = status === "authenticated";

  useEffect(() => {
    if (requireAuth && !isLoading && !isAuthenticated) {
      router.push("/auth/signin");
    }
  }, [requireAuth, isLoading, isAuthenticated, router]);

  return {
    session,
    isLoading,
    isAuthenticated,
    user: session?.user,
  };
}
