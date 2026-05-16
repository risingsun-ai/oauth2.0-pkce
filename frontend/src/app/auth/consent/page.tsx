"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export default function ConsentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestId = searchParams.get("request_id");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, request_id: requestId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.error || "Authentication failed");
        return;
      }

      const data = await response.json();

      if (data.code && data.redirectUri) {
        // console.log("redirecting 2 to Login page:", data.redirectUri);
        // Redirect to NextAuth callback with auth code and state
        // router.replace(`/api/auth/callback/custom-oauth?code=${data.code}&state=${data.state}&client_id=${data.client_id}`);
        router.replace(`${data.redirectUri}?code=${data.code}&state=${data.state}&client_id=${data.client_id}`);
         router.refresh();
      } else {
        setError("Unexpected response format");
      }
    } catch (err) {
      setError("Network error. Please try again.");
      console.error("Login error:", err);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 text-center">
        <div>
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Sign in to continue
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Enter your credentials to authorize the application
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm space-y-2">
            <div>
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Email address"
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Password"
              />
            </div>
          </div>

          {error && (
            <div className="text-red-500 text-sm italic mt-2">{error}</div>
          )}

          <div>
            <button
              type="submit"
              disabled={!requestId}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 rounded-md"
            >
              Sign in
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
