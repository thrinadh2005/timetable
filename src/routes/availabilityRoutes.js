const express = require('express');
const router = express.Router();
const {
  getFacilityAvailability,
  getFacilityWeeklySchedule,
  getFreeFacultyForPeriod,
  getClassAdjustmentRecommendations,
  getRoleSpecificDashboard,
  planFacilityEvent,
  getLiveClassesByCohort,
  getFacilityBookings,
  cancelFacilityBooking
} = require('../services/availabilityService');
const { requireAuth, requireRole } = require('../middleware/auth');

// Smart Class Adjustment & Recommendations Engine
router.get('/recommendations', async (req, res) => {
  try {
    const { day, period, department, excludeFacultyId } = req.query;
    const result = await getClassAdjustmentRecommendations({
      dayOfWeek: day || 'MONDAY',
      periodIndex: period || 1,
      departmentId: department || 'CSE',
      excludeFacultyId: excludeFacultyId || null
    });
    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'RECOMMENDATION_FAILED',
      message: err.message
    });
  }
});

// Live Class Finder for Students & Departments: Which class is happening and where it is happening
router.get('/live-classes', async (req, res) => {
  try {
    const { day, period, department } = req.query;
    const result = await getLiveClassesByCohort(day, period ? parseInt(period, 10) : null, department);
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

// Student Coordinator & Authority Facility Event Reservation
router.post('/plan-event', requireAuth, requireRole(['SUPER_ADMIN', 'DEAN', 'DEPT_ADMIN', 'COORDINATOR', 'TEACHING_STAFF', 'NON_TEACHING_STAFF', 'STUDENT']), async (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const currentUser = req.user;

    const booking = await planFacilityEvent(req.body, currentUser, ip);
    res.status(201).json({
      success: true,
      message: booking.message,
      data: booking
    });
  } catch (err) {
    const isConflict = err.message && (err.message.includes('Conflict') || err.message.includes('already'));
    res.status(isConflict ? 409 : 400).json({
      success: false,
      error: isConflict ? 'FACILITY_SCHEDULE_CONFLICT' : 'EVENT_PLANNING_FAILED',
      message: err.message
    });
  }
});

// Get confirmed facility bookings
router.get('/bookings', async (req, res) => {
  try {
    const bookings = await getFacilityBookings(req.query.facilityId);
    res.json({
      success: true,
      count: bookings.length,
      data: bookings
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message
    });
  }
});

// Cancel a facility event booking
router.delete('/bookings/:bookingId', requireAuth, requireRole(['SUPER_ADMIN', 'DEAN', 'DEPT_ADMIN', 'COORDINATOR', 'TEACHING_STAFF', 'NON_TEACHING_STAFF', 'STUDENT']), async (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const result = await cancelFacilityBooking(req.params.bookingId, req.user, ip);
    res.json({
      success: true,
      message: result.message,
      data: result
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: 'CANCELLATION_FAILED',
      message: err.message
    });
  }
});

// Get Role-Specific Real-Time Live Dashboard
router.get('/role-dashboard', async (req, res) => {
  try {
    const { day, period, role, department, pnr, userId, email, sectionId, section } = req.query;

    let user = req.user || null;
    if (!user && (role || pnr || userId || email)) {
      user = {
        role: role ? role.toUpperCase() : 'GUEST',
        pnr: pnr || null,
        userId: userId || null,
        email: email || null,
        departmentId: department || 'CSE'
      };
    }

    const data = await getRoleSpecificDashboard(user, {
      dayOfWeek: day || 'MONDAY',
      periodIndex: period || 1,
      departmentId: department || 'CSE',
      sectionId: sectionId || section || null
    });

    res.json({
      success: true,
      data
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message
    });
  }
});

// Get real-time or filtered room & lab availability
router.get('/', async (req, res) => {
  try {
    const {
      semester,
      day,
      period,
      duration,
      type,
      department,
      school,
      status,
      q
    } = req.query;

    const data = await getFacilityAvailability({
      semesterId: semester || 'ALL',
      dayOfWeek: (day || 'MONDAY').toUpperCase(),
      periodIndex: period || 1,
      duration: duration ? parseInt(duration, 10) : 1,
      facilityType: (type || 'ALL').toUpperCase(),
      departmentId: department || 'ALL',
      // `school` narrows availability to one academic school (Dean school-wide scope).
      schoolId: school || 'ALL',
      statusFilter: (status || 'ALL').toUpperCase(),
      searchQuery: q || ''
    });

    res.json({
      success: true,
      data
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message
    });
  }
});

// Get all facilities (classrooms and laboratories)
router.get('/facilities', async (req, res) => {
  try {
    const { department, type } = req.query;
    const data = await getFacilityAvailability({
      departmentId: department || 'ALL',
      facilityType: type || 'ALL'
    });
    res.json({
      success: true,
      count: data.facilities.length,
      data: data.facilities
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message
    });
  }
});

// Get full weekly schedule for a specific room or lab
router.get(['/facility/:id/weekly', '/facilities/:id/weekly'], async (req, res) => {
  try {
    const schedule = await getFacilityWeeklySchedule(req.params.id);
    if (!schedule) {
      return res.status(404).json({
        success: false,
        error: 'FACILITY_NOT_FOUND',
        message: `Classroom or Laboratory '${req.params.id}' was not found.`
      });
    }

    res.json({
      success: true,
      data: schedule
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message
    });
  }
});

// Get faculty available (free) during a specific period
router.get('/free-faculty', async (req, res) => {
  try {
    const { day, period, excludeFaculty, excludeFacultyId, department } = req.query;
    if (!day || !period) {
      return res.status(400).json({
        success: false,
        error: 'BAD_REQUEST',
        message: 'Query parameters "day" and "period" are required.'
      });
    }

    const result = await getFreeFacultyForPeriod(
      day.toUpperCase(),
      period,
      excludeFacultyId || excludeFaculty || null,
      department || 'CSE'
    );

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

// Admin Facility Management: Create Classroom or Laboratory
const {
  createFacility,
  updateFacility,
  deleteFacility
} = require('../services/availabilityService');

router.post('/facilities', requireAuth, requireRole(['SUPER_ADMIN', 'DEPT_ADMIN']), async (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const facility = await createFacility(req.body, req.user, ip);
    res.status(201).json({
      success: true,
      message: 'Facility created successfully.',
      data: facility
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: 'CREATE_FAILED',
      message: err.message
    });
  }
});

router.put('/facilities/:id', requireAuth, requireRole(['SUPER_ADMIN', 'DEPT_ADMIN']), async (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const facility = await updateFacility(req.params.id, req.body, req.user, ip);
    res.json({
      success: true,
      message: `Facility '${req.params.id}' updated successfully. Capacity: ${facility.capacity}.`,
      data: facility
    });
  } catch (err) {
    const isNotFound = err.message && err.message.includes('not found');
    res.status(isNotFound ? 404 : 400).json({
      success: false,
      error: isNotFound ? 'NOT_FOUND' : 'UPDATE_FAILED',
      message: err.message
    });
  }
});

router.delete('/facilities/:id', requireAuth, requireRole(['SUPER_ADMIN', 'DEPT_ADMIN']), async (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const result = await deleteFacility(req.params.id, req.user, ip);
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
