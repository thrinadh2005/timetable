const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { db } = require('../config/database');
const { requireAuth, requireRole } = require('../middleware/auth');
const { rateLimiter } = require('../middleware/security');
const { getSchoolDepartments, getDeanSchoolScope } = require('../services/departmentService');

// GET /api/v1/notices - Retrieve digital notices with filtering
router.get('/', async (req, res) => {
  try {
    const { category, search, department, school } = req.query;

    let query = `
      SELECT notice_id, title, author_name, author_designation, author_initials,
             category, publish_date, summary, full_content, tags, likes_count, department_id, created_at
      FROM digital_notices
      WHERE 1=1
    `;
    const params = [];

    if (category && category !== 'All') {
      params.push(category);
      query += ` AND category = $${params.length}`;
    }

    if (school) {
      // School-wide Dean scope: circulars targeted at the school's departments plus campus-wide.
      const schoolDepartments = await getSchoolDepartments(school);
      if (schoolDepartments.length === 0) {
        query += ` AND 1 = 0`;
      } else {
        const placeholders = schoolDepartments.map(d => {
          params.push(d);
          return `$${params.length}`;
        }).join(', ');
        query += ` AND (department_id IN (${placeholders}) OR department_id = 'ALL')`;
      }
    } else if (department) {
      params.push(department);
      query += ` AND (department_id = $${params.length} OR department_id = 'ALL')`;
    }

    if (search && search.trim()) {
      const term = `%${search.trim().toLowerCase()}%`;
      params.push(term);
      const p = `$${params.length}`;
      query += ` AND (LOWER(title) LIKE ${p} OR LOWER(summary) LIKE ${p} OR LOWER(author_name) LIKE ${p} OR LOWER(tags) LIKE ${p})`;
    }

    query += ` ORDER BY created_at DESC, notice_id DESC`;

    const notices = await db.all(query, params);

    // Format tags array
    const formatted = notices.map(n => ({
      ...n,
      tags: n.tags ? n.tags.split(',').map(t => t.trim()).filter(Boolean) : []
    }));

    // Category count statistics
    const stats = await db.all(`
      SELECT category, COUNT(*)::int as count
      FROM digital_notices
      GROUP BY category
    `);

    const categoryCounts = { All: notices.length };
    stats.forEach(s => {
      categoryCounts[s.category] = s.count;
    });

    res.json({
      success: true,
      data: formatted,
      categoryCounts
    });
  } catch (err) {
    console.error('Error fetching notices:', err);
    res.status(500).json({ success: false, message: 'Failed to retrieve digital notices.' });
  }
});

// POST /api/v1/notices/:id/like - Like a notice (authenticated)
router.post('/:id/like', requireAuth, rateLimiter(20, 60000), async (req, res) => {
  try {
    const { id } = req.params;
    const update = await db.run(`
      UPDATE digital_notices
      SET likes_count = likes_count + 1
      WHERE notice_id = $1
    `, [id]);

    if (update.changes === 0) {
      return res.status(404).json({ success: false, message: 'Notice not found.' });
    }

    const updated = await db.get(`SELECT likes_count FROM digital_notices WHERE notice_id = $1`, [id]);

    res.json({
      success: true,
      likes_count: updated.likes_count
    });
  } catch (err) {
    console.error('Error liking notice:', err);
    res.status(500).json({ success: false, message: 'Failed to record like.' });
  }
});

// POST /api/v1/notices - Publish a new digital notice (COORDINATOR, DEPT_ADMIN, SUPER_ADMIN)
router.post('/', requireAuth, requireRole(['COORDINATOR', 'DEPT_ADMIN', 'DEAN', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const title = (req.body.title || '').trim();
    const category = req.body.category || 'Announcements';
    const summary = (req.body.summary || req.body.content || req.body.full_content || '').trim();
    const full_content = req.body.full_content || req.body.content || summary;
    const { tags, department_id } = req.body;

    if (!title || !category || !summary) {
      return res.status(400).json({ success: false, message: 'Title, category, and summary (or content) are required.' });
    }

    const validCategories = ['Posts', 'Announcements', 'Polls', 'Urgent Notices', 'Important Notices'];
    const matchedCategory = validCategories.find(c => c.toLowerCase() === category.toLowerCase()) || 'Announcements';

    const notice_id = 'NOT-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    const author_name = req.user.display_name || req.user.username || 'Academic Administration';
    const author_designation = req.user.role === 'SUPER_ADMIN' ? 'Dean of Academic Affairs' : req.user.role === 'DEPT_ADMIN' ? 'Head of Department' : 'Timetable Coordinator';
    const author_initials = author_name.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'AA';
    const publish_date = new Date().toISOString().split('T')[0];
    const dept = department_id || (req.user.role === 'SUPER_ADMIN' ? 'ALL' : (req.user.department_id || 'CSE'));
    const tagStr = Array.isArray(tags) ? tags.join(', ') : (tags || 'Circular, Academic');

    await db.run(`
      INSERT INTO digital_notices (
        notice_id, title, author_name, author_designation, author_initials,
        category, publish_date, summary, full_content, tags, likes_count, department_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, $11)
    `, [
      notice_id, title, author_name, author_designation, author_initials,
      matchedCategory, publish_date, summary, full_content || summary, tagStr, dept
    ]);

    const created = await db.get(`SELECT * FROM digital_notices WHERE notice_id = $1`, [notice_id]);

    res.status(201).json({
      success: true,
      message: 'Digital notice published successfully.',
      data: {
        ...created,
        tags: created.tags ? created.tags.split(',').map(t => t.trim()) : []
      }
    });
  } catch (err) {
    console.error('Error publishing notice:', err);
    res.status(500).json({ success: false, message: 'Failed to publish digital notice.' });
  }
});

