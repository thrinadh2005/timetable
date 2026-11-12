const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { db } = require('../config/database');
const { JWT_SECRET } = require('../middleware/auth');
const { logSecurityEvent } = require('../middleware/telemetry');
const { recordSessionOnChain } = require('./blockchainLedgerService');

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h';

/**
 * Resolves authoritative scope claims embedded into the session token:
 *  - DEAN  -> schoolId  (school-wide governance scope)
 *  - STUDENT -> sectionId (their enrolled timetable cohort)
 */
async function buildScopeClaims(user) {
  const claims = {};
  if (user.role === 'DEAN') {
    const row = await db.get('SELECT school_id FROM dean_school_assignments WHERE user_id = $1', [user.user_id]);
    if (row) claims.schoolId = row.school_id;
  } else if (user.role === 'STUDENT') {
    const row = await db.get('SELECT section_id FROM user_section_assignments WHERE user_id = $1', [user.user_id]);
    if (row) claims.sectionId = row.section_id;
  }
  return claims;
}

async function registerUser(data, ipAddress = '127.0.0.1') {
  const { fullName, pnrno, email, mobileNumber, role, departmentId, password, confirmPassword } = data;

  if (!fullName || !pnrno || !email || !role || !password) {
    throw new Error('All mandatory fields must be provided.');
  }

  if (password !== confirmPassword) {
    throw new Error('Password and confirmation password do not match.');
  }

  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters in length.');
  }

  const emailDomain = email.trim().toLowerCase().split('@')[1];
  if (!emailDomain || (emailDomain !== 'gmrit.edu.in' && emailDomain !== 'gmritdu.edu.in')) {
    logSecurityEvent('INVALID_REGISTRATION_DOMAIN', 'WARNING', `Registration attempt blocked for non-institutional domain: ${email}`, ipAddress, email);
    throw new Error('Registration is restricted to verified institutional email addresses (@gmrit.edu.in or @gmritdu.edu.in) only.');
  }

  const normPnr = pnrno.trim().toUpperCase();
  const normEmail = email.trim().toLowerCase();

  const existing = await db.get(
    'SELECT pnrno, email FROM users WHERE pnrno = $1 OR email = $2',
    [normPnr, normEmail]
  );
  if (existing) {
    logSecurityEvent('DUPLICATE_REGISTRATION_ATTEMPT', 'WARNING', `PNRNO: ${pnrno} or Email: ${email} already registered.`, ipAddress, email);
    throw new Error('An account with this PNRNO or Email is already registered in the system.');
  }

  const salt = bcrypt.genSaltSync(12);
  const passwordHash = bcrypt.hashSync(password, salt);
  const userId = `USR-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;

  const validRoles = ['STUDENT', 'TEACHING_STAFF', 'NON_TEACHING_STAFF', 'DEPT_ADMIN', 'SUPER_ADMIN'];
  const userRole = validRoles.includes(role) ? role : 'STUDENT';

  await db.run(
    `
      INSERT INTO users (user_id, pnrno, email, password_hash, full_name, mobile_number, role, department_id, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    [
      userId,
      normPnr,
      normEmail,
      passwordHash,
      fullName.trim(),
      mobileNumber ? mobileNumber.trim() : null,
      userRole,
      departmentId || null,
      'ACTIVE'
    ]
  );

  logSecurityEvent('USER_REGISTERED', 'INFO', `User created: ${pnrno} (${userRole}) in Dept ${departmentId || 'GLOBAL'}`, ipAddress, email);

  return {
    userId,
    pnrno: normPnr,
    email: normEmail,
    fullName: fullName.trim(),
    role: userRole,
    departmentId
  };
}

