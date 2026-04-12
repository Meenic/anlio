import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * Routes that require a valid session.
 * Any unlisted subroute under these prefixes is also protected.
 */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/settings",
  "/account",
  "/admin",
] as const;

/**
 * Routes that authenticated users should not be able to visit.
 */
const AUTH_PREFIXES = ["/login", "/register", "/forgot-password"] as const;

/**
 * Routes that bypass all auth logic entirely.
 */
const PUBLIC_PREFIXES = ["/api/auth", "/api/health", "/api/webhooks"] as const;

/**
 * Content-Security-Policy configuration.
 * Tighten once inline scripts/styles are audited.
 */
const CSP_DIRECTIVES: Record<string, string> = {
  "default-src": "'self'",
  "script-src": "'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src": "'self' 'unsafe-inline'",
  "img-src": "'self' data: blob: https:",
  "font-src": "'self'",
  "connect-src": "'self' ws: localhost:*",
  "media-src": "'self'",
  "object-src": "'none'",
  "child-src": "'none'",
  "frame-src": "'none'",
  "frame-ancestors": "'none'",
  "form-action": "'self'",
  "base-uri": "'self'",
  "manifest-src": "'self'",
  "worker-src": "'self' blob:",
  "upgrade-insecure-requests": "",
};

function buildCsp(): string {
  return Object.entries(CSP_DIRECTIVES)
    .map(([directive, value]) => (value ? `${directive} ${value}` : directive))
    .join("; ");
}

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "0", // Handled by CSP
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": [
    "camera=()",
    "microphone=()",
    "geolocation=()",
    "interest-cohort=()",
    "payment=()",
    "usb=()",
  ].join(", "),
  "X-DNS-Prefetch-Control": "on",
  "X-Permitted-Cross-Domain-Policies": "none",
  "Content-Security-Policy": buildCsp(),
};

/** Attach all security headers to an outgoing NextResponse */
function applySecurityHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

/**
 * Attach a unique request ID for correlation.
 * Accessible via: headers().get("x-request-id")
 */
function injectRequestId(
  request: NextRequest,
  response: NextResponse,
): NextResponse {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  response.headers.set("x-request-id", requestId);
  response.headers.set("x-forwarded-request-id", requestId);
  return response;
}

function matchesPrefixes(
  pathname: string,
  prefixes: readonly string[],
): boolean {
  return prefixes.some(
    (prefix) =>
      pathname === prefix ||
      pathname.startsWith(`${prefix}/`) ||
      pathname.startsWith(`${prefix}?`),
  );
}

function allowRequest(request: NextRequest): NextResponse {
  const response = NextResponse.next();
  applySecurityHeaders(response);
  injectRequestId(request, response);
  return response;
}

/**
 * Redirects to login and preserves the original destination.
 */
function redirectToLogin(request: NextRequest): NextResponse {
  const loginUrl = new URL("/login", request.url);
  const { pathname, search } = request.nextUrl;

  const isSafeRedirectTarget =
    pathname.startsWith("/") &&
    !pathname.startsWith("//") &&
    pathname.length < 512;

  if (isSafeRedirectTarget) {
    loginUrl.searchParams.set("redirectTo", `${pathname}${search}`);
  }

  const response = NextResponse.redirect(loginUrl);
  applySecurityHeaders(response);
  return response;
}

function redirectToDashboard(request: NextRequest): NextResponse {
  const rawRedirect = request.nextUrl.searchParams.get("redirectTo");
  const safeDest =
    rawRedirect &&
    rawRedirect.startsWith("/") &&
    !rawRedirect.startsWith("//") &&
    rawRedirect.length < 512
      ? rawRedirect
      : "/dashboard";

  const response = NextResponse.redirect(new URL(safeDest, request.url));
  applySecurityHeaders(response);
  return response;
}

async function getSession(request: NextRequest) {
  try {
    return await auth.api.getSession({ headers: request.headers });
  } catch (error) {
    console.error("[proxy] getSession failed:", error);
    return null;
  }
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (matchesPrefixes(pathname, PUBLIC_PREFIXES)) {
    return allowRequest(request);
  }

  const isProtected = matchesPrefixes(pathname, PROTECTED_PREFIXES);
  const isAuthRoute = matchesPrefixes(pathname, AUTH_PREFIXES);

  if (!isProtected && !isAuthRoute) {
    return allowRequest(request);
  }

  const session = await getSession(request);
  const isAuthenticated = session !== null;

  if (isProtected && !isAuthenticated) {
    return redirectToLogin(request);
  }

  if (isAuthRoute && isAuthenticated) {
    return redirectToDashboard(request);
  }

  const response = allowRequest(request);

  if (session?.user.id) {
    // Inject headers for easy access in RSCs/Handlers
    response.headers.set("x-user-id", session.user.id);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Run proxy on every route EXCEPT:
     * - static assets (_next/static, images)
     * - metadata (favicon, robots, sitemap)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?)$).*)",
  ],
};
