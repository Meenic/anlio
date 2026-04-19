import { NextRequest, NextResponse } from 'next/server';

/**
 * Routes that require a valid session.
 */
export const PROTECTED_PREFIXES = [] as const;

/**
 * Routes that authenticated users should not be able to visit.
 */
export const AUTH_PREFIXES = [] as const;

/**
 * Routes that bypass all auth logic entirely.
 */
export const PUBLIC_PREFIXES = [] as const;

/** Content-Security-Policy configuration. */
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

function buildCsp(): string {
  return Object.entries(CSP_DIRECTIVES)
    .map(([directive, value]) => (value ? `${directive} ${value}` : directive))
    .join('; ');
}

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '0', // Handled by CSP
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': [
    'camera=()',
    'microphone=()',
    'geolocation=()',
    'interest-cohort=()',
    'payment=()',
    'usb=()',
  ].join(', '),
  'X-DNS-Prefetch-Control': 'on',
  'X-Permitted-Cross-Domain-Policies': 'none',
  'Content-Security-Policy': buildCsp(),
};

/** Attach all security headers to an outgoing NextResponse */
function applySecurityHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

export async function proxy(_request: NextRequest): Promise<NextResponse> {
  return applySecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: [
    /*
     * Run proxy on every route EXCEPT:
     * - static assets (_next/static, images)
     * - metadata (favicon, robots, sitemap)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?)$).*)',
  ],
};
