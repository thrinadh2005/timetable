const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { db } = require('../config/database');
const { logSecurityEvent } = require('../middleware/telemetry');

const EMERGENCY_MASTER_KEY = process.env.ADMIN_EMERGENCY_KEY || null;

async function initiateRecovery(data, ipAddress = '127.0.0.1') {
  const { variant, identifier, departmentId, admissionYear } = data;
  const mobileLast4 = data.mobileLast4 || data.mobileDigits;
  const emergencyKey = data.emergencyKey || data.masterKey;

  if (!identifier) {
    throw new Error('Please provide your institutional email address or PNR / Roll number.');
  }

  const cleanId = identifier.trim();
  const user = await db.get(
    `
      SELECT * FROM users 
      WHERE LOWER(email) = LOWER($1) OR UPPER(pnrno) = UPPER($2)
    `,
    [cleanId, cleanId]
  );

  if (!user) {
    logSecurityEvent('RECOVERY_FAILED_UNKNOWN_USER', 'WARNING', `Password recovery failed for non-existent identifier: ${cleanId}`, ipAddress, cleanId);
    throw new Error('No registered institutional account found matching this identifier. Please verify your details.');
  }

  if (user.status !== 'ACTIVE') {
    throw new Error(`Your account is currently ${user.status}. Please contact the Academic Administration Office.`);
  }

  const resetId = `RST-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;
  const resetToken = `TKN-${crypto.randomBytes(24).toString('hex')}`;
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  if (variant === 'EMAIL_OTP') {
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    await db.run(
      `
        INSERT INTO password_resets (reset_id, user_id, identifier, recovery_variant, otp_code, reset_token, expires_at, used)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 0)
      `,
      [resetId, user.user_id, user.email, 'EMAIL_OTP', otpCode, resetToken, expiresAt]
    );

    logSecurityEvent('RECOVERY_OTP_DISPATCHED', 'INFO', `Password reset OTP generated for ${user.email}`, ipAddress, user.email);

    const [userPart, domain] = user.email.split('@');
    const maskedUser = userPart.length > 2
      ? `${userPart[0]}***${userPart[userPart.length - 1]}`
      : `${userPart[0]}***`;
    const maskedEmail = `${maskedUser}@${domain}`;

    const discloseOtp = process.env.NODE_ENV === 'development' || process.env.SANDBOX_DISCLOSE_OTP === 'true';

    return {
      success: true,
      variant: 'EMAIL_OTP',
      resetToken,
      maskedEmail,
      ...(discloseOtp ? { demoOtp: otpCode } : {}),
      message: `A 6-digit recovery OTP has been generated for your registered institutional email (${maskedEmail}). Valid for 15 minutes.`
    };
  } else if (variant === 'SECURITY_VERIFY') {
    if (!departmentId) {
      throw new Error('Please select your registered academic department.');
    }

    if (user.department_id && user.department_id.toUpperCase() !== departmentId.toUpperCase()) {
      logSecurityEvent('RECOVERY_SECURITY_VERIFY_FAILED', 'WARNING', `Dept mismatch for ${user.pnrno}: expected ${user.department_id}, got ${departmentId}`, ipAddress, user.pnrno);
      throw new Error('Department verification failed. The selected department does not match account records.');
    }

    if (admissionYear) {
      const yearStr = String(admissionYear).trim();
      const pnrPrefix = user.pnrno.substring(0, 2);
      if (yearStr !== `20${pnrPrefix}` && yearStr !== pnrPrefix) {
        logSecurityEvent('RECOVERY_SECURITY_VERIFY_FAILED', 'WARNING', `Admission year mismatch for ${user.pnrno}`, ipAddress, user.pnrno);
        throw new Error('Admission / Enrolment year verification failed.');
      }
    }

    if (mobileLast4 && user.mobile_number) {
      const cleanMobile = user.mobile_number.replace(/\D/g, '');
      if (!cleanMobile.endsWith(mobileLast4.trim())) {
        throw new Error('Mobile number verification failed.');
      }
    }

    await db.run(
      `
        INSERT INTO password_resets (reset_id, user_id, identifier, recovery_variant, otp_code, reset_token, expires_at, used)
        VALUES ($1, $2, $3, $4, NULL, $5, $6, 0)
      `,
      [resetId, user.user_id, user.pnrno, 'SECURITY_VERIFY', resetToken, expiresAt]
    );

    logSecurityEvent('RECOVERY_IDENTITY_VERIFIED', 'INFO', `Identity verified via academic records for ${user.pnrno}`, ipAddress, user.pnrno);

    return {
      success: true,
      variant: 'SECURITY_VERIFY',
      resetToken,
      verifiedUser: {
        pnr: user.pnrno,
        fullName: user.full_name,
        department: user.department_id
      },
      message: 'Identity records verified successfully. Please enter your new password.'
    };
  } else if (variant === 'ADMIN_EMERGENCY') {
    if (!EMERGENCY_MASTER_KEY) {
      logSecurityEvent('RECOVERY_EMERGENCY_DISABLED', 'CRITICAL', `Emergency recovery attempted but the feature is not configured for: ${cleanId}`, ipAddress, cleanId);
      throw new Error('Administrative emergency recovery is disabled. Contact IT to configure the ADMIN_EMERGENCY_KEY.');
    }
    if (!emergencyKey || emergencyKey.trim() !== EMERGENCY_MASTER_KEY) {
      logSecurityEvent('RECOVERY_EMERGENCY_KEY_INVALID', 'CRITICAL', `Invalid emergency key attempt for user: ${cleanId}`, ipAddress, cleanId);
      throw new Error('Invalid Administrative Master Emergency Key.');
    }

    await db.run(
      `
        INSERT INTO password_resets (reset_id, user_id, identifier, recovery_variant, otp_code, reset_token, expires_at, used)
        VALUES ($1, $2, $3, $4, NULL, $5, $6, 0)
      `,
      [resetId, user.user_id, cleanId, 'ADMIN_EMERGENCY', resetToken, expiresAt]
    );

    logSecurityEvent('RECOVERY_EMERGENCY_BYPASS_AUTHORIZED', 'CRITICAL', `Emergency administrative recovery authorized for ${user.pnrno}`, ipAddress, user.email);

    return {
      success: true,
      variant: 'ADMIN_EMERGENCY',
      resetToken,
      message: 'Administrative emergency key authorized. Please set a new secure password.'
    };
  } else {
    throw new Error('Invalid recovery variant specified. Supported variants: EMAIL_OTP, SECURITY_VERIFY, ADMIN_EMERGENCY.');
  }
}

async function verifyOtpCode(resetToken, otpCode, ipAddress = '127.0.0.1') {
  if (!resetToken || !otpCode) {
    throw new Error('Reset token and 6-digit OTP code are required.');
  }

  const record = await db.get(
    `
      SELECT * FROM password_resets
      WHERE reset_token = $1 AND used = 0
    `,
    [resetToken.trim()]
  );

  if (!record) {
    throw new Error('Invalid or expired password reset session. Please request a new recovery code.');
  }

  if (new Date(record.expires_at).getTime() < Date.now()) {
    throw new Error('The recovery OTP code has expired (15-minute window exceeded). Please request a fresh code.');
  }

  if (record.otp_code !== otpCode.trim()) {
    logSecurityEvent('RECOVERY_OTP_MISMATCH', 'WARNING', `Incorrect OTP attempt for reset session ${resetToken}`, ipAddress, record.identifier);
    throw new Error('Incorrect 6-digit OTP code. Please check your official email and try again.');
  }

  return {
    success: true,
    resetToken,
    message: 'OTP verified successfully. You may now create your new password.'
  };
}

async function resetPassword(resetToken, newPassword, confirmPassword, ipAddress = '127.0.0.1') {
  if (!resetToken || !newPassword || !confirmPassword) {
    throw new Error('Reset token, new password, and confirmation password are required.');
  }

  if (newPassword !== confirmPassword) {
    throw new Error('New password and confirmation password do not match.');
  }

  if (newPassword.length < 8) {
    throw new Error('Password must be at least 8 characters in length.');
  }

  const record = await db.get(
    `
      SELECT * FROM password_resets
      WHERE reset_token = $1 AND used = 0
    `,
    [resetToken.trim()]
  );

  if (!record) {
    throw new Error('Invalid or expired password reset session.');
  }

  if (new Date(record.expires_at).getTime() < Date.now()) {
    throw new Error('This password reset session has expired. Please initiate recovery again.');
  }

  const salt = bcrypt.genSaltSync(12);
  const passwordHash = bcrypt.hashSync(newPassword, salt);

  await db.transaction(async (tx) => {
    await tx.run('UPDATE users SET password_hash = $1 WHERE user_id = $2', [passwordHash, record.user_id]);
    await tx.run('UPDATE password_resets SET used = 1 WHERE reset_id = $1', [record.reset_id]);
    await tx.run(
      `
        INSERT INTO audit_logs (log_id, admin_id, admin_name, action, entity_name, entity_id, old_value, new_value, ip_address)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        `AUD-${crypto.randomUUID().substring(0, 8).toUpperCase()}`,
        record.user_id,
        record.identifier,
        'PASSWORD_RECOVERY_COMPLETED',
        'USER_CREDENTIALS',
        record.user_id,
        `Variant: ${record.recovery_variant}`,
        'PASSWORD_HASH_UPDATED_BCRYPT',
        ipAddress
      ]
    );
  });

  logSecurityEvent('PASSWORD_RESET_SUCCESS', 'INFO', `Password updated successfully via ${record.recovery_variant} for user ${record.user_id}`, ipAddress, record.identifier);

  return {
    success: true,
    message: 'Institutional password has been updated successfully. You can now sign in with your new credentials.'
  };
}

module.exports = {
  initiateRecovery,
  verifyOtpCode,
  resetPassword,
  EMERGENCY_MASTER_KEY
};
