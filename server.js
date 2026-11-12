const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const compression = require('compression');
require('dotenv').config();

const { db, initializeSchema, closePool, getDatabaseInfo } = require('./src/config/database');
const { seedDatabase } = require('./src/seed/seedData');
const { seedLabTimetables } = require('./src/seed/seedLabTimetables');
const { initBlockchainSchema } = require('./src/services/blockchainLedgerService');
const { authenticateToken } = require('./src/middleware/auth');
const { securityHeaders, sanitizeMiddleware } = require('./src/middleware/security');
const { telemetryMiddleware } = require('./src/middleware/telemetry');

// Route modules
const authRoutes = require('./src/routes/authRoutes');
const departmentRoutes = require('./src/routes/departmentRoutes');
const staffRoutes = require('./src/routes/staffRoutes');
const timetableRoutes = require('./src/routes/timetableRoutes');
const laboratoryRoutes = require('./src/routes/laboratoryRoutes');
const eventRoutes = require('./src/routes/eventRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const telemetryRoutes = require('./src/routes/telemetryRoutes');
const availabilityRoutes = require('./src/routes/availabilityRoutes');
const substitutionRoutes = require('./src/routes/substitutionRoutes');
const timetableIngestionRoutes = require('./src/routes/timetableIngestionRoutes');
const blockchainRoutes = require('./src/routes/blockchainRoutes');
const notificationRoutes = require('./src/routes/notificationRoutes');
const feedbackRoutes = require('./src/routes/feedbackRoutes');
const { seedDefaultAcademicEvents } = require('./src/services/eventService');

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'production';

// Do not advertise the framework via the X-Powered-By response header.
app.disable('x-powered-by');

// Async database schema & institutional seed initialization
let bootstrapPromise = null;
async function bootstrap() {
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = (async () => {
    await initializeSchema();
    await initBlockchainSchema();
    await seedDatabase();
    await seedLabTimetables();
    await seedDefaultAcademicEvents();
  })();
  return bootstrapPromise;
}

// Global Middlewares
app.use(compression());

// CORS: only explicitly allowed origins may call the API cross-origin. Same-origin
// requests (the bundled SPA) carry no Origin header and are always permitted.
// Configure additional origins via the comma-separated CORS_ORIGINS env variable.
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // In the default (unconfigured) state only allow local development origins.
    if (allowedOrigins.length === 0) {
      try {
        const host = new URL(origin).hostname;
        if (host === 'localhost' || host === '127.0.0.1') return callback(null, true);
      } catch (e) { /* malformed origin -> reject */ }
    }
    return callback(null, false);
  },
  credentials: true
}));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(securityHeaders);
app.use(sanitizeMiddleware);
app.use(telemetryMiddleware);
app.use(authenticateToken);

// Production-ready static asset serving with caching
const enableCache = NODE_ENV === 'production' && process.env.ENABLE_STATIC_CACHE === 'true';
const staticOptions = {
  maxAge: enableCache ? '1d' : 0,
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    if (!enableCache || filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    }
  }
};
app.use(express.static(path.join(__dirname, 'public'), staticOptions));
app.use('/_expo', express.static(path.join(__dirname, 'mobile', 'dist', '_expo')));
app.use('/mobile-app', express.static(path.join(__dirname, 'mobile', 'dist')));
app.get(['/mobile-app', '/mobile-app/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'mobile', 'dist', 'index.html'));
});

// Production Health Check & Liveness Probes
app.get(['/health', '/healthz', '/api/v1/health'], async (req, res) => {
  try {
    const dbPing = await db.get('SELECT 1 as alive');
    const staffCount = await db.get('SELECT COUNT(*)::int as count FROM staff');
    const dbInfo = getDatabaseInfo();
    const uptimeSec = Math.floor(process.uptime());

    res.status(200).json({
      status: 'UP',
      institutionalSystem: 'GMRITDU Class & Laboratory Timetable Architecture',
      environment: NODE_ENV,
      timestamp: new Date().toISOString(),
      uptimeSeconds: uptimeSec,
      database: {
        engine: dbInfo.engine,
        connected: Boolean(dbPing && dbPing.alive === 1),
        staffRecords: staffCount ? staffCount.count : 0
      },
      memory: {
        rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
        heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`
      }
    });
  } catch (err) {
    res.status(503).json({
      status: 'DEGRADED',
      error: err.message
    });
  }
});

// Mount API Endpoints
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/departments', departmentRoutes);
app.use('/api/v1/staff', staffRoutes);
app.use('/api/v1/timetables/ingest', timetableIngestionRoutes);
app.use('/api/v1/ingestion', timetableIngestionRoutes);
app.use('/api/v1/timetables', timetableRoutes);
app.use('/api/v1/laboratories', laboratoryRoutes);
app.use('/api/v1/events', eventRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/telemetry', telemetryRoutes);
app.use('/api/v1/availability', availabilityRoutes);
app.use('/api/v1/substitutions', substitutionRoutes);
app.use('/api/v1/blockchain', blockchainRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/feedback', feedbackRoutes);

// Single Page Application Fallback (Express 5 compatible)
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      success: false,
      error: 'ENDPOINT_NOT_FOUND',
      message: `The requested endpoint '${req.originalUrl}' does not exist on this institutional server.`
    });
  }
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  res.status(200).json({
    status: 'READY_FOR_FRONTEND',
    institutionalSystem: 'GMRITDU Class & Laboratory Timetable Architecture',
    message: 'Backend API is fully operational and waiting for the new frontend folder to be placed into /public.',
    endpoints: {
      health: '/api/v1/health',
      auth: '/api/v1/auth/login',
      timetables: '/api/v1/timetables/section',
      hierarchy: '/api/v1/timetables/hierarchy',
      laboratories: '/api/v1/laboratories',
      availability: '/api/v1/availability/overview',
      staff: '/api/v1/staff',
      departments: '/api/v1/departments',
      notifications: '/api/v1/notifications',
      feedback: '/api/v1/feedback'
    }
  });
});

// Centralized Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Exception:', err);
  const isDev = NODE_ENV === 'development';
  res.status(500).json({
    success: false,
    error: 'INTERNAL_SERVER_ERROR',
    message: isDev ? err.message : 'An unexpected institutional server error occurred. Please contact IT support.',
    ...(isDev && { stack: err.stack })
  });
});

let server = null;
if (require.main === module) {
  bootstrap()
    .then(() => {
      server = app.listen(PORT, () => {
        console.log(`================================================================`);
        console.log(`  GMRITDU Timetable Management System Server is ONLINE`);
        console.log(`  Access URL:  http://localhost:${PORT}`);
        console.log(`  Environment: ${NODE_ENV}`);
        console.log(`  Health Check: http://localhost:${PORT}/api/v1/health`);
        console.log(`================================================================`);
      });
    })
    .catch((err) => {
      console.error('Failed to bootstrap GMRITDU Timetable Server:', err);
      process.exit(1);
    });

  // Graceful shutdown
  const gracefulShutdown = async (signal) => {
    console.log(`Received ${signal}. Gracefully shutting down institutional server...`);
    const finish = async () => {
      try {
        await closePool();
        console.log('Database connection pool cleanly closed.');
      } catch (e) {
        // ignore
      }
      console.log('Server process terminated cleanly.');
      process.exit(0);
    };

    if (server) {
      server.close(() => {
        finish();
      });
    } else {
      await finish();
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

app.bootstrap = bootstrap;
module.exports = app;
