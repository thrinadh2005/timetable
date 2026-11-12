const express = require('express');
const router = express.Router();
const {
  getAcademicEvents,
  checkDateScheduleStatus,
  createAcademicEvent,
  updateAcademicEvent,
  deleteAcademicEvent,
  updateEventStatus
} = require('../services/eventService');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getSchoolDepartments, getDeanSchoolScope } = require('../services/departmentService');
const { db } = require('../config/database');

// GET /api/v1/events - List academic calendar events, holidays & exams
router.get('/', async (req, res) => {
  try {
    const { department, type, date, school } = req.query;
    const filter = { eventType: type, date };
    if (school) {
      // School-wide Dean scope: events of the school's departments plus campus-wide events.
      filter.departmentIds = await getSchoolDepartments(school);
    } else {
      filter.departmentId = department;
    }
    const events = await getAcademicEvents(filter);
    res.json({
      success: true,
      count: events.length,
      data: events
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message
    });
  }
});

// GET /api/v1/events/check-date - Returns whether today/date is a Holiday, Exam, or Regular class day
router.get('/check-date', async (req, res) => {
  try {
    const { date, department, semester } = req.query;
    const status = await checkDateScheduleStatus(date, department, semester);
    res.json({
      success: true,
      data: status
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message
    });
  }
});

// POST /api/v1/events - Create new institutional event / holiday / exam window
router.post('/', requireAuth, requireRole(['SUPER_ADMIN', 'DEAN', 'DEPT_ADMIN', 'COORDINATOR']), async (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const newEvent = await createAcademicEvent(req.body, req.user, ip);
    res.status(201).json({
      success: true,
      message: 'Institutional academic event created successfully.',
      data: newEvent
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: 'CREATION_FAILED',
      message: err.message
    });
  }
});

// PATCH /api/v1/events/:id/status
router.patch('/:id/status', requireAuth, requireRole(['SUPER_ADMIN', 'DEAN', 'DEPT_ADMIN']), async (req, res) => {
  try {
    const { status } = req.body;
    const result = await updateEventStatus(req.params.id, status);
    res.json({
      success: true,
      message: `Event status updated to ${status}.`,
      data: result
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: err.message
    });
  }
});

// DELETE /api/v1/events/:id - Delete institutional event / holiday / exam window
router.delete('/:id', requireAuth, requireRole(['SUPER_ADMIN', 'DEAN', 'DEPT_ADMIN', 'COORDINATOR']), async (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const result = await deleteAcademicEvent(req.params.id, req.user, ip);
    res.json({
      success: true,
      message: result.message,
      data: result
    });
  } catch (err) {
    const isNotFound = err.message && err.message.includes('not found');
    res.status(isNotFound ? 404 : 400).json({
      success: false,
      error: isNotFound ? 'NOT_FOUND' : 'DELETE_FAILED',
      message: err.message
    });
  }
});

router.put('/:id', requireAuth, requireRole(['SUPER_ADMIN', 'DEAN', 'DEPT_ADMIN', 'COORDINATOR']), async (req, res) => {
  try {
    const existingRes = await db.query('SELECT * FROM academic_events WHERE event_id = $1', [req.params.id]);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Academic event not found' });
    }
    const cur = existingRes.rows[0];
    if (req.user.role === 'DEAN') {
      const deanSchool = await getDeanSchoolScope(req.user.userId);
      const allowed = await getSchoolDepartments(deanSchool);
      if (cur.department_id && !allowed.includes(cur.department_id)) {
        return res.status(403).json({ status: 'error', message: 'Forbidden: Event outside your school scope' });
      }
    } else if (req.user.role !== 'SUPER_ADMIN') {
      if (cur.department_id && cur.department_id !== req.user.departmentId) {
        return res.status(403).json({ status: 'error', message: 'Forbidden: Event belongs to another department' });
      }
    }
    const updated = await updateAcademicEvent(req.params.id, req.body || {});
    res.json({ status: 'success', data: updated });
  } catch (err) {
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
});

module.exports = router;
