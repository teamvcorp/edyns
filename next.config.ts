import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Admin paystub uploads go through a Server Action (default limit 1MB).
      // lib/paystubs.ts caps files at 4MB; 5mb leaves room for multipart overhead
      // while staying near Vercel's ~4.5MB function body cap.
      bodySizeLimit: '5mb',
    },
  },
  images: {
    remotePatterns: [
      // Vercel Blob public files (property images)
      { protocol: 'https', hostname: '*.public.blob.vercel-storage.com' },
    ],
  },
};

export default nextConfig;