async function loginUser(identifier, password, ipAddress = '127.0.0.1') {
  if (!identifier || !password) {
    throw new Error('Identifier and password are required.');
  }

  const idClean = identifier.trim();
  const user = await db.get(
    `
      SELECT * FROM users 
      WHERE LOWER(email) = LOWER($1) OR UPPER(pnrno) = UPPER($2)
    `,
    [idClean, idClean]
  );

  if (!user) {
    logSecurityEvent('LOGIN_FAILED_UNKNOWN_USER', 'WARNING', `Failed login attempt for identifier: ${idClean}`, ipAddress, idClean);
    throw new Error('Invalid institutional credentials. Please verify your PNRNO or Email.');
  }

  if (user.status !== 'ACTIVE') {
    logSecurityEvent('LOGIN_ATTEMPT_INACTIVE_ACCOUNT', 'WARNING', `Account ${user.pnrno} status is ${user.status}`, ipAddress, user.email);
    throw new Error(`Your account status is currently ${user.status}. Please contact the system administrator.`);
  }

  const passwordMatch = bcrypt.compareSync(password, user.password_hash);
  if (!passwordMatch) {
    logSecurityEvent('LOGIN_FAILED_BAD_PASSWORD', 'WARNING', `Incorrect password for user: ${user.pnrno}`, ipAddress, user.email);
    throw new Error('Invalid institutional credentials. Please verify your password.');
  }

  await db.run('UPDATE users SET last_login = NOW() WHERE user_id = $1', [user.user_id]);

  const scopeClaims = await buildScopeClaims(user);
  const tokenPayload = {
    userId: user.user_id,
    pnr: user.pnrno,
    pnrno: user.pnrno,
    email: user.email,
    fullName: user.full_name,
    role: user.role,
    departmentId: user.department_id,
    ...scopeClaims
  };

  const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

  let blockchainReceipt = null;
  try {
    blockchainReceipt = await recordSessionOnChain({
      user: tokenPayload,
      token,
      ip: ipAddress,
      userAgent: 'Portal Direct Sign-In'
    });
  } catch (e) {
    console.warn('Blockchain session recording warning:', e.message);
  }

  logSecurityEvent('LOGIN_SUCCESS', 'INFO', `Session established for ${user.pnrno} [${user.role}]`, ipAddress, user.email);

  return {
    token,
    user: tokenPayload,
    blockchainReceipt
  };
}

async function handleOAuthSSO(provider, profile, ipAddress = '127.0.0.1') {
  const { email } = profile;

  if (!email) {
    throw new Error('Identity provider did not return a verified email address.');
  }

  const emailClean = email.trim().toLowerCase();
  const user = await db.get('SELECT * FROM users WHERE LOWER(email) = $1', [emailClean]);

  if (!user) {
    logSecurityEvent('SSO_UNKNOWN_IDENTITY', 'WARNING', `SSO attempt for unregistered identity via ${provider}: ${emailClean}`, ipAddress, emailClean);
    throw new Error('No institutional account is linked to this identity. Please register or sign in with your credentials.');
  }

  if (user.status !== 'ACTIVE') {
    logSecurityEvent('SSO_INACTIVE_ACCOUNT', 'WARNING', `SSO attempt for ${user.status} account ${user.pnrno}`, ipAddress, emailClean);
    throw new Error(`Your account status is currently ${user.status}. Please contact the system administrator.`);
  }

  logSecurityEvent('SSO_LOGIN_SUCCESS', 'INFO', `Authenticated via ${provider}: ${emailClean}`, ipAddress, emailClean);

  await db.run('UPDATE users SET last_login = NOW() WHERE user_id = $1', [user.user_id]);

  const scopeClaims = await buildScopeClaims(user);
  const tokenPayload = {
    userId: user.user_id,
    pnr: user.pnrno,
    pnrno: user.pnrno,
    email: user.email,
    fullName: user.full_name,
    role: user.role,
    departmentId: user.department_id,
    authProvider: provider,
    ...scopeClaims
  };

  const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

  let blockchainReceipt = null;
  try {
    blockchainReceipt = await recordSessionOnChain({
      user: tokenPayload,
      token,
      ip: ipAddress,
      userAgent: `SSO Portal Sign-In (${provider})`
    });
  } catch (e) {
    console.warn('Blockchain session recording warning:', e.message);
  }

  return {
    token,
    user: tokenPayload,
    blockchainReceipt
  };
}

module.exports = {
  registerUser,
  loginUser,
  handleOAuthSSO
};
