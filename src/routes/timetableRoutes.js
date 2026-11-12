const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const {
  getAcademicHierarchy,
  getSectionTimetable,
  resolveStudentEnrolledSection,
  getFacultyWorkloadMatrix
} = require('../services/timetableService');
const { validateSlotConflict } = require('../services/conflictService');
const { requireAuth, requireRole } = require('../middleware/auth');
const { db } = require('../config/database');
const { getDeanSchoolScope, getSchoolDepartments } = require('../services/departmentService');

// Student Personal Section Timetable (auto-scoped to enrolled cohort)
router.get('/my-section', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    let enrolled = null;
    if (user.sectionId && typeof user.sectionId === 'string' && user.sectionId.includes('-')) {
      const parts = user.sectionId.split('-');
      if (parts.length >= 3) {
        const sem = parts[1];
        const sec = parts.slice(2).join('-');
        enrolled = {
          department: parts[0],
          semester: sem,
          section: sec,
          sectionId: user.sectionId,
          label: `${sem.replace('SEM_', 'Sem ')} Section ${sec}`
        };
      }
    }
    if (!enrolled) {
      enrolled = resolveStudentEnrolledSection(user.pnr || user.pnrno, user.email);
      if (user.departmentId && (!user.pnr || !String(user.pnr).startsWith('24341A0502'))) {
        // Honour registered department when no explicit section override exists
        if (!enrolled.departmentExplicit && user.departmentId !== 'CSE' && !String(user.email || '').includes('cse')) {
          enrolled = {
            ...enrolled,
            department: user.departmentId,
            sectionId: `${user.departmentId}-${enrolled.semester}-${enrolled.section}`
          };
        }
      }
    }
    const result = await getSectionTimetable(enrolled.department, enrolled.semester, enrolled.section);

    res.json({
      success: true,
      enrolledCohort: enrolled,
      data: result
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'ENROLLED_TIMETABLE_ERROR',
      message: err.message
    });
  }
});

// Faculty Workload Matrix & Overload Analysis (AICTE / Autonomous Governance)
router.get('/faculty-workload', async (req, res) => {
  try {
    const dept = req.query.department || req.query.dept || 'CSE';
    const workload = await getFacultyWorkloadMatrix(dept);
    res.json({
      success: true,
      department: dept,
      count: workload.length,
      data: workload
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'WORKLOAD_QUERY_ERROR',
      message: err.message
    });
  }
});

router.get('/subjects', async (req, res) => {
  try {
    const { department, semester } = req.query;
    let query = 'SELECT * FROM subjects';
    const params = [];
    const clauses = [];
    if (department && department !== 'ALL') {
      params.push(department.toUpperCase());
      clauses.push(`department_id = $${params.length}`);
    }
    if (semester && semester !== 'ALL') {
      params.push(semester.toUpperCase());
      clauses.push(`semester_id = $${params.length}`);
    }
    if (clauses.length > 0) {
      query += ' WHERE ' + clauses.join(' AND ');
    }
    query += ' ORDER BY subject_code ASC';
    const subjects = await db.all(query, params);
    res.json({
      success: true,
      data: subjects
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'SUBJECTS_QUERY_ERROR',
      message: err.message
    });
  }
});

// Authoritative section directory (department × semester → A/B/C/D cohorts).
// Powers role-scoped dropdowns and the read-only cross-department timetable viewer.
router.get('/sections', async (req, res) => {
  try {
    const { department, semester } = req.query;
    const clauses = [];
    const params = [];
    if (department && department !== 'ALL') {
      params.push(department.toUpperCase());
      clauses.push(`department_id = $${params.length}`);
    }
    if (semester && semester !== 'ALL') {
      params.push(semester.toUpperCase());
      clauses.push(`semester_id = $${params.length}`);
    }
    let query = 'SELECT section_id, department_id, semester_id, section_name, student_count FROM sections';
    if (clauses.length > 0) query += ' WHERE ' + clauses.join(' AND ');
    query += ' ORDER BY department_id ASC, semester_id ASC, section_name ASC';
    const sections = await db.all(query, params);
    res.json({
      success: true,
      count: sections.length,
      data: sections
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'SECTIONS_QUERY_ERROR',
      message: err.message
    });
  }
});

// Published/draft timetable versions (department-scoped) for form dropdowns.
router.get('/versions', async (req, res) => {
  try {
    const { department } = req.query;
    let query = 'SELECT version_id, department_id, academic_session, version_number, status, effective_from FROM timetable_versions';
    const params = [];
    if (department && department !== 'ALL') {
      params.push(department.toUpperCase());
      query += ` WHERE department_id = $${params.length}`;
    }
    query += ' ORDER BY department_id ASC, version_number DESC';
    const versions = await db.all(query, params);
    res.json({
      success: true,
      count: versions.length,
      data: versions
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'VERSIONS_QUERY_ERROR',
      message: err.message
    });
  }
});

router.get('/hierarchy', async (req, res) => {
  try {
    // `school` narrows the hierarchy to one academic school (Dean school-wide scope).
    const hierarchy = await getAcademicHierarchy(req.query.school || null);
    res.json({
      success: true,
      data: hierarchy
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message
    });
  }
});

