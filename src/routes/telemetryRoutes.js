const express = require('express');
const router = express.Router();
const { getTelemetryData } = require('../services/telemetryService');
const { getTelemetrySnapshot } = require('../middleware/telemetry');
const { requireAuth, requireRole } = require('../middleware/auth');

// Public health check endpoint
router.get('/health', (req, res) => {
  const snapshot = getTelemetrySnapshot();
  res.json({
    status: 'HEALTHY',
    timestamp: new Date().toISOString(),
    uptimeSeconds: snapshot.uptimeSeconds,
    nodeVersion: snapshot.system.nodeVersion,
    memoryRssMb: snapshot.system.rssMb
  });
});

// Full Telemetry Dashboard API (Super Admin / Dean / HOD full access; safe metrics for other authenticated roles)
router.get('/', requireAuth, async (req, res) => {
  try {
    const isGovernor = ['SUPER_ADMIN', 'DEAN', 'DEPT_ADMIN'].includes(req.user.role);
    const data = await getTelemetryData();
    if (!isGovernor) {
      return res.json({
        success: true,
        timestamp: new Date().toISOString(),
        data: {
          systemSnapshot: data.systemSnapshot,
          dbStats: data.dbStats,
          recentRequests: [],
          securityEvents: [],
          auditLogs: []
        }
      });
    }
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      data
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'TELEMETRY_FETCH_ERROR',
      message: err.message
    });
  }
});

module.exports = router;
