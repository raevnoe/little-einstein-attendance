// Security headers for every API response (Phase 11). No package needed for a JSON API.
//   Cache-Control: no-store     student, attendance and performance data must never be kept
//                               by the browser, a proxy, or (later) the PWA service worker
//   X-Content-Type-Options      no MIME sniffing of JSON responses
//   Referrer-Policy             never leak API URLs (which contain IDs) to other sites
//   X-Frame-Options / CSP       API responses can never be framed or run anything
// Hosting headers for the React app itself (HSTS, its own CSP) belong to deployment.
export function securityHeaders(req, res, next) {
  res.set({
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  });
  next();
}
