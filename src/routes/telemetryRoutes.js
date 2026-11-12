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

// Full Telemetry Dashboard API (Super Admin / Dean only)
router.get('/', requireAuth, requireRole(['SUPER_ADMIN', 'DEAN']), async (req, res) => {
  try {
    const data = await getTelemetryData();
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