router.put('/:id', requireAuth, requireRole(['COORDINATOR', 'DEPT_ADMIN', 'DEAN', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const noticeId = req.params.id;
    const curRes = await db.query('SELECT * FROM digital_notices WHERE notice_id = $1', [noticeId]);
    if (curRes.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Notice not found' });
    }
    const cur = curRes.rows[0];
    if (req.user.role === 'DEAN') {
      const deanSchool = await getDeanSchoolScope(req.user.userId);
      const allowed = await getSchoolDepartments(deanSchool);
      if (cur.department_id && cur.department_id !== 'ALL' && !allowed.includes(cur.department_id)) {
        return res.status(403).json({ status: 'error', message: 'Forbidden: Notice outside your school scope' });
      }
    } else if (req.user.role !== 'SUPER_ADMIN') {
      if (cur.department_id && cur.department_id !== 'ALL' && cur.department_id !== req.user.departmentId) {
        return res.status(403).json({ status: 'error', message: 'Forbidden: Notice belongs to another department' });
      }
    }

    const b = req.body || {};
    const title = b.title !== undefined ? String(b.title).trim() : cur.title;
    const category = b.category !== undefined ? String(b.category).trim() : cur.category;
    const summary = b.summary !== undefined ? String(b.summary).trim() : cur.summary;
    const fullContent = b.fullContent !== undefined || b.full_content !== undefined
      ? String(b.fullContent ?? b.full_content ?? '').trim()
      : cur.full_content;
    const tags = b.tags !== undefined ? String(b.tags || '').trim() : cur.tags;
    const departmentId = b.departmentId !== undefined || b.department_id !== undefined
      ? String(b.departmentId ?? b.department_id ?? cur.department_id).trim().toUpperCase()
      : cur.department_id;

    if (!title || !summary) {
      return res.status(400).json({ status: 'error', message: 'title and summary are required' });
    }

    const updated = await db.query(
      `UPDATE digital_notices
       SET title = $1, category = $2, summary = $3, full_content = $4, tags = $5, department_id = $6
       WHERE notice_id = $7
       RETURNING *`,
      [title, category, summary, fullContent, tags, departmentId, noticeId]
    );
    res.json({ status: 'success', data: updated.rows[0] });
  } catch (err) {
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
});

router.delete('/:id', requireAuth, requireRole(['COORDINATOR', 'DEPT_ADMIN', 'DEAN', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const noticeId = req.params.id;
    const curRes = await db.query('SELECT * FROM digital_notices WHERE notice_id = $1', [noticeId]);
    if (curRes.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Notice not found' });
    }
    const cur = curRes.rows[0];
    if (req.user.role === 'DEAN') {
      const deanSchool = await getDeanSchoolScope(req.user.userId);
      const allowed = await getSchoolDepartments(deanSchool);
      if (cur.department_id && cur.department_id !== 'ALL' && !allowed.includes(cur.department_id)) {
        return res.status(403).json({ status: 'error', message: 'Forbidden: Notice outside your school scope' });
      }
    } else if (req.user.role !== 'SUPER_ADMIN') {
      if (cur.department_id && cur.department_id !== 'ALL' && cur.department_id !== req.user.departmentId) {
        return res.status(403).json({ status: 'error', message: 'Forbidden: Notice belongs to another department' });
      }
    }
    await db.query('DELETE FROM digital_notices WHERE notice_id = $1', [noticeId]);
    res.json({ status: 'success', data: { deleted: true, notice_id: noticeId } });
  } catch (err) {
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
});

module.exports = router;

