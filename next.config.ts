import type { NextConfig } from 'next';

// Content-Security-Policy directives. Mirrors the previous middleware shape
// but executed by Next's static-header pipeline — no per-request function call.
const CSP_DIRECTIVES: Record<string, string> = {
  'default-src': "'self'",
  'script-src': "'self' 'unsafe-inline' 'unsafe-eval'",
  'style-src': "'self' 'unsafe-inline'",
  'img-src': "'self' data: blob: https:",
  'font-src': "'self'",
  'connect-src': "'self' ws: localhost:*",
  'media-src': "'self'",
  'object-src': "'none'",
  'child-src': "'none'",
  'frame-src': "'none'",
  'frame-ancestors': "'none'",
  'form-action': "'self'",
  'base-uri': "'self'",
  'manifest-src': "'self'",
  'worker-src': "'self' blob:",
  'upgrade-insecure-requests': '',
};

const CSP = Object.entries(CSP_DIRECTIVES)
  .map(([d, v]) => (v ? `${d} ${v}` : d))
  .join('; ');

const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-XSS-Protection', value: '0' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: [
      'camera=()',
      'microphone=()',
      'geolocation=()',
      'interest-cohort=()',
      'payment=()',
      'usb=()',
    ].join(', '),
  },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
  { key: 'Content-Security-Policy', value: CSP },
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  cacheComponents: true,
  async headers() {
    return [
      {
        // Apply to everything except static asset fingerprints (handled by
        // Next's own headers).
        source: '/((?!_next/static|_next/image).*)',
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
