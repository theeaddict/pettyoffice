// Shared in-memory rate limiter for all API endpoints.
// Tracks requests per IP using a sliding-window approach.
// Cleans up stale entries every 60 seconds.

const stores = new Map();
let cleanupTimer = null;

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || 'unknown';
}

export function rateLimit(req, { windowMs = 60000, max = 30, key = 'default' } = {}) {
  const ip = getClientIp(req);
  const now = Date.now();

  if (!stores.has(key)) stores.set(key, new Map());
  const store = stores.get(key);

  if (!store.has(ip)) store.set(ip, []);
  const timestamps = store.get(ip).filter(t => now - t < windowMs);

  if (timestamps.length >= max) {
    const oldest = timestamps[0];
    const retryAfter = Math.ceil((oldest + windowMs - now) / 1000);
    return { allowed: false, retryAfter, remaining: 0 };
  }

  timestamps.push(now);
  store.set(ip, timestamps);
  return { allowed: true, remaining: max - timestamps.length, retryAfter: 0 };
}

export function applyRateLimit(req, res, options) {
  const result = rateLimit(req, options);
  if (!result.allowed) {
    res.setHeader('Retry-After', String(result.retryAfter));
    res.setHeader('X-RateLimit-Limit', String(options.max || 30));
    res.setHeader('X-RateLimit-Remaining', '0');
    res.statusCode = 429;
    res.json({ error: 'Too many requests. Please slow down.' });
    return false;
  }
  res.setHeader('X-RateLimit-Limit', String(options.max || 30));
  res.setHeader('X-RateLimit-Remaining', String(result.remaining));
  return true;
}

// Periodic cleanup every 60 seconds
function startCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [, store] of stores) {
      for (const [ip, timestamps] of store) {
        const filtered = timestamps.filter(t => now - t < 120000);
        if (filtered.length === 0) store.delete(ip);
        else store.set(ip, filtered);
      }
    }
  }, 60000);
  if (cleanupTimer.unref) cleanupTimer.unref();
}
startCleanup();
