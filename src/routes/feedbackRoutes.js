const express = require('express');
const router = express.Router();
const { submitFeedback, getFeedback, updateFeedbackStatus, deleteFeedback } = require('../services/feedbackService');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getDeanSchoolScope } = require('../services/departmentService');

// POST /api/v1/feedback - Open to both authenticated users and guests
router.post('/', async (req, res) => {
  try {
    const currentUser = req.user || null;
    const result = await submitFeedback(req.body, currentUser);
    res.status(201).json({
      success: true,
      message: result.message,
      data: result
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: 'SUBMISSION_FAILED',
      message: err.message
    });
  }
});

// GET /api/v1/feedback - Reviewers see their governed scope; every other authenticated
// subscriber sees only the feedback they personally submitted.
router.get('/', requireAuth, async (req, res) => {
  try {
    const { category, status, department } = req.query;
    const filter = { category, status };

    if (req.user.role === 'DEPT_ADMIN') {
      // HOD sees only their own department.
      filter.departmentId = req.user.departmentId;
    } else if (req.user.role === 'DEAN') {
      // Dean sees every department governed by their school.
      const scope = await getDeanSchoolScope(req.user.userId);
      filter.departmentIds = scope ? scope.departmentIds : [];
    } else if (req.user.role === 'SUPER_ADMIN') {
      // Super Admin may narrow to a single department, otherwise sees all.
      filter.departmentId = department;
    } else {
      // Students, faculty, coordinators and lab staff only see their own submissions.
      filter.userId = req.user.userId;
    }

    const feedbackList = await getFeedback(filter);
    res.json({
      success: true,
      count: feedbackList.length,
      data: feedbackList
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message
    });
  }
});

// PATCH /api/v1/feedback/:id/status - Update feedback status
router.patch('/:id/status', requireAuth, requireRole(['SUPER_ADMIN', 'DEAN', 'DEPT_ADMIN']), async (req, res) => {
  try {
    const { status, admin_notes } = req.body;
    const result = await updateFeedbackStatus(req.params.id, status, admin_notes, req.user);
    res.json({
      success: true,
      message: `Feedback status updated to ${status}.`,
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

// DELETE /api/v1/feedback/:id - Remove feedback ticket
router.delete('/:id', requireAuth, requireRole(['SUPER_ADMIN', 'DEAN', 'DEPT_ADMIN']), async (req, res) => {
  try {
    const result = await deleteFeedback(req.params.id, req.user);
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

module.exports = router;

