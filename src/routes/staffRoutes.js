const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const { getStaffByDepartment, getAllStaff, getFacultyTimetable } = require('../services/staffService');
const { requireAuth, requireRole } = require('../middleware/auth');
const { db } = require('../config/database');
const { getDeanSchoolScope, getSchoolDepartments } = require('../services/departmentService');

async function enforceStaffDeptScope(req, res, next) {
  try {
    let deptId = req.body?.departmentId || req.body?.department_id;
    if (!deptId && req.params?.id) {
      const existing = await db.query('SELECT department_id FROM staff WHERE staff_id = $1', [req.params.id]);
      if (existing.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Staff member not found' });
      }
      deptId = existing.rows[0].department_id;
    }
    if (req.user.role === 'SUPER_ADMIN') return next();
    const targetDept = String(deptId || req.user.departmentId || '').trim().toUpperCase();
    if (req.user.role === 'DEAN') {
      const deanSchool = await getDeanSchoolScope(req.user.userId);
      const allowedDepts = await getSchoolDepartments(deanSchool);
      if (!allowedDepts.includes(targetDept)) {
        return res.status(403).json({ status: 'error', message: 'Forbidden: Deans may only manage staff within their assigned school' });
      }
      return next();
    }
    const userDept = String(req.user.departmentId || '').trim().toUpperCase();
    if (userDept && targetDept && targetDept !== userDept) {
      return res.status(403).json({ status: 'error', message: 'Forbidden: Cannot manage staff outside your department' });
    }
    return next();
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

router.get('/', async (req, res) => {
  try {
    const { department, category, school } = req.query;
    let staffList;

    if (department && category) {
      staffList = await getStaffByDepartment(department, category);
    } else if (department) {
      const [teaching, nonTeaching] = await Promise.all([
        getStaffByDepartment(department, 'TEACHING'),
        getStaffByDepartment(department, 'NON_TEACHING')
      ]);
      staffList = [...teaching, ...nonTeaching];
    } else {
      // `school` narrows the directory to one academic school (Dean school-wide scope).
      staffList = await getAllStaff(category, school || null);
    }

    res.json({
      success: true,
      count: staffList.length,
      data: staffList
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message
    });
  }
});

router.get('/faculty/:staffId/timetable', async (req, res) => {
  try {
    const timetable = await getFacultyTimetable(req.params.staffId);
    if (!timetable) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: `Faculty record '${req.params.staffId}' was not found.`
      });
    }

    res.json({
      success: true,
      data: timetable
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message
    });
  }
});

// POST /api/v1/staff — Register a new faculty or non-teaching staff member
router.post('/', requireAuth, requireRole(['SUPER_ADMIN', 'DEAN', 'DEPT_ADMIN', 'COORDINATOR']), enforceStaffDeptScope, async (req, res) => {
  try {
    const { staff_id, department_id, full_name, category, designation, official_email, lab_responsibility } = req.body;
    if (!full_name || !department_id) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: 'full_name and department_id are required.'
      });
    }

    const cat = String(category || 'TEACHING').toUpperCase();
    if (!['TEACHING', 'NON_TEACHING'].includes(cat)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_CATEGORY',
        message: 'category must be TEACHING or NON_TEACHING.'
      });
    }

    const id = (staff_id && String(staff_id).trim()) || `STF-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;
    const desig = (designation && String(designation).trim()) || (cat === 'TEACHING' ? 'Assistant Professor' : 'Lab Assistant');

    await db.run(
      `
        INSERT INTO staff (staff_id, department_id, full_name, category, designation, official_email, lab_responsibility, display_approved)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 1)
        ON CONFLICT(staff_id) DO UPDATE SET
          department_id = EXCLUDED.department_id,
          full_name = EXCLUDED.full_name,
          category = EXCLUDED.category,
          designation = EXCLUDED.designation,
          official_email = EXCLUDED.official_email,
          lab_responsibility = EXCLUDED.lab_responsibility
      `,
      [id, department_id, full_name.trim(), cat, desig, official_email ? String(official_email).trim().toLowerCase() : null, lab_responsibility || null]
    );

    const created = await db.get('SELECT * FROM staff WHERE staff_id = $1', [id]);
    res.status(201).json({
      success: true,
      message: `Staff member "${full_name.trim()}" saved successfully.`,
      data: created
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message
    });
  }
});

router.put('/:id', requireAuth, requireRole(['SUPER_ADMIN', 'DEAN', 'DEPT_ADMIN', 'COORDINATOR']), enforceStaffDeptScope, async (req, res) => {
  try {
    const staffId = req.params.id;
    const curRes = await db.query('SELECT * FROM staff WHERE staff_id = $1', [staffId]);
    if (curRes.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Staff member not found' });
    }
    const cur = curRes.rows[0];
    const b = req.body || {};
    const fullName = b.fullName !== undefined || b.full_name !== undefined ? String(b.fullName ?? b.full_name ?? '').trim() : cur.full_name;
    const category = b.category !== undefined ? String(b.category).trim().toUpperCase() : cur.category;
    const designation = b.designation !== undefined ? String(b.designation || '').trim() : cur.designation;
    const departmentId = b.departmentId !== undefined || b.department_id !== undefined
      ? String(b.departmentId ?? b.department_id ?? cur.department_id).trim().toUpperCase()
      : cur.department_id;
    const officialEmail = b.officialEmail !== undefined || b.official_email !== undefined
      ? String(b.officialEmail ?? b.official_email ?? '').trim()
      : cur.official_email;
    const labResp = b.labResponsibility !== undefined || b.lab_responsibility !== undefined
      ? String(b.labResponsibility ?? b.lab_responsibility ?? '').trim()
      : cur.lab_responsibility;

    if (!fullName || !designation) {
      return res.status(400).json({ status: 'error', message: 'full_name and designation are required' });
    }
    if (!['TEACHING', 'NON_TEACHING'].includes(category)) {
      return res.status(400).json({ status: 'error', message: 'category must be TEACHING or NON_TEACHING' });
    }

    const updated = await db.query(
      `UPDATE staff
       SET full_name = $1, category = $2, designation = $3, department_id = $4, official_email = $5, lab_responsibility = $6
       WHERE staff_id = $7
       RETURNING *`,
      [fullName, category, designation, departmentId, officialEmail, labResp, staffId]
    );
    res.json({ status: 'success', data: updated.rows[0] });
  } catch (err) {
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
});

router.delete('/:id', requireAuth, requireRole(['SUPER_ADMIN', 'DEAN', 'DEPT_ADMIN']), enforceStaffDeptScope, async (req, res) => {
  try {
    const staffId = req.params.id;
    const curRes = await db.query('SELECT staff_id FROM staff WHERE staff_id = $1', [staffId]);
    if (curRes.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Staff member not found' });
    }
    const slotCountRes = await db.query('SELECT COUNT(*)::int AS cnt FROM timetable_slots WHERE faculty_id = $1', [staffId]);
    if (Number(slotCountRes.rows[0]?.cnt || 0) > 0) {
      return res.status(409).json({
        status: 'error',
        message: 'Reassign or remove scheduled timetable slots for this staff member before deleting'
      });
    }
    await db.query('DELETE FROM staff WHERE staff_id = $1', [staffId]);
    res.json({ status: 'success', data: { deleted: true, staff_id: staffId } });
  } catch (err) {
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
});

module.exports = router;
