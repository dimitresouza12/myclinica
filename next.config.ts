import type { NextConfig } from "next";

const SUPABASE_HOST = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host
  : '*.supabase.co';

const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com`,
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
  `font-src 'self' https://fonts.gstatic.com`,
  `img-src 'self' data: blob: https://${SUPABASE_HOST} https://lh3.googleusercontent.com`,
  `connect-src 'self' https://${SUPABASE_HOST} wss://${SUPABASE_HOST} https://www.googleapis.com https://calendar.googleapis.com`,
  `frame-src 'none'`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `upgrade-insecure-requests`,
].join('; ');

const nextConfig: NextConfig = {
  output: 'standalone',
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options',                value: 'DENY' },
          { key: 'X-Content-Type-Options',          value: 'nosniff' },
          { key: 'X-XSS-Protection',                value: '1; mode=block' },
          { key: 'Referrer-Policy',                 value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',              value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
          { key: 'Strict-Transport-Security',       value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Content-Security-Policy',         value: CSP },
          { key: 'Cross-Origin-Opener-Policy',      value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy',    value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy',    value: 'require-corp' },
        ],
      },
      // Permite carregar recursos do Supabase Storage (imagens, PDFs)
      {
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
    ]
  },
};

export default nextConfig;
