const express = require('express');
const router = express.Router();
const {
  getBlockchainSummary,
  getRecentBlocks,
  validateChainIntegrity,
  authenticateDemoAccount
} = require('../services/blockchainLedgerService');
const { rateLimiter } = require('../middleware/security');

// Get overall blockchain status & demo account listing
router.get('/status', async (req, res) => {
  try {
    const summary = await getBlockchainSummary();
    res.json({
      success: true,
      data: summary
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'BLOCKCHAIN_STATUS_ERROR',
      message: err.message
    });
  }
});

// Get recent mined blocks
router.get('/blocks', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    const blocks = await getRecentBlocks(limit);
    res.json({
      success: true,
      data: blocks
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'BLOCKS_FETCH_ERROR',
      message: err.message
    });
  }
});

// Cryptographic chain integrity audit
router.get('/verify', async (req, res) => {
  try {
    const integrity = await validateChainIntegrity();
    res.json({
      success: true,
      data: integrity
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'INTEGRITY_AUDIT_ERROR',
      message: err.message
    });
  }
});

// Instant Demo Account authentication is disabled per strict RBAC requirements
router.post('/demo-login', (req, res) => {
  return res.status(403).json({
    success: false,
    error: 'DEMO_LOGIN_DISABLED',
    message: 'Demo logins and instant role-switching have been disabled per enterprise institutional security policy. Use authorized institutional credentials to sign in.'
  });
});

module.exports = router;

