const crypto = require('crypto');
const { db } = require('../config/database');

// In-memory sliding window for ultra-fast telemetry calculations
const metricsWindow = {
  recentLatencies: [],
  maxLatenciesSize: 200,
  requestCounts: {
    total: 0,
    status2xx: 0,
    status3xx: 0,
    status4xx: 0,
    status5xx: 0
  },
  activeConnections: 0,
  startTime: Date.now()
};

const INSERT_REQUEST_SQL = `
  INSERT INTO telemetry_requests (trace_id, method, path, status_code, duration_ms, ip_address, user_id, user_agent)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
`;

const INSERT_SECURITY_SQL = `
  INSERT INTO telemetry_security_events (event_type, severity, details, ip_address, user_identifier)
  VALUES ($1, $2, $3, $4, $5)
`;

function logSecurityEvent(eventType, severity, details, ipAddress = '127.0.0.1', userIdentifier = 'ANONYMOUS') {
  return db.run(INSERT_SECURITY_SQL, [eventType, severity, details, ipAddress, userIdentifier])
    .catch((err) => {
      console.error('Failed to log security telemetry event:', err.message);
    });
}

function telemetryMiddleware(req, res, next) {
  // Exclude static assets from polluting database logs, but track them in memory
  const isStatic = req.path.startsWith('/css/') || req.path.startsWith('/js/') || req.path.startsWith('/assets/');
  const startTime = process.hrtime();
  const traceId = crypto.randomUUID();
  req.traceId = traceId;

  metricsWindow.activeConnections += 1;
  metricsWindow.requestCounts.total += 1;

  res.on('finish', () => {
    metricsWindow.activeConnections = Math.max(0, metricsWindow.activeConnections - 1);
    const diff = process.hrtime(startTime);
    const durationMs = parseFloat(((diff[0] * 1e3) + (diff[1] * 1e-6)).toFixed(2));

    // Update status distribution
    const code = res.statusCode;
    if (code >= 200 && code < 300) metricsWindow.requestCounts.status2xx += 1;
    else if (code >= 300 && code < 400) metricsWindow.requestCounts.status3xx += 1;
    else if (code >= 400 && code < 500) {
      metricsWindow.requestCounts.status4xx += 1;
      // Log 401 and 403 as security events
      if (code === 401 || code === 403) {
        logSecurityEvent(
          code === 401 ? 'UNAUTHORIZED_ACCESS_ATTEMPT' : 'FORBIDDEN_RESOURCE_ACCESS',
          'WARNING',
          `Path: ${req.method} ${req.originalUrl} - IP: ${req.ip || '127.0.0.1'}`,
          req.ip || '127.0.0.1',
          req.user ? req.user.email : 'UNAUTHENTICATED'
        );
      }
    } else if (code >= 500) {
      metricsWindow.requestCounts.status5xx += 1;
      logSecurityEvent(
        'SERVER_ERROR_5XX',
        'CRITICAL',
        `Internal error on ${req.method} ${req.originalUrl} - Code: ${code}`,
        req.ip || '127.0.0.1',
        req.user ? req.user.email : 'SYSTEM'
      );
    }

    // Sliding window of latencies
    metricsWindow.recentLatencies.push(durationMs);
    if (metricsWindow.recentLatencies.length > metricsWindow.maxLatenciesSize) {
      metricsWindow.recentLatencies.shift();
    }

    // Persist API request to database if not static
    if (!isStatic && (req.originalUrl.startsWith('/api/') || req.baseUrl.startsWith('/api/'))) {
      const ip = req.ip || (req.connection && req.connection.remoteAddress) || '127.0.0.1';
      const userId = req.user ? req.user.user_id : null;
      const userAgent = req.get('User-Agent') || 'Unknown';
      db.run(INSERT_REQUEST_SQL, [traceId, req.method, req.originalUrl, code, durationMs, ip, userId, userAgent.substring(0, 150)])
        .catch(() => {
          // Silently preserve stability
        });
    }
  });

  next();
}

function getTelemetrySnapshot() {
  const uptimeSeconds = Math.floor((Date.now() - metricsWindow.startTime) / 1000);
  const latencies = [...metricsWindow.recentLatencies].sort((a, b) => a - b);
  const avgLatency = latencies.length > 0 
    ? parseFloat((latencies.reduce((acc, v) => acc + v, 0) / latencies.length).toFixed(2)) 
    : 0;
  
  const p50 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.5)] : 0;
  const p95 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0;
  const maxLatency = latencies.length > 0 ? latencies[latencies.length - 1] : 0;

  const memoryUsage = process.memoryUsage();

  return {
    uptimeSeconds,
    activeConnections: metricsWindow.activeConnections,
    requestCounts: metricsWindow.requestCounts,
    latency: {
      averageMs: avgLatency,
      p50Ms: p50,
      p95Ms: p95,
      maxMs: maxLatency,
      sampleSize: latencies.length
    },
    system: {
      heapUsedMb: parseFloat((memoryUsage.heapUsed / 1024 / 1024).toFixed(2)),
      heapTotalMb: parseFloat((memoryUsage.heapTotal / 1024 / 1024).toFixed(2)),
      rssMb: parseFloat((memoryUsage.rss / 1024 / 1024).toFixed(2)),
      nodeVersion: process.version,
      platform: process.platform
    }
  };
}

module.exports = {
  telemetryMiddleware,
  logSecurityEvent,
  getTelemetrySnapshot
};
