const express = require('express');
const router = express.Router();
const { 
  getLaboratoriesByDepartment, 
  getLaboratoryDetails, 
  getLaboratorySchedule,
  getUserSpecificLaboratories,
  createLaboratory,
  updateLaboratory,
  deleteLaboratory
} = require('../services/laboratoryService');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getDeanSchoolScope } = require('../services/departmentService');

router.get('/', async (req, res) => {
  try {
    const { department, school, scope, pnr, email, role, section_id, sectionId, incharge_id, inchargeId } = req.query;

    const result = await getUserSpecificLaboratories({
      user: req.user || null,
      department: department || null,
      // `school` narrows the directory to one academic school (Dean school-wide scope).
      school: school || null,
      scope: scope || ((req.user || role || pnr || email || section_id || sectionId || incharge_id || inchargeId) ? 'MY_LABS' : 'ALL'),
      pnr: pnr || (req.user ? (req.user.pnr || req.user.pnrno) : null),
      email: email || (req.user ? req.user.email : null),
      role: role || (req.user ? req.user.role : null),
      sectionId: section_id || sectionId || (req.user ? req.user.sectionId : null),
      inchargeId: incharge_id || inchargeId || null
    });

    res.json({
      success: true,
      count: result.labs.length,
      userScope: result.scope,
      relationDescription: result.relationDescription,
      allCount: result.allCount,
      myCount: result.myCount,
      inchargeStaffList: result.inchargeStaffList || [],
      data: result.labs
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message
    });
  }
});

// Admin Facility Management: Create Laboratory
router.post('/', requireAuth, requireRole(['SUPER_ADMIN', 'DEPT_ADMIN']), async (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const lab = await createLaboratory(req.body, req.user, ip);
    res.status(201).json({
      success: true,
      message: `Laboratory '${lab.name}' created successfully.`,
      data: lab
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: 'CREATE_FAILED',
      message: err.message
    });
  }
});

