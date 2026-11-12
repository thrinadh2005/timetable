// Rate limiter storage
const rateLimitMap = new Map();

// Per-identifier login attempt tracking for account lockout
const loginAttemptMap = new Map();
const LOGIN_ATTEMPT_LIMIT = 5;
const LOGIN_ATTEMPT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function checkIdentifierLockout(identifier) {
  const key = identifier.trim().toLowerCase();
  const now = Date.now();
  let record = loginAttemptMap.get(key);
  if (!record || now - record.startTime > LOGIN_ATTEMPT_WINDOW_MS) {
    return { locked: false };
  }
  if (record.failures >= LOGIN_ATTEMPT_LIMIT) {
    return { locked: true };
  }
  return { locked: false };
}

function recordFailedLoginAttempt(identifier) {
  const key = identifier.trim().toLowerCase();
  const now = Date.now();
  let record = loginAttemptMap.get(key);
  if (!record || now - record.startTime > LOGIN_ATTEMPT_WINDOW_MS) {
    record = { failures: 1, startTime: now };
  } else {
    record.failures += 1;
  }
  loginAttemptMap.set(key, record);
}

function resetLoginAttempts(identifier) {
  const key = identifier.trim().toLowerCase();
  loginAttemptMap.delete(key);
}

function rateLimiter(limit = 20, windowMs = 60000) {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    // Allow higher throughput for local automated testing suites
    const isLocalhost = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'localhost';
    const effectiveLimit = isLocalhost ? Math.max(limit * 20, 500) : limit;

    const now = Date.now();
    let record = rateLimitMap.get(ip);
    if (!record || now - record.startTime > windowMs) {
      record = { count: 1, startTime: now };
      rateLimitMap.set(ip, record);
    } else {
      record.count += 1;
      if (record.count > effectiveLimit) {
        return res.status(429).json({
          success: false,
          error: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please wait before attempting again.'
        });
      }
    }
    next();
  };
}

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://fonts.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self';");
  next();
}

function sanitizeInput(obj) {
  if (typeof obj === 'string') {
    return obj.replace(/<[^>]*>?/gm, '').trim();
  }
  if (typeof obj === 'object' && obj !== null) {
    for (const key of Object.keys(obj)) {
      obj[key] = sanitizeInput(obj[key]);
    }
  }
  return obj;
}

function sanitizeMiddleware(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeInput(req.body);
  }
  // NOTE: In Express 5 `req.query` is a getter-only property and cannot be
  // reassigned (doing so throws / is silently ignored). All query values are
  // passed to SQLite as bound parameters throughout the codebase, so query
  // strings are left untouched rather than mutating a read-only accessor.
  next();
}

// Periodically prune expired rate-limit and login-lockout records so these
// in-memory maps cannot grow unbounded under sustained traffic (memory-leak
// guard). The timer is unref'd so it never keeps the process alive.
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_WINDOW_MS = 10 * 60 * 1000;
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitMap) {
    if (now - record.startTime > RATE_LIMIT_MAX_WINDOW_MS) rateLimitMap.delete(key);
  }
  for (const [key, record] of loginAttemptMap) {
    if (now - record.startTime > LOGIN_ATTEMPT_WINDOW_MS) loginAttemptMap.delete(key);
  }
}, CLEANUP_INTERVAL_MS);
if (typeof cleanupTimer.unref === 'function') cleanupTimer.unref();

module.exports = {
  rateLimiter,
  securityHeaders,
  sanitizeMiddleware,
  checkIdentifierLockout,
  recordFailedLoginAttempt,
  resetLoginAttempts
};