router.get('/section', async (req, res) => {
  try {
    const { department, semester, section } = req.query;
    if (!department || !semester || !section) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_PARAMETERS',
        message: 'Parameters department, semester, and section are required.'
      });
    }

    const result = await getSectionTimetable(department, semester, section);
    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'SECTION_NOT_FOUND',
        message: `Section ${department} ${semester} ${section} does not exist.`
      });
    }

    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message
    });
  }
});

// Pre-flight collision validation endpoint for interactive UI feedback
router.post('/validate-slot', requireAuth, requireRole(['SUPER_ADMIN', 'DEAN', 'DEPT_ADMIN', 'COORDINATOR']), async (req, res) => {
  try {
    const validation = await validateSlotConflict(req.body, req.body.exclude_slot_id || null);
    res.json({
      success: true,
      data: validation
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: err.message
    });
  }
});

// POST /api/v1/timetables/subjects — Create or update an institutional subject
router.post('/subjects', requireAuth, requireRole(['SUPER_ADMIN', 'DEAN', 'DEPT_ADMIN', 'COORDINATOR']), async (req, res) => {
  try {
    const { subject_id, department_id, semester_id, subject_code, subject_name, course_type, credits } = req.body;
    if (!department_id || !semester_id || !subject_code || !subject_name) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: 'department_id, semester_id, subject_code, and subject_name are required.'
      });
    }
    const cleanDept = String(department_id).trim().toUpperCase();
    if (req.user.role === 'DEAN') {
      const deanSchool = await getDeanSchoolScope(req.user.userId);
      const allowedDepts = await getSchoolDepartments(deanSchool);
      if (!allowedDepts.includes(cleanDept)) {
        return res.status(403).json({ success: false, error: 'OUT_OF_SCHOOL', message: 'Deans may only manage subjects within their assigned school.' });
      }
    } else if (req.user.role !== 'SUPER_ADMIN' && req.user.departmentId && cleanDept !== req.user.departmentId) {
      return res.status(403).json({ success: false, error: 'OUT_OF_DEPARTMENT', message: 'You may only manage subjects in your own department.' });
    }

    const validTypes = ['THEORY', 'LABORATORY', 'PROJECT', 'SEMINAR'];
    const resolvedType = validTypes.includes(String(course_type || 'THEORY').toUpperCase())
      ? String(course_type || 'THEORY').toUpperCase()
      : 'THEORY';
    const cleanCode = String(subject_code).trim().toUpperCase();
    const id = (subject_id && String(subject_id).trim()) || `${department_id}-${cleanCode}` || `SUB-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;

    await db.run(
      `
        INSERT INTO subjects (subject_id, department_id, semester_id, subject_code, subject_name, course_type, credits)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT(subject_id) DO UPDATE SET
          department_id = EXCLUDED.department_id,
          semester_id = EXCLUDED.semester_id,
          subject_code = EXCLUDED.subject_code,
          subject_name = EXCLUDED.subject_name,
          course_type = EXCLUDED.course_type,
          credits = EXCLUDED.credits
      `,
      [id, department_id, semester_id, cleanCode, String(subject_name).trim(), resolvedType, Number.isFinite(Number(credits)) ? Number(credits) : 3]
    );

    const created = await db.get('SELECT * FROM subjects WHERE subject_id = $1', [id]);
    res.status(201).json({
      success: true,
      message: `Subject "${cleanCode}" saved successfully.`,
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

router.delete('/subjects/:id', requireAuth, requireRole(['SUPER_ADMIN', 'DEAN', 'DEPT_ADMIN', 'COORDINATOR']), async (req, res) => {
  try {
    const existing = await db.get('SELECT * FROM subjects WHERE subject_id = $1', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Subject not found.' });
    }
    if (req.user.role === 'DEAN') {
      const deanSchool = await getDeanSchoolScope(req.user.userId);
      const allowedDepts = await getSchoolDepartments(deanSchool);
      if (!allowedDepts.includes(existing.department_id)) {
        return res.status(403).json({ success: false, error: 'OUT_OF_SCHOOL', message: 'Deans may only remove subjects within their assigned school.' });
      }
    } else if (req.user.role !== 'SUPER_ADMIN' && req.user.departmentId && existing.department_id !== req.user.departmentId) {
      return res.status(403).json({ success: false, error: 'OUT_OF_DEPARTMENT', message: 'You may only remove subjects in your own department.' });
    }
    const slotUse = await db.get('SELECT COUNT(*)::int AS cnt FROM timetable_slots WHERE subject_id = $1', [req.params.id]);
    if (Number(slotUse?.cnt || 0) > 0) {
      return res.status(409).json({
        success: false,
        error: 'SUBJECT_IN_USE',
        message: 'Remove timetable slots referencing this subject before deleting it.'
      });
    }
    await db.run('DELETE FROM subjects WHERE subject_id = $1', [req.params.id]);
    res.json({ success: true, message: `Subject "${existing.subject_code}" removed.`, data: { deleted: true, subject_id: req.params.id } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = router;