// Admin Facility Management: Update Laboratory & Capacity
router.put('/:id', requireAuth, requireRole(['SUPER_ADMIN', 'DEPT_ADMIN']), async (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const lab = await updateLaboratory(req.params.id, req.body, req.user, ip);
    res.json({
      success: true,
      message: `Laboratory '${lab.name}' updated successfully. Capacity: ${lab.capacity}.`,
      data: lab
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

// Admin Facility Management: Delete Laboratory
router.delete('/:id', requireAuth, requireRole(['SUPER_ADMIN', 'DEPT_ADMIN']), async (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const result = await deleteLaboratory(req.params.id, req.user, ip);
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

// Lab Assistant & Admin Bookings / Events
const { createLabBooking, getLabBookings, deleteLabBooking, approveLabBooking, getPendingLabRequests } = require('../services/labBookingService');

// Get pending lab requests for HOD/Dean approval workflow
router.get('/pending-requests', requireAuth, requireRole(['SUPER_ADMIN', 'DEAN', 'DEPT_ADMIN']), async (req, res) => {
  try {
    let requests;
    if (req.user.role === 'DEAN') {
      // Dean sees every pending request raised within their school.
      const scope = await getDeanSchoolScope(req.user.userId);
      requests = await getPendingLabRequests(scope ? scope.departmentIds : []);
    } else {
      const dept = req.user.role === 'SUPER_ADMIN' ? (req.query.department || null) : (req.user.departmentId || null);
      requests = await getPendingLabRequests(dept);
    }
    res.json({
      success: true,
      count: requests.length,
      data: requests
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message
    });
  }
});

// Consolidated booking oversight. Each governor sees the reservations that fall
// inside their mandate: Super Admin (campus-wide), Dean (school-wide), HOD (department),
// Lab Staff (governed or department labs without an assigned custodian), and Faculty/Students/Coordinators (own requests).
router.get('/all-bookings', requireAuth, requireRole(['SUPER_ADMIN', 'DEAN', 'DEPT_ADMIN', 'NON_TEACHING_STAFF', 'COORDINATOR', 'TEACHING_STAFF', 'STUDENT']), async (req, res) => {
  try {
    const labIdsOf = async (department, school) =>
      (await getLaboratoriesByDepartment(department, school)).map((lab) => lab.lab_id);

    let bookings;
    if (req.user.role === 'SUPER_ADMIN') {
      bookings = await getLabBookings(null, true);
    } else if (req.user.role === 'DEAN') {
      const scope = await getDeanSchoolScope(req.user.userId);
      bookings = await getLabBookings(null, true, scope ? await labIdsOf(null, scope.schoolId) : []);
    } else if (req.user.role === 'DEPT_ADMIN') {
      bookings = await getLabBookings(null, true, await labIdsOf(req.user.departmentId, null));
    } else if (req.user.role === 'NON_TEACHING_STAFF') {
      const staffId = req.user.pnrno || req.user.pnr;
      const labs = await getLaboratoriesByDepartment(req.user.departmentId, null);
      const governed = labs
        .filter((lab) => lab.incharge_id === staffId || lab.assistant_incharge_id === staffId)
        .map((lab) => lab.lab_id);
      const scopeLabIds = governed.length > 0 ? governed : labs.map((lab) => lab.lab_id);
      bookings = await getLabBookings(null, true, scopeLabIds);
    } else {
      bookings = await getLabBookings(null, true, null, req.user.userId);
    }

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

// HOD / Dean Lab Booking Approval Endpoint
router.put('/bookings/:bookingId/approval', requireAuth, requireRole(['SUPER_ADMIN', 'DEAN', 'DEPT_ADMIN']), async (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const action = req.body.action || 'APPROVE';
    const result = await approveLabBooking(req.params.bookingId, req.user, action, ip);
    res.json({
      success: true,
      data: result,
      message: result.message
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: 'APPROVAL_FAILED',
      message: err.message
    });
  }
});

// Lab Incidents Management (Reporting, Investigation, Resolution)
router.get('/incidents', requireAuth, async (req, res) => {
  try {
    const { department, status, lab_id } = req.query;
    let query = `
      SELECT li.*, l.name as lab_name, d.name as department_name
      FROM lab_incidents li
      JOIN laboratories l ON li.lab_id = l.lab_id
      JOIN departments d ON li.department_id = d.department_id
      WHERE 1=1
    `;
    const params = [];

    // Role-based scoping: Non-teaching staff and HOD scoped to their department unless global admin/dean
    const isGlobal = req.user.role === 'SUPER_ADMIN' || req.user.role === 'DEAN';
    const effectiveDept = isGlobal ? (department || 'ALL') : (req.user.departmentId || 'CSE');

    if (effectiveDept && effectiveDept !== 'ALL') {
      params.push(effectiveDept);
      query += ` AND li.department_id = $${params.length}`;
    }
    if (status && status !== 'ALL') {
      params.push(status);
      query += ` AND li.status = $${params.length}`;
    }
    if (lab_id && lab_id !== 'ALL') {
      params.push(lab_id);
      query += ` AND li.lab_id = $${params.length}`;
    }

    query += ' ORDER BY li.created_at DESC';
    const { db } = require('../config/database');
    const incidents = await db.all(query, params);

    res.json({
      success: true,
      count: incidents.length,
      data: incidents
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message
    });
  }
});

router.post('/incidents', requireAuth, requireRole(['SUPER_ADMIN', 'DEPT_ADMIN', 'NON_TEACHING_STAFF', 'TEACHING_STAFF']), async (req, res) => {
  try {
    const { lab_id, labId, incident_date, incident_time, severity, equipment_affected, description, photo_url } = req.body;
    const targetLabId = lab_id || labId;

    if (!targetLabId || !description) {
      return res.status(400).json({
        success: false,
        error: 'BAD_REQUEST',
        message: 'Laboratory ID and incident description are required.'
      });
    }

    const { db } = require('../config/database');
    const lab = await db.get('SELECT lab_id, department_id, name FROM laboratories WHERE lab_id = $1', [targetLabId]);
    if (!lab) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: `Laboratory '${targetLabId}' does not exist.`
      });
    }

    const crypto = require('crypto');
    const incidentId = `INC-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;
    const dateVal = incident_date || new Date().toISOString().split('T')[0];
    const timeVal = incident_time || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const severityVal = (severity || 'MEDIUM').toUpperCase();

    await db.run(`
      INSERT INTO lab_incidents (incident_id, lab_id, department_id, reporter_user_id, reporter_name, incident_date, incident_time, severity, equipment_affected, description, photo_url, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'REPORTED')
    `, [
      incidentId,
      targetLabId,
      lab.department_id,
      req.user.userId,
      req.user.fullName || 'Lab Staff',
      dateVal,
      timeVal,
      severityVal,
      equipment_affected || 'General Hardware/Facility',
      description.trim(),
      photo_url || ''
    ]);

    res.status(201).json({
      success: true,
      message: `Incident ${incidentId} reported successfully for ${lab.name}. Department In-charge notified.`,
      data: {
        incidentId,
        labId: targetLabId,
        labName: lab.name,
        departmentId: lab.department_id,
        severity: severityVal,
        status: 'REPORTED'
      }
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: 'INCIDENT_REPORT_FAILED',
      message: err.message
    });
  }
});

router.patch('/incidents/:id/status', requireAuth, requireRole(['SUPER_ADMIN', 'DEPT_ADMIN', 'NON_TEACHING_STAFF']), async (req, res) => {
  try {
    const { status, resolution_notes } = req.body;
    const { db } = require('../config/database');
    const existing = await db.get('SELECT * FROM lab_incidents WHERE incident_id = $1', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Incident not found.' });
    }

    await db.run('UPDATE lab_incidents SET status = $1, resolution_notes = $2 WHERE incident_id = $3', [
      status || 'RESOLVED',
      resolution_notes || '',
      req.params.id
    ]);

    res.json({
      success: true,
      message: `Incident ${req.params.id} updated to ${status}.`
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: err.message
    });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const lab = await getLaboratoryDetails(req.params.id);
    if (!lab) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: `Laboratory '${req.params.id}' was not found.`
      });
    }
    res.json({
      success: true,
      data: lab
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message
    });
  }
});

router.get('/:id/schedule', async (req, res) => {
  try {
    const schedule = await getLaboratorySchedule(req.params.id);
    if (!schedule) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: `Laboratory schedule for '${req.params.id}' was not found.`
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

router.get('/:id/bookings', async (req, res) => {
  try {
    const bookings = await getLabBookings(req.params.id);
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

router.post('/:id/bookings', requireAuth, requireRole(['SUPER_ADMIN', 'DEAN', 'DEPT_ADMIN', 'COORDINATOR', 'TEACHING_STAFF', 'NON_TEACHING_STAFF', 'STUDENT']), async (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const booking = await createLabBooking({
      ...req.body,
      labId: req.params.id
    }, req.user, ip);

    res.status(201).json({
      success: true,
      message: booking.status === 'PENDING' ? 'Laboratory booking request submitted successfully. Pending HOD approval.' : 'Laboratory event / booking scheduled and confirmed.',
      data: booking
    });
  } catch (err) {
    const isConflict = err.message && (err.message.includes('Conflict') || err.message.includes('already'));
    res.status(isConflict ? 409 : 400).json({
      success: false,
      error: isConflict ? 'LAB_SCHEDULE_CONFLICT' : 'BOOKING_FAILED',
      message: err.message
    });
  }
});

router.delete('/bookings/:bookingId', requireAuth, requireRole(['SUPER_ADMIN', 'DEAN', 'DEPT_ADMIN', 'COORDINATOR', 'TEACHING_STAFF', 'NON_TEACHING_STAFF', 'STUDENT']), async (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const result = await deleteLabBooking(req.params.bookingId, req.user, ip);
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

