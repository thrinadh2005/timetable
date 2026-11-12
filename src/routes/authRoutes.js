const express = require('express');
const router = express.Router();
const { registerUser, loginUser, handleOAuthSSO } = require('../services/authService');
const { requireAuth, blacklistToken } = require('../middleware/auth');
const { rateLimiter, checkIdentifierLockout, recordFailedLoginAttempt, resetLoginAttempts } = require('../middleware/security');

// Rate limit authentication attempts
router.post('/register', rateLimiter(20, 60000), async (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const result = await registerUser(req.body, ip);
    res.status(201).json({
      success: true,
      message: 'Account registered successfully. You may now log in.',
      data: result
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: 'REGISTRATION_ERROR',
      message: err.message
    });
  }
});

router.post('/login', rateLimiter(30, 60000), async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
  const { identifier, password } = req.body || {};

  if (identifier && checkIdentifierLockout(identifier).locked) {
    return res.status(429).json({
      success: false,
      error: 'ACCOUNT_TEMPORARILY_LOCKED',
      message: 'Too many failed sign-in attempts. Please wait 5 minutes before trying again.'
    });
  }

  try {
    const result = await loginUser(identifier, password, ip);
    if (identifier) resetLoginAttempts(identifier);
    res.json({
      success: true,
      message: 'Authentication successful.',
      data: result
    });
  } catch (err) {
    if (identifier) recordFailedLoginAttempt(identifier);
    res.status(401).json({
      success: false,
      error: 'AUTHENTICATION_FAILED',
      message: err.message
    });
  }
});

// Single Sign-On (Google Workspace)
router.post('/sso/google', rateLimiter(30, 60000), async (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const { email, fullName, sub, departmentId } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Google account email is required.' });
    }
    const result = await handleOAuthSSO('GOOGLE', { email, fullName, sub, departmentId }, ip);
    res.json({
      success: true,
      message: 'Google Single Sign-On successful.',
      data: result
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: 'SSO_ERROR',
      message: err.message
    });
  }
});

// Single Sign-On (Microsoft Entra ID / Office 365)
router.post('/sso/microsoft', rateLimiter(30, 60000), async (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const { email, fullName, sub, departmentId } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Microsoft account email is required.' });
    }
    const result = await handleOAuthSSO('MICROSOFT', { email, fullName, sub, departmentId }, ip);
    res.json({
      success: true,
      message: 'Microsoft Entra ID Single Sign-On successful.',
      data: result
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: 'SSO_ERROR',
      message: err.message
    });
  }
});

// Password Recovery Multi-Variant Endpoints
const { initiateRecovery, verifyOtpCode, resetPassword } = require('../services/passwordRecoveryService');

router.post('/recovery/initiate', rateLimiter(20, 60000), async (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const result = await initiateRecovery(req.body, ip);
    res.json({
      success: true,
      message: result.message,
      data: {
        resetToken: result.resetToken,
        maskedEmail: result.maskedEmail,
        demoOtpCode: result.demoOtp,
        verifiedUser: result.user,
        authorizedAdmin: result.admin
      },
      ...result
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: 'RECOVERY_INITIATE_FAILED',
      message: err.message
    });
  }
});

router.post('/recovery/verify-otp', rateLimiter(20, 60000), async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
  const lockKey = `otp:${req.body && req.body.resetToken ? req.body.resetToken : ip}`;

  if (checkIdentifierLockout(lockKey).locked) {
    return res.status(429).json({
      success: false,
      error: 'OTP_TEMPORARILY_LOCKED',
      message: 'Too many incorrect verification attempts. Please request a new recovery code.'
    });
  }

  try {
    const result = await verifyOtpCode(req.body.resetToken, req.body.otp, ip);
    resetLoginAttempts(lockKey);
    res.json({
      success: true,
      message: result.message,
      data: result,
      ...result
    });
  } catch (err) {
    recordFailedLoginAttempt(lockKey);
    res.status(400).json({
      success: false,
      error: 'OTP_VERIFICATION_FAILED',
      message: err.message
    });
  }
});

router.post('/recovery/reset-password', rateLimiter(20, 60000), async (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const result = await resetPassword(req.body.resetToken, req.body.newPassword, req.body.confirmPassword, ip);
    res.json({
      success: true,
      message: result.message,
      data: result,
      ...result
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: 'PASSWORD_RESET_FAILED',
      message: err.message
    });
  }
});

router.post('/logout', (req, res) => {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    blacklistToken(token);
  }
  res.json({
    success: true,
    message: 'Session terminated and token invalidated on server.'
  });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({
    success: true,
    data: req.user
  });
});

// Authenticated User Password Change
router.post('/change-password', requireAuth, rateLimiter(15, 60000), async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'Current password, new password, and confirmation are required.' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'New password and confirmation do not match.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'New password must be at least 8 characters long.' });
    }

    const { db } = require('../config/database');
    const bcrypt = require('bcryptjs');
    const user = await db.get('SELECT user_id, password_hash FROM users WHERE user_id = $1', [req.user.userId]);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User record not found.' });
    }

    const matches = await bcrypt.compare(currentPassword, user.password_hash);
    if (!matches) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
    }

    const salt = await bcrypt.genSalt(12);
    const newHash = await bcrypt.hash(newPassword, salt);
    await db.run('UPDATE users SET password_hash = $1 WHERE user_id = $2', [newHash, user.user_id]);

    res.json({
      success: true,
      message: 'Password changed successfully.'
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

module.exports = router;
