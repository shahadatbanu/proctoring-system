/**
 * middleware/rateLimit.js
 * Simple in-memory rate limiter (no Redis needed for local dev).
 * For production, swap with express-rate-limit + redis store.
 */

const requests = new Map(); // ip → [timestamps]

/**
 * @param {number} maxRequests  - max allowed in window
 * @param {number} windowMs     - window size in ms
 */
function rateLimit(maxRequests = 100, windowMs = 60_000) {
  return (req, res, next) => {
    const ip  = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();

    if (!requests.has(ip)) requests.set(ip, []);
    const hits = requests.get(ip).filter(t => now - t < windowMs);
    hits.push(now);
    requests.set(ip, hits);

    if (hits.length > maxRequests) {
      return res.status(429).json({
        error: 'Too many requests — please slow down',
        retryAfter: Math.ceil(windowMs / 1000),
      });
    }
    next();
  };
}

// Clean up old entries every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [ip, hits] of requests.entries()) {
    const fresh = hits.filter(t => now - t < 300_000);
    if (fresh.length === 0) requests.delete(ip);
    else requests.set(ip, fresh);
  }
}, 300_000);

module.exports = { rateLimit };
