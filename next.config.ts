import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // We run ESLint separately via npm run lint, skip during build
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      // Amazon image domains - specific known CDNs
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
        hostname: 'images-eu.ssl-images-amazon.com',
      },
      {
        protocol: 'https',
        hostname: 'images-fe.ssl-images-amazon.com',
      },
      // Amazon wildcard patterns for all possible CDN subdomains
      {
        protocol: 'https',
        hostname: '**.images-amazon.com',
      },
      {
        protocol: 'https',
        hostname: '**.ssl-images-amazon.com',
      },
      {
        protocol: 'https',
        hostname: '**.media-amazon.com',
      },
      // Etsy image domains
      {
        protocol: 'https',
        hostname: 'i.etsystatic.com',
      },
      {
        protocol: 'https',
        hostname: '**.etsystatic.com',
      },
      // Fallback placeholder
      {
        protocol: 'https',
        hostname: 'via.placeholder.com',
      },
    ],
    // Increase cache TTL for external images
    minimumCacheTTL: 60,
    // Configure device sizes for responsive images
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    // Enable dangerous allow SVG (if needed)
    dangerouslyAllowSVG: false,
    contentDispositionType: 'attachment',
  },
};

export default nextConfig;
