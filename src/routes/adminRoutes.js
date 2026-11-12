const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const { addTimetableSlot, updateTimetableSlot, deleteTimetableSlot } = require('../services/timetableService');
const { getDeanSchoolScope, getSchoolDepartments } = require('../services/departmentService');
const { requireAuth, requireRole } = require('../middleware/auth');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// All admin routes require authentication; each route declares its own role guard.
router.use(requireAuth);

/**
 * Resolves the owning department of a section.
 */
async function getSectionDepartment(sectionId) {
  if (!sectionId) return null;
  const row = await db.get('SELECT department_id FROM sections WHERE section_id = $1', [sectionId]);
  return row ? row.department_id : null;
}

/**
 * Coordinators and HODs (DEPT_ADMIN) may only edit slots within their own
 * department. SUPER_ADMIN is university-wide and not restricted.
 */
async function isDepartmentScopeViolation(user, sectionId) {
  if (user.role === 'SUPER_ADMIN') return false;
  const dept = await getSectionDepartment(sectionId);
  if (user.role === 'DEAN') {
    if (!dept) return false;
    const deanSchool = await getDeanSchoolScope(user.userId);
    const allowedDepts = await getSchoolDepartments(deanSchool);
    return !allowedDepts.includes(dept);
  }
  if (user.role === 'COORDINATOR' || user.role === 'DEPT_ADMIN') {
    return !!dept && !!user.departmentId && dept !== user.departmentId;
  }
  return false;
}

// Timetable Slot Management (Super Admin, Dean, HOD, and Department Coordinator)
router.post('/slots', requireRole(['SUPER_ADMIN', 'DEAN', 'DEPT_ADMIN', 'COORDINATOR']), async (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    if (await isDepartmentScopeViolation(req.user, req.body.section_id)) {
      return res.status(403).json({
        success: false,
        error: 'OUT_OF_DEPARTMENT',
        message: 'You may only modify timetables within your authorized department or school scope.'
      });
    }
    const result = await addTimetableSlot(req.body, req.user, ip);
    res.status(201).json({
      success: true,
      message: 'Timetable slot created successfully.',
      data: result
    });
  } catch (err) {
    res.status(409).json({
      success: false,
      error: 'SLOT_CREATION_CONFLICT',
      message: err.message,
      conflicts: err.conflicts || []
    });
  }
});

router.put('/slots/:id', requireRole(['SUPER_ADMIN', 'DEAN', 'DEPT_ADMIN', 'COORDINATOR']), async (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const existing = await db.get('SELECT section_id FROM timetable_slots WHERE slot_id = $1', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Timetable slot not found.' });
    }
    const targetSection = req.body.section_id || existing.section_id;
    if ((await isDepartmentScopeViolation(req.user, existing.section_id)) || (await isDepartmentScopeViolation(req.user, targetSection))) {
      return res.status(403).json({
        success: false,
        error: 'OUT_OF_DEPARTMENT',
        message: 'You may only modify timetables within your authorized department or school scope.'
      });
    }
    const result = await updateTimetableSlot(req.params.id, req.body, req.user, ip);
    res.json({
      success: true,
      message: 'Timetable slot updated successfully.',
      data: result
    });
  } catch (err) {
    res.status(err.status || 409).json({
      success: false,
      error: 'SLOT_UPDATE_CONFLICT',
      message: err.message,
      conflicts: err.conflicts || []
    });
  }
});

router.delete('/slots/:id', requireRole(['SUPER_ADMIN', 'DEAN', 'DEPT_ADMIN', 'COORDINATOR']), async (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    if (req.user.role !== 'SUPER_ADMIN') {
      const existing = await db.get('SELECT section_id FROM timetable_slots WHERE slot_id = $1', [req.params.id]);
      if (existing && await isDepartmentScopeViolation(req.user, existing.section_id)) {
        return res.status(403).json({
          success: false,
          error: 'OUT_OF_DEPARTMENT',
          message: 'You may only modify timetables within your authorized department or school scope.'
        });
      }
    }
    const result = await deleteTimetableSlot(req.params.id, req.user, ip);
    res.json({
      success: true,
      message: 'Timetable slot removed successfully.',
      data: result
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: 'DELETE_FAILED',
      message: err.message
    });
  }
});

// User Account Administration (Super Admin / Dean only)
router.get('/users', requireRole(['SUPER_ADMIN']), async (req, res) => {
  try {
    const users = await db.all(`
      SELECT user_id, pnrno, email, full_name, mobile_number, role, department_id, status, created_at, last_login
      FROM users
      ORDER BY created_at DESC
    `);

    res.json({
      success: true,
      count: users.length,
      data: users
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message
    });
  }
});

