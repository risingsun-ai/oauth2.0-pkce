/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enables the modern Turbopack bundler for faster builds
  transpilePackages: ['lucide-react'], 
  
  // Security Headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()'
          }
        ],
      },
    ];
  },

  // Image Optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },

  // Performance & Debugging
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
  
  // Experimental features for 2026
  experimental: {
    optimizePackageImports: ['@headlessui/react', '@heroicons/react'],
    typedRoutes: true,
  },
};

export default nextConfig;
