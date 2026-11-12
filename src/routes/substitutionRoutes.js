const express = require('express');
const router = express.Router();
const {
  createSubstitution,
  findSlotForSubstitution,
  getSubstitutions,
  cancelSubstitution,
  updateSubstitutionStatus
} = require('../services/substitutionService');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getDeanSchoolScope, getSchoolDepartments } = require('../services/departmentService');

// Get pending substitution requests for HOD/Dean approval workflow
router.get('/pending', requireAuth, requireRole(['SUPER_ADMIN', 'DEAN', 'DEPT_ADMIN']), async (req, res) => {
  try {
    const filters = { status: 'PENDING', dayOfWeek: 'ALL' };

    if (req.user.role === 'DEPT_ADMIN') {
      filters.departmentId = req.user.departmentId || 'ALL';
    } else if (req.user.role === 'DEAN') {
      const scope = await getDeanSchoolScope(req.user.userId);
      filters.departmentIds = scope ? scope.departmentIds : [];
    } else {
      filters.departmentId = req.query.department || 'ALL';
    }

    const substitutions = await getSubstitutions(filters);
    res.json({
      success: true,
      count: substitutions.length,
      data: substitutions
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message
    });
  }
});

// Public or authenticated list of substitutions
router.get('/', async (req, res) => {
  try {
    const { status, department, day, school } = req.query;
    const filter = {
      status: status || 'APPROVED',
      dayOfWeek: day || 'ALL'
    };
    if (school) {
      // School-wide Dean scope: every department governed by the school.
      filter.departmentIds = await getSchoolDepartments(school);
    } else {
      filter.departmentId = department || 'ALL';
    }
    const substitutions = await getSubstitutions(filter);

    res.json({
      success: true,
      count: substitutions.length,
      data: substitutions
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message
    });
  }
});

// Look up target timetable slot for dynamic substitution assignment
router.get('/find-slot', async (req, res) => {
  try {
    const { faculty_id, facultyId, day, day_of_week, period, period_index, section_id, sectionId } = req.query;
    const facId = faculty_id || facultyId;
    const dayVal = (day || day_of_week || '').toUpperCase();
    const pIdx = parseInt(period || period_index, 10);
    const secId = section_id || sectionId;

    if (!dayVal || isNaN(pIdx)) {
      return res.status(400).json({
        success: false,
        error: 'BAD_REQUEST',
        message: 'Parameters day and period are required.'
      });
    }

    const slot = await findSlotForSubstitution({
      facultyId: facId,
      sectionId: secId,
      dayOfWeek: dayVal,
      periodIndex: pIdx
    });

    if (!slot) {
      return res.json({
        success: true,
        found: false,
        slot: null,
        message: 'No scheduled class was found for this faculty/section on the selected day and period.'
      });
    }

    res.json({
      success: true,
      found: true,
      slot
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message
    });
  }
});

// Create a substitution assignment
router.post('/', requireAuth, requireRole(['SUPER_ADMIN', 'DEAN', 'DEPT_ADMIN', 'COORDINATOR', 'TEACHING_STAFF']), async (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const result = await createSubstitution(req.body, req.user, ip);

    res.status(201).json({
      success: true,
      message: 'Class substitution duty assigned successfully.',
      data: result
    });
  } catch (err) {
    const isConflict = err.message && (err.message.includes('Conflict') || err.message.includes('already'));
    res.status(isConflict ? 409 : 400).json({
      success: false,
      error: isConflict ? 'FACULTY_SCHEDULE_CONFLICT' : 'SUBSTITUTION_FAILED',
      message: err.message
    });
  }
});

// Update status (e.g. Accept / Approve / Reject by HOD / Admin)
const handleStatusUpdate = async (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const { status } = req.body;
    const result = await updateSubstitutionStatus(req.params.id, status || 'APPROVED', req.user, ip);

    res.json({
      success: true,
      message: result.message,
      data: result
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: 'UPDATE_STATUS_FAILED',
      message: err.message
    });
  }
};

router.patch('/:id/status', requireAuth, requireRole(['SUPER_ADMIN', 'DEAN', 'DEPT_ADMIN', 'TEACHING_STAFF']), handleStatusUpdate);
router.put('/:id/status', requireAuth, requireRole(['SUPER_ADMIN', 'DEAN', 'DEPT_ADMIN', 'TEACHING_STAFF']), handleStatusUpdate);

// Cancel a substitution
router.delete('/:id', requireAuth, requireRole(['SUPER_ADMIN', 'DEAN', 'DEPT_ADMIN', 'TEACHING_STAFF']), async (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const result = await cancelSubstitution(req.params.id, req.user, ip);

    res.json({
      success: true,
      message: result.message
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: 'CANCELLATION_FAILED',
      message: err.message
    });
  }
});

module.exports = router;
