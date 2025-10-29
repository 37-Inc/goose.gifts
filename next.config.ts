import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // We run ESLint separately via npm run lint, skip during build
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      // Amazon image domains
      {
        protocol: 'https',
        hostname: 'm.media-amazon.com',
      },
      {
        protocol: 'https',
        hostname: 'images-na.ssl-images-amazon.com',
      },
      {
        protocol: 'https',
        hostname: 'images-amazon.com',
      },
      {
        protocol: 'https',
        hostname: 'images.amazon.com',
      },
      {
        protocol: 'https',
        hostname: 'ecx.images-amazon.com',
      },
      {
        protocol: 'https',
        hostname: 'images-eu.ssl-images-amazon.com',
      },
      // Etsy image domain
      {
        protocol: 'https',
        hostname: 'i.etsystatic.com',
      },
      // Fallback placeholder (used by google-amazon-search.ts)
      {
        protocol: 'https',
        hostname: 'via.placeholder.com',
      },
    ],
  },
};

export default nextConfig;