router.patch('/users/:id/status', requireRole(['SUPER_ADMIN']), async (req, res) => {
  try {
    const { status } = req.body;
    const userId = req.params.id;
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';

    const validStatuses = ['ACTIVE', 'PENDING_APPROVAL', 'SUSPENDED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status supplied.' });
    }

    const existing = await db.get('SELECT * FROM users WHERE user_id = $1', [userId]);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    await db.transaction(async (tx) => {
      await tx.run('UPDATE users SET status = $1 WHERE user_id = $2', [status, userId]);

      await tx.run(`
        INSERT INTO audit_logs (log_id, admin_id, admin_name, action, entity_name, entity_id, old_value, new_value, ip_address)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        `AUD-${crypto.randomUUID().substring(0, 8).toUpperCase()}`,
        req.user.userId,
        req.user.fullName,
        'UPDATE_USER_STATUS',
        'USER',
        userId,
        JSON.stringify({ status: existing.status }),
        JSON.stringify({ status }),
        ip
      ]);
    });

    res.json({
      success: true,
      message: `User status changed to ${status}.`
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message
    });
  }
});

// POST /api/v1/admin/users — Create new user account (SUPER_ADMIN only)
router.post('/users', requireRole(['SUPER_ADMIN']), async (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const { full_name, email, pnrno, mobile_number, role, department_id, password, status } = req.body;

    if (!full_name || !email || !pnrno || !role || !password) {
      return res.status(400).json({ success: false, message: 'full_name, email, pnrno, role, and password are required.' });
    }

    const validRoles = ['SUPER_ADMIN', 'DEAN', 'DEPT_ADMIN', 'COORDINATOR', 'TEACHING_STAFF', 'NON_TEACHING_STAFF', 'STUDENT'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ success: false, message: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
    }

    const existing = await db.get(
      'SELECT user_id FROM users WHERE LOWER(email) = LOWER($1) OR UPPER(pnrno) = UPPER($2)',
      [email.trim(), pnrno.trim()]
    );
    if (existing) {
      return res.status(409).json({ success: false, message: 'A user with this email or PNR already exists.' });
    }

    const userId = `USR-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;
    const passwordHash = await bcrypt.hash(password, 10);
    const userStatus = status || 'ACTIVE';
    const cleanPnr = pnrno.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = full_name.trim();
    const staffDept = department_id || 'CSE';

    await db.transaction(async (tx) => {
      await tx.run(`
        INSERT INTO users (user_id, pnrno, email, password_hash, full_name, mobile_number, role, department_id, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [userId, cleanPnr, cleanEmail, passwordHash, cleanName, mobile_number || null, role, department_id || null, userStatus]);

      if (role === 'TEACHING_STAFF' || role === 'NON_TEACHING_STAFF') {
        const staffCat = role === 'TEACHING_STAFF' ? 'TEACHING' : 'NON_TEACHING';
        const defaultDesig = role === 'TEACHING_STAFF' ? 'Faculty Member' : 'Laboratory Assistant';
        const designation = (req.body.designation && String(req.body.designation).trim()) || defaultDesig;
        await tx.run(`
          INSERT INTO staff (staff_id, user_id, department_id, full_name, category, designation, official_email, display_approved)
          VALUES ($1, $2, $3, $4, $5, $6, $7, 1)
          ON CONFLICT(staff_id) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            department_id = EXCLUDED.department_id,
            full_name = EXCLUDED.full_name,
            category = EXCLUDED.category,
            designation = COALESCE(NULLIF(EXCLUDED.designation, ''), staff.designation),
            official_email = EXCLUDED.official_email
        `, [cleanPnr, userId, staffDept, cleanName, staffCat, designation, cleanEmail]);
      }

      if (role === 'STUDENT' && req.body.section_id) {
        await tx.run(`
          INSERT INTO user_section_assignments (user_id, section_id)
          VALUES ($1, $2)
          ON CONFLICT(user_id) DO UPDATE SET section_id = EXCLUDED.section_id
        `, [userId, req.body.section_id]);
      }

      if (role === 'DEAN' && req.body.school_id) {
        await tx.run(`
          INSERT INTO dean_school_assignments (user_id, school_id)
          VALUES ($1, $2)
          ON CONFLICT(user_id) DO UPDATE SET school_id = EXCLUDED.school_id
        `, [userId, req.body.school_id]);
      }

      await tx.run(`
        INSERT INTO audit_logs (log_id, admin_id, admin_name, action, entity_name, entity_id, old_value, new_value, ip_address)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        `AUD-${crypto.randomUUID().substring(0, 8).toUpperCase()}`,
        req.user.userId,
        req.user.fullName,
        'CREATE_USER',
        'USER',
        userId,
        JSON.stringify({}),
        JSON.stringify({ full_name, email, pnrno, role, department_id, status: userStatus }),
        ip
      ]);
    });

    res.status(201).json({
      success: true,
      message: `User account for "${full_name}" created successfully.`,
      data: { user_id: userId, full_name, email, pnrno, role, department_id, status: userStatus }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: err.message });
  }
});

