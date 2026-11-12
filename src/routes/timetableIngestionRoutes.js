const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { requireAuth, requireRole } = require('../middleware/auth');
const { rateLimiter } = require('../middleware/security');
const {
  processAndStageDocument,
  getStagedDocument,
  listStagedDocuments,
  updateStagedDocumentSlots,
  commitStagedDocument
} = require('../services/timetableIngestionService');

// Multer memory storage configuration (Max 15MB file size)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.xlsx', '.xls', '.csv'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file extension: ${ext}. Supported formats are .pdf, .xlsx, .xls, and .csv.`));
    }
  }
});

/**
 * Upload and process institutional timetable document (PDF, Excel, CSV).
 * Accessible by SUPER_ADMIN, DEPT_ADMIN, and COORDINATOR.
 */
router.post('/upload', requireAuth, requireRole(['SUPER_ADMIN', 'DEPT_ADMIN', 'COORDINATOR']), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'NO_FILE_UPLOADED',
        message: 'Please attach an Excel (.xlsx, .xls, .csv) or PDF (.pdf) timetable file to upload.'
      });
    }

    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const deptId = req.body.departmentId || req.user.departmentId || 'CSE';

    // Role boundary: Dept Admin and Coordinator can only ingest for their department
    if ((req.user.role === 'DEPT_ADMIN' || req.user.role === 'COORDINATOR') && req.user.departmentId && req.user.departmentId !== deptId) {
      return res.status(403).json({
        success: false,
        error: 'ROLE_PERMISSION_DENIED',
        message: `Department coordinators and administrators can only ingest and alter timetables for ${req.user.departmentId}.`
      });
    }

    const result = await processAndStageDocument(
      req.file.buffer,
      req.file.originalname,
      deptId,
      req.user,
      ip
    );

    res.status(201).json({
      success: true,
      message: `Document "${req.file.originalname}" processed successfully. Extracted ${result.totalSlotsParsed} timetable slots ready for staging and review.`,
      data: result
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: 'INGESTION_ERROR',
      message: err.message
    });
  }
});

/**
 * Lists all staged documents.
 */
router.get('/staged', requireAuth, requireRole(['SUPER_ADMIN', 'DEPT_ADMIN', 'COORDINATOR']), async (req, res) => {
  try {
    const dept = (req.user.role === 'SUPER_ADMIN') ? (req.query.department || 'ALL') : (req.user.departmentId || 'CSE');
    const docs = await listStagedDocuments(dept);
    res.json({
      success: true,
      data: docs
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'LIST_STAGED_ERROR',
      message: err.message
    });
  }
});

/**
 * Get details and slots of a staged document.
 */
router.get('/staged/:docId', requireAuth, requireRole(['SUPER_ADMIN', 'DEPT_ADMIN', 'COORDINATOR']), async (req, res) => {
  try {
    const doc = await getStagedDocument(req.params.docId);
    res.json({
      success: true,
      data: doc
    });
  } catch (err) {
    res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: err.message
    });
  }
});

/**
 * Update / Edit extracted slots in a staged document before publishing.
 */
router.put('/staged/:docId/slots', requireAuth, requireRole(['SUPER_ADMIN', 'DEPT_ADMIN', 'COORDINATOR']), async (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const { slots } = req.body;
    if (!Array.isArray(slots)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_SLOTS_PAYLOAD',
        message: 'Slots payload must be an array of slot objects.'
      });
    }

    const result = await updateStagedDocumentSlots(req.params.docId, slots, req.user, ip);
    res.json({
      success: true,
      message: `Staged timetable updated. ${result.totalSlots} slots saved.`,
      data: result
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: 'UPDATE_STAGED_ERROR',
      message: err.message
    });
  }
});

/**
 * Commit staged timetable into the live system.
 */
router.post('/commit/:docId', requireAuth, requireRole(['SUPER_ADMIN', 'DEPT_ADMIN', 'COORDINATOR']), async (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const result = await commitStagedDocument(req.params.docId, req.user, ip);
    res.json({
      success: true,
      message: result.message,
      data: result
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'COMMIT_ERROR',
      message: err.message
    });
  }
});

module.exports = router;
