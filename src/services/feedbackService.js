const crypto = require('crypto');
const { db } = require('../config/database');
const { notifyRole, notifyUser } = require('./notificationService');

async function submitFeedback(data, currentUser) {
  const { rating, title, department_id } = data;
  const comments = data.comments || data.description;

  const validCategories = ['TIMETABLE', 'LAB_FACILITY', 'FEATURE_REQUEST', 'BUG_REPORT', 'GENERAL'];
  let normCategory = (data.category || 'GENERAL').toUpperCase();
  if (normCategory === 'INFRASTRUCTURE' || normCategory === 'FACILITY' || normCategory === 'LAB') {
    normCategory = 'LAB_FACILITY';
  } else if (!validCategories.includes(normCategory)) {
    normCategory = 'GENERAL';
  }

  if (!rating || !title || !comments) {
    throw new Error('Rating (1-5), title, and comments (or description) are required.');
  }

  const numRating = parseInt(rating, 10);
  if (isNaN(numRating) || numRating < 1 || numRating > 5) {
    throw new Error('Rating must be an integer between 1 and 5.');
  }

  const feedbackId = `FDB-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;
  const userId = currentUser ? currentUser.userId : null;
  const userName = currentUser ? currentUser.fullName : (data.user_name || 'Anonymous User');
  const userRole = currentUser ? currentUser.role : 'GUEST';
  const deptId = department_id || (currentUser ? currentUser.departmentId : null);

  await db.run(
    `
      INSERT INTO user_feedback (
        feedback_id, user_id, user_name, role, department_id,
        category, rating, title, comments, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDING')
    `,
    [
      feedbackId,
      userId,
      userName,
      userRole,
      deptId,
      normCategory,
      numRating,
      title.trim(),
      comments.trim()
    ]
  );

  const feedbackNotification = {
    type: 'FEEDBACK',
    title: `New Feedback: ${title.trim().substring(0, 40)}`,
    message: `${userName} (${userRole}) submitted ${normCategory} feedback with rating ${numRating}/5: "${title.trim()}"`,
    entityType: 'FEEDBACK',
    entityId: feedbackId,
    actionUrl: 'admin?subtab=feedback',
    createdByUserId: userId,
    createdByName: userName
  };

  for (const r of ['SUPER_ADMIN', 'DEPT_ADMIN']) {
    await notifyRole(r, feedbackNotification, deptId);
  }

  if (deptId) {
    const deans = await db.all(
      `
        SELECT dsa.user_id
        FROM dean_school_assignments dsa
        JOIN departments dep ON dep.school_id = dsa.school_id
        WHERE dep.department_id = $1
      `,
      [deptId]
    );
    for (const dn of deans) {
      await notifyUser(dn.user_id, feedbackNotification, deptId);
    }
  }

  return {
    feedbackId,
    status: 'PENDING',
    message: 'Thank you for your feedback! Your submission has been received by the academic administration.'
  };
}

async function getFeedback(filter = {}) {
  let query = `
    SELECT 
      f.feedback_id,
      f.user_id,
      f.user_name,
      f.role,
      f.department_id,
      d.name as department_name,
      f.category,
      f.rating,
      f.title,
      f.comments,
      f.status,
      f.admin_notes,
      f.created_at
    FROM user_feedback f
    LEFT JOIN departments d ON f.department_id = d.department_id
  `;

  const where = [];
  const params = [];
  const pushParam = (val) => {
    params.push(val);
    return `$${params.length}`;
  };

  if (filter.category && filter.category !== 'ALL') {
    where.push(`f.category = ${pushParam(filter.category)}`);
  }
  if (filter.status && filter.status !== 'ALL') {
    where.push(`f.status = ${pushParam(filter.status)}`);
  }
  if (filter.userId) {
    where.push(`f.user_id = ${pushParam(filter.userId)}`);
  }
  if (Array.isArray(filter.departmentIds)) {
    if (filter.departmentIds.length === 0) {
      where.push('1 = 0');
    } else {
      const phs = filter.departmentIds.map((d) => pushParam(d)).join(', ');
      where.push(`f.department_id IN (${phs})`);
    }
  } else if (filter.departmentId) {
    where.push(`f.department_id = ${pushParam(filter.departmentId)}`);
  }

  if (where.length > 0) {
    query += ' WHERE ' + where.join(' AND ');
  }

  query += ' ORDER BY f.created_at DESC';

  return db.all(query, params);
}

async function updateFeedbackStatus(feedbackId, status, adminNotes, currentUser) {
  const allowed = ['PENDING', 'REVIEWED', 'IMPLEMENTED', 'DISMISSED'];
  if (!allowed.includes(status)) {
    throw new Error(`Invalid status. Must be one of: ${allowed.join(', ')}`);
  }

  const existing = await db.get('SELECT * FROM user_feedback WHERE feedback_id = $1', [feedbackId]);
  if (!existing) {
    throw new Error(`Feedback '${feedbackId}' not found.`);
  }

  await db.run(
    `
      UPDATE user_feedback
      SET status = $1, admin_notes = $2
      WHERE feedback_id = $3
    `,
    [status, adminNotes || null, feedbackId]
  );

  if (existing.user_id) {
    await notifyUser(existing.user_id, {
      type: 'FEEDBACK_UPDATE',
      title: 'Feedback Update',
      message: `Your feedback "${existing.title}" status was updated to ${status}.${adminNotes ? ' Note: ' + adminNotes : ''}`,
      entityType: 'FEEDBACK',
      entityId: feedbackId,
      actionUrl: 'settings',
      createdByUserId: currentUser.userId,
      createdByName: currentUser.fullName
    });
  }

  return { feedbackId, status, adminNotes };
}

async function deleteFeedback(feedbackId, currentUser) {
  const existing = await db.get('SELECT * FROM user_feedback WHERE feedback_id = $1', [feedbackId]);
  if (!existing) {
    throw new Error(`Feedback '${feedbackId}' not found.`);
  }

  if (
    currentUser &&
    currentUser.role === 'DEPT_ADMIN' &&
    existing.department_id &&
    existing.department_id !== currentUser.departmentId
  ) {
    throw new Error('Unauthorized: cannot delete feedback from another department.');
  }

  await db.run('DELETE FROM user_feedback WHERE feedback_id = $1', [feedbackId]);

  return { success: true, feedbackId, message: `Feedback ticket "${existing.feedback_id}" removed successfully.` };
}

module.exports = {
  submitFeedback,
  getFeedback,
  updateFeedbackStatus,
  deleteFeedback
};