// PUT /api/v1/admin/users/:id — Update user details (SUPER_ADMIN only)
router.put('/users/:id', requireRole(['SUPER_ADMIN']), async (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const userId = req.params.id;
    const { full_name, pnrno, email, mobile_number, role, department_id, status, password } = req.body;

    const existing = await db.get('SELECT * FROM users WHERE user_id = $1', [userId]);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const validRoles = ['SUPER_ADMIN', 'DEAN', 'DEPT_ADMIN', 'COORDINATOR', 'TEACHING_STAFF', 'NON_TEACHING_STAFF', 'STUDENT'];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role.' });
    }
    const validStatuses = ['ACTIVE', 'PENDING_APPROVAL', 'SUSPENDED'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status.' });
    }

    // Check email & PNR uniqueness if changing
    if (email && email.trim().toLowerCase() !== String(existing.email || '').toLowerCase()) {
      const dup = await db.get('SELECT user_id FROM users WHERE LOWER(email) = LOWER($1) AND user_id != $2', [email.trim(), userId]);
      if (dup) return res.status(409).json({ success: false, message: 'That email is already in use by another account.' });
    }
    if (pnrno && pnrno.trim().toUpperCase() !== String(existing.pnrno || '').toUpperCase()) {
      const dupPnr = await db.get('SELECT user_id FROM users WHERE UPPER(pnrno) = UPPER($1) AND user_id != $2', [pnrno.trim(), userId]);
      if (dupPnr) return res.status(409).json({ success: false, message: 'That PNR / ID is already in use by another account.' });
    }

    if (password && String(password).length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }

    const newFullName = full_name && full_name.trim() ? full_name.trim() : existing.full_name;
    const newPnr = pnrno && pnrno.trim() ? pnrno.trim() : existing.pnrno;
    const newEmail = email && email.trim() ? email.trim().toLowerCase() : existing.email;
    const newMobile = mobile_number !== undefined ? (mobile_number ? String(mobile_number).trim() : null) : existing.mobile_number;
    const newRole = role || existing.role;
    const newDept = department_id !== undefined ? (department_id || null) : existing.department_id;
    const newStatus = status || existing.status;
    const newHash = password ? await bcrypt.hash(password, 10) : null;

    await db.transaction(async (tx) => {
      if (newHash) {
        await tx.run(
          `UPDATE users SET full_name=$1, pnrno=$2, email=$3, mobile_number=$4, role=$5, department_id=$6, status=$7, password_hash=$8 WHERE user_id=$9`,
          [newFullName, newPnr, newEmail, newMobile, newRole, newDept, newStatus, newHash, userId]
        );
      } else {
        await tx.run(
          `UPDATE users SET full_name=$1, pnrno=$2, email=$3, mobile_number=$4, role=$5, department_id=$6, status=$7 WHERE user_id=$8`,
          [newFullName, newPnr, newEmail, newMobile, newRole, newDept, newStatus, userId]
        );
      }

      if (newRole === 'TEACHING_STAFF' || newRole === 'NON_TEACHING_STAFF') {
        const staffCat = newRole === 'TEACHING_STAFF' ? 'TEACHING' : 'NON_TEACHING';
        const fallbackDesig = newRole === 'TEACHING_STAFF' ? 'Faculty Member' : 'Laboratory Assistant';
        const designation = req.body.designation !== undefined ? String(req.body.designation || '').trim() : '';
        await tx.run(`
          INSERT INTO staff (staff_id, user_id, department_id, full_name, category, designation, official_email, display_approved)
          VALUES ($1, $2, $3, $4, $5, $6, $7, 1)
          ON CONFLICT(staff_id) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            department_id = EXCLUDED.department_id,
            full_name = EXCLUDED.full_name,
            category = EXCLUDED.category,
            designation = COALESCE(NULLIF($8, ''), staff.designation, EXCLUDED.designation),
            official_email = EXCLUDED.official_email
        `, [newPnr, userId, newDept || existing.department_id || 'CSE', newFullName, staffCat, designation || fallbackDesig, newEmail, designation]);
      } else if (newDept) {
        await tx.run(`UPDATE staff SET full_name = $1, official_email = $2, department_id = $3 WHERE user_id = $4`, [newFullName, newEmail, newDept, userId]);
      } else {
        await tx.run(`UPDATE staff SET full_name = $1, official_email = $2 WHERE user_id = $3`, [newFullName, newEmail, userId]);
      }

      if (newRole === 'STUDENT' && req.body.section_id) {
        await tx.run(`
          INSERT INTO user_section_assignments (user_id, section_id)
          VALUES ($1, $2)
          ON CONFLICT(user_id) DO UPDATE SET section_id = EXCLUDED.section_id
        `, [userId, req.body.section_id]);
      }

      if (newRole === 'DEAN' && req.body.school_id) {
        await tx.run(`
          INSERT INTO dean_school_assignments (user_id, school_id)
          VALUES ($1, $2)
          ON CONFLICT(user_id) DO UPDATE SET school_id = EXCLUDED.school_id
        `, [userId, req.body.school_id]);
      } else if (newRole !== 'DEAN') {
        await tx.run(`DELETE FROM dean_school_assignments WHERE user_id = $1`, [userId]);
      }

      await tx.run(`
        INSERT INTO audit_logs (log_id, admin_id, admin_name, action, entity_name, entity_id, old_value, new_value, ip_address)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        `AUD-${crypto.randomUUID().substring(0, 8).toUpperCase()}`,
        req.user.userId,
        req.user.fullName,
        'UPDATE_USER',
        'USER',
        userId,
        JSON.stringify({ full_name: existing.full_name, pnrno: existing.pnrno, email: existing.email, role: existing.role, status: existing.status }),
        JSON.stringify({ full_name: newFullName, pnrno: newPnr, email: newEmail, role: newRole, status: newStatus }),
        ip
      ]);
    });

    res.json({
      success: true,
      message: `User "${newFullName}" updated successfully.`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: err.message });
  }
});

// DELETE /api/v1/admin/users/:id — Delete user account (SUPER_ADMIN only)
router.delete('/users/:id', requireRole(['SUPER_ADMIN']), async (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const userId = req.params.id;

    if (req.user.userId === userId) {
      return res.status(403).json({ success: false, message: 'You cannot delete your own account.' });
    }

    const existing = await db.get('SELECT * FROM users WHERE user_id = $1', [userId]);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Prevent deleting the last SUPER_ADMIN
    if (existing.role === 'SUPER_ADMIN') {
      const adminCount = await db.get(`SELECT COUNT(*)::int as cnt FROM users WHERE role = 'SUPER_ADMIN' AND status = 'ACTIVE'`);
      if (adminCount.cnt <= 1) {
        return res.status(403).json({ success: false, message: 'Cannot delete the last active System Administrator account.' });
      }
    }

    await db.transaction(async (tx) => {
      await tx.run('UPDATE lab_incidents SET reporter_user_id = $1 WHERE reporter_user_id = $2', [req.user.userId, userId]);
      await tx.run('UPDATE lab_bookings SET booked_by_user_id = NULL WHERE booked_by_user_id = $1', [userId]);
      await tx.run('UPDATE facility_bookings SET booked_by_user_id = NULL WHERE booked_by_user_id = $1', [userId]);

      const linkedStaff = await tx.all(
        'SELECT staff_id FROM staff WHERE user_id = $1 OR LOWER(official_email) = LOWER($2)',
        [userId, existing.email || '']
      );
      for (const s of linkedStaff) {
        const refRow = await tx.get(
          `SELECT (
             (SELECT COUNT(*)::int FROM timetable_slots WHERE faculty_id = $1) +
             (SELECT COUNT(*)::int FROM class_substitutions WHERE original_faculty_id = $1 OR substitute_faculty_id = $1)
           ) AS cnt`,
          [s.staff_id]
        );
        if (!refRow || refRow.cnt === 0) {
          await tx.run('DELETE FROM staff WHERE staff_id = $1', [s.staff_id]);
        } else {
          await tx.run('UPDATE staff SET user_id = NULL WHERE staff_id = $1', [s.staff_id]);
        }
      }

      await tx.run('DELETE FROM users WHERE user_id = $1', [userId]);
      await tx.run(`
        INSERT INTO audit_logs (log_id, admin_id, admin_name, action, entity_name, entity_id, old_value, new_value, ip_address)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        `AUD-${crypto.randomUUID().substring(0, 8).toUpperCase()}`,
        req.user.userId,
        req.user.fullName,
        'DELETE_USER',
        'USER',
        userId,
        JSON.stringify({ full_name: existing.full_name, email: existing.email, role: existing.role }),
        JSON.stringify({}),
        ip
      ]);
    });

    res.json({
      success: true,
      message: `User account "${existing.full_name}" has been permanently deleted.`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: err.message });
  }
});

// Query Administrative Audit Logs
router.get('/audit-logs', requireRole(['SUPER_ADMIN', 'DEPT_ADMIN']), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 100;
    const logs = await db.all(`
      SELECT log_id, admin_id, admin_name, action, entity_name, entity_id, old_value, new_value, ip_address, timestamp
      FROM audit_logs
      ORDER BY timestamp DESC
      LIMIT $1
    `, [limit]);

    res.json({
      success: true,
      count: logs.length,
      data: logs
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message
    });
  }
});

module.exports = router;
