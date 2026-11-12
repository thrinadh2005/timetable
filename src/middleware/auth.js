const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const NODE_ENV = process.env.NODE_ENV || 'production';
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (NODE_ENV === 'production') {
    // Fail fast: an implicit/ephemeral signing secret in production would make
    // every issued token forgeable by anyone who knows the generator scheme.
    console.error('[FATAL] JWT_SECRET is not set. Refusing to start in production without an explicit signing secret. Set JWT_SECRET in the environment.');
    process.exit(1);
  }
  // Never fall back to a hard-coded, publicly known secret. Generate a strong
  // ephemeral secret instead so a development process is not trivially forgeable.
  JWT_SECRET = `GMRITDU_EPHEMERAL_${crypto.randomBytes(48).toString('hex')}`;
  console.warn('[SECURITY WARNING] JWT_SECRET is not set. Generated an ephemeral secret for this process only — sessions will be invalidated on restart. Set JWT_SECRET in the environment for production.');
} else if (NODE_ENV === 'production' && JWT_SECRET.length < 32) {
  console.warn('[SECURITY WARNING] JWT_SECRET is shorter than 32 characters. Use a high-entropy secret (>= 32 chars) in production.');
}

// In-memory token blacklist for immediate server-side session termination on logout
const tokenBlacklist = new Set();

function blacklistToken(token) {
  if (token) {
    tokenBlacklist.add(token);
    // Periodically clean up old tokens (after 24 hours)
    setTimeout(() => {
      tokenBlacklist.delete(token);
    }, 24 * 60 * 60 * 1000);
  }
}

function isTokenBlacklisted(token) {
  return tokenBlacklist.has(token);
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  } else if (
    req.query && req.query.token &&
    // The browser EventSource API cannot set an Authorization header, so the
    // SSE stream endpoint alone accepts the token as a query parameter.
    req.originalUrl.split('?')[0] === '/api/v1/notifications/stream'
  ) {
    token = req.query.token;
  }

  if (!token) {
    req.user = null;
    return next();
  }

  if (isTokenBlacklisted(token)) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    req.user = null;
    next();
  }
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'AUTHENTICATION_REQUIRED',
      message: 'Access denied. Valid authentication token required.'
    });
  }
  next();
}

function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Access denied. Please authenticate.'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'INSUFFICIENT_PRIVILEGES',
        message: `Forbidden. Role '${req.user.role}' does not possess required privileges.`
      });
    }

    next();
  };
}

module.exports = {
  JWT_SECRET,
  blacklistToken,
  isTokenBlacklisted,
  authenticateToken,
  requireAuth,
  requireRole
};

