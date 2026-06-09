import type { NextConfig } from "next";

const SUPABASE_HOST = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host
  : '*.supabase.co';

const CSP = [
  "default-src 'self'",
  // unsafe-inline necessário para FullCalendar e Recharts (estilos inline)
  // unsafe-eval necessário para Next.js dev e alguns polyfills
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://accounts.google.com`,
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
  `font-src 'self' data: https://fonts.gstatic.com`,
  // blob: para PDFs/documentos gerados; lh3 para avatares Google
  `img-src 'self' data: blob: https://${SUPABASE_HOST} https://*.supabase.co https://lh3.googleusercontent.com https://www.gstatic.com`,
  // wss para Supabase Realtime; googleapis para Calendar e OAuth
  `connect-src 'self' https://${SUPABASE_HOST} https://*.supabase.co wss://${SUPABASE_HOST} wss://*.supabase.co https://www.googleapis.com https://calendar.googleapis.com https://accounts.google.com`,
  // Supabase OAuth abre popup Google — precisa de frame-src
  `frame-src https://accounts.google.com`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self' https://accounts.google.com`,
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
          { key: 'Cross-Origin-Opener-Policy',      value: 'same-origin-allow-popups' },
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
