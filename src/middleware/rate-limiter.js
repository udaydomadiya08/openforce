/**
 * In-Memory Sliding Window Rate Limiter Middleware
 * Configurable via environment variables without requiring external daemon dependencies.
 * Protects against IP spoofing by refusing to trust X-Forwarded-For unless TRUST_PROXY is explicitly enabled.
 */

const ipBuckets = new Map();

export function createAuthRateLimiter(options = {}) {
  return function authRateLimiter(req, res, next) {
    const windowMs = options.windowMs || Number(process.env.RATE_LIMIT_AUTH_WINDOW_MS) || 15 * 60 * 1000;
    const maxRequests = options.max || Number(process.env.RATE_LIMIT_AUTH_MAX) || 20;

    // Safely determine client IP:
    // Only inspect X-Forwarded-For if TRUST_PROXY is explicitly enabled.
    const trustProxy = process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1';
    let ip = req.socket?.remoteAddress || '127.0.0.1';

    if (trustProxy && req.headers['x-forwarded-for']) {
      const forwarded = String(req.headers['x-forwarded-for']).split(',')[0].trim();
      if (forwarded) ip = forwarded;
    }

    const now = Date.now();
    const windowStart = now - windowMs;

    let timestamps = ipBuckets.get(ip) || [];
    // Prune requests older than current sliding window
    timestamps = timestamps.filter(ts => ts > windowStart);

    if (timestamps.length >= maxRequests) {
      const oldest = timestamps[0];
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
      res.setHeader('Retry-After', retryAfterSeconds);
      return res.status(429).json({
        error: 'Too many authentication attempts. Please try again later.'
      });
    }

    timestamps.push(now);
    ipBuckets.set(ip, timestamps);

    // Opportunistically prune idle IP buckets if map exceeds threshold
    if (ipBuckets.size > 500) {
      for (const [key, tsList] of ipBuckets.entries()) {
        const active = tsList.filter(t => t > windowStart);
        if (active.length === 0) {
          ipBuckets.delete(key);
        } else {
          ipBuckets.set(key, active);
        }
      }
    }

    next();
  };
}

/**
 * Reset all rate limiter buckets (used for clean test isolation)
 */
export function resetRateLimiter() {
  ipBuckets.clear();
}
