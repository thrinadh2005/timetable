const express = require('express');
const router = express.Router();
const {
  getAllDepartments,
  getDepartmentById,
  getSchools,
  getDeanSchoolScope,
  createSchool,
  updateSchool,
  deleteSchool,
  createDepartment,
  updateDepartment,
  deleteDepartment
} = require('../services/departmentService');
const { requireAuth, requireRole } = require('../middleware/auth');

// GET /api/v1/departments/schools - Hierarchy of Academic Schools and Deans
router.get('/schools', async (req, res) => {
  try {
    const schools = await getSchools();
    res.json({
      success: true,
      count: schools.length,
      data: schools
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message
    });
  }
});

router.get('/', async (req, res) => {
  try {
    // `school` narrows the listing to one academic school (Dean school-wide scope).
    const departments = await getAllDepartments(req.query.school || null);
    res.json({
      success: true,
      count: departments.length,
      data: departments
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message
    });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const dept = await getDepartmentById(req.params.id);
    if (!dept) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: `Department '${req.params.id}' was not found.`
      });
    }
    res.json({
      success: true,
      data: dept
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message
    });
  }
});

// ============================================================================
// FULL ALTERATIONS: SCHOOLS & DEPARTMENTS CRUD
// ============================================================================

router.post('/schools', requireAuth, requireRole(['SUPER_ADMIN']), async (req, res) => {
  try {
    const school = await createSchool({
      schoolId: req.body.schoolId || req.body.school_id,
      name: req.body.name,
      deanName: req.body.deanName || req.body.dean_name,
      deanEmail: req.body.deanEmail || req.body.dean_email
    });
    res.status(201).json({ status: 'success', data: school });
  } catch (err) {
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
});

router.put('/schools/:id', requireAuth, requireRole(['SUPER_ADMIN', 'DEAN']), async (req, res) => {
  try {
    if (req.user.role === 'DEAN') {
      const deanScope = await getDeanSchoolScope(req.user.userId);
      if (!deanScope || deanScope !== req.params.id) {
        return res.status(403).json({ status: 'error', message: 'Forbidden: Deans may only update their assigned school' });
      }
    }
    const school = await updateSchool(req.params.id, req.body || {});
    res.json({ status: 'success', data: school });
  } catch (err) {
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
});

router.delete('/schools/:id', requireAuth, requireRole(['SUPER_ADMIN']), async (req, res) => {
  try {
    const result = await deleteSchool(req.params.id);
    res.json({ status: 'success', data: result });
  } catch (err) {
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
});

router.post('/', requireAuth, requireRole(['SUPER_ADMIN', 'DEAN']), async (req, res) => {
  try {
    let targetSchoolId = req.body.schoolId || req.body.school_id || null;
    if (req.user.role === 'DEAN') {
      const deanScope = await getDeanSchoolScope(req.user.userId);
      if (!deanScope) {
        return res.status(403).json({ status: 'error', message: 'Forbidden: Dean school assignment not found' });
      }
      targetSchoolId = deanScope;
    }
    const dept = await createDepartment({
      departmentId: req.body.departmentId || req.body.department_id,
      schoolId: targetSchoolId,
      name: req.body.name,
      description: req.body.description,
      hodName: req.body.hodName || req.body.hod_name,
      contactEmail: req.body.contactEmail || req.body.contact_email,
      contactPhone: req.body.contactPhone || req.body.contact_phone
    });
    res.status(201).json({ status: 'success', data: dept });
  } catch (err) {
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
});

router.put('/:id', requireAuth, requireRole(['SUPER_ADMIN', 'DEAN', 'DEPT_ADMIN']), async (req, res) => {
  try {
    const targetId = String(req.params.id || '').trim().toUpperCase();
    const existing = await getDepartmentById(targetId);
    if (!existing) {
      return res.status(404).json({ status: 'error', message: 'Department not found' });
    }
    if (req.user.role === 'DEPT_ADMIN' && String(req.user.departmentId || '').toUpperCase() !== targetId) {
      return res.status(403).json({ status: 'error', message: 'Forbidden: Department Head may only edit their own department' });
    }
    if (req.user.role === 'DEAN') {
      const deanScope = await getDeanSchoolScope(req.user.userId);
      if (!deanScope || existing.school_id !== deanScope) {
        return res.status(403).json({ status: 'error', message: 'Forbidden: Deans may only update departments inside their school' });
      }
    }
    const updates = { ...(req.body || {}) };
    if (req.user.role !== 'SUPER_ADMIN') {
      delete updates.schoolId;
      delete updates.school_id;
    }
    const updated = await updateDepartment(targetId, updates);
    res.json({ status: 'success', data: updated });
  } catch (err) {
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
});

router.delete('/:id', requireAuth, requireRole(['SUPER_ADMIN', 'DEAN']), async (req, res) => {
  try {
    const targetId = String(req.params.id || '').trim().toUpperCase();
    const existing = await getDepartmentById(targetId);
    if (!existing) {
      return res.status(404).json({ status: 'error', message: 'Department not found' });
    }
    if (req.user.role === 'DEAN') {
      const deanScope = await getDeanSchoolScope(req.user.userId);
      if (!deanScope || existing.school_id !== deanScope) {
        return res.status(403).json({ status: 'error', message: 'Forbidden: Deans may only delete departments inside their school' });
      }
    }
    const result = await deleteDepartment(targetId);
    res.json({ status: 'success', data: result });
  } catch (err) {
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
});

module.exports = router;
