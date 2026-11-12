const { db } = require('../config/database');
const crypto = require('crypto');
const { publish } = require('./notificationStream');

const NOTIFICATION_TYPES = {
  LAB_REQUEST: 'LAB_REQUEST',
  LAB_APPROVAL: 'LAB_APPROVAL',
  SUBSTITUTION_REQUEST: 'SUBSTITUTION_REQUEST',
  SUBSTITUTION_APPROVAL: 'SUBSTITUTION_APPROVAL',
  TIMETABLE_CHANGE: 'TIMETABLE_CHANGE',
  ANNOUNCEMENT: 'ANNOUNCEMENT'
};

function generateNotificationId() {
  return `NTF-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;
}

async function getUnreadCount(userId) {
  const row = await db.get(
    'SELECT COUNT(*)::int as count FROM notifications WHERE recipient_user_id = $1 AND is_read = 0',
    [userId]
  );
  return row ? row.count : 0;
}

/**
 * Inserts a single notification row. Returns the notification id or null.
 */
async function createNotification({
  recipientUserId,
  recipientRole = null,
  departmentId = null,
  type,
  title,
  message,
  entityType = null,
  entityId = null,
  actionUrl = null,
  createdByUserId = null,
  createdByName = null
}) {
  if (!recipientUserId || !type || !title || !message) {
    return null;
  }
  const notificationId = generateNotificationId();
  const createdAt = new Date().toISOString();

  await db.run(
    `
      INSERT INTO notifications (
        notification_id, recipient_user_id, recipient_role, department_id, type, title, message,
        entity_type, entity_id, action_url, created_by_user_id, created_by_name, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `,
    [
      notificationId,
      recipientUserId,
      recipientRole,
      departmentId,
      type,
      title,
      message,
      entityType,
      entityId,
      actionUrl,
      createdByUserId,
      createdByName,
      createdAt
    ]
  );

  const unreadCount = await getUnreadCount(recipientUserId);

  publish(recipientUserId, {
    notification_id: notificationId,
    type,
    title,
    message,
    entity_type: entityType,
    entity_id: entityId,
    action_url: actionUrl,
    created_by_name: createdByName,
    created_at: createdAt,
    is_read: 0,
    unreadCount
  });

  return notificationId;
}

/**
 * Fans out a notification to every ACTIVE user of a role, optionally scoped to
 * a department. Departments with no matching role members fall back to all
 * members of that role so requests are never silently dropped.
 */
async function notifyRole(role, payload, departmentId = null) {
  const roleList = Array.isArray(role) ? role : [role];
  const ids = [];

  for (const rName of roleList) {
    let recipients = [];
    if (departmentId) {
      recipients = await db.all(
        "SELECT user_id FROM users WHERE role = $1 AND status = 'ACTIVE' AND department_id = $2",
        [rName, departmentId]
      );
    }
    if (recipients.length === 0) {
      recipients = await db.all(
        "SELECT user_id FROM users WHERE role = $1 AND status = 'ACTIVE'",
        [rName]
      );
    }
    for (const r of recipients) {
      const id = await createNotification({ ...payload, recipientUserId: r.user_id, recipientRole: rName });
      if (id) ids.push(id);
    }
  }
  return ids;
}

/**
 * Fans out a notification to every ACTIVE member of a department, optionally
 * filtered to a set of roles.
 */
async function notifyDepartment(departmentId, payload, roles = null) {
  if (!departmentId) return [];
  let sql = "SELECT user_id, role FROM users WHERE status = 'ACTIVE' AND department_id = $1";
  const params = [departmentId];
  if (roles && roles.length) {
    const placeholders = roles.map((_, idx) => `$${idx + 2}`).join(', ');
    sql += ` AND role IN (${placeholders})`;
    params.push(...roles);
  }
  const recipients = await db.all(sql, params);
  const ids = [];
  for (const r of recipients) {
    const id = await createNotification({ ...payload, recipientUserId: r.user_id, recipientRole: r.role, departmentId });
    if (id) ids.push(id);
  }
  return ids;
}

async function notifyUser(userId, payload, departmentId = null) {
  return createNotification({ ...payload, recipientUserId: userId, departmentId });
}

async function getUserNotifications(userId, { unreadOnly = false, limit = 50 } = {}) {
  const max = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  let query = 'SELECT * FROM notifications WHERE recipient_user_id = $1';
  const params = [userId];
  if (unreadOnly) {
    query += ' AND is_read = 0';
  }
  query += ' ORDER BY created_at DESC, notification_id DESC LIMIT $2';
  params.push(max);
  return db.all(query, params);
}

async function markNotificationRead(notificationId, userId) {
  const result = await db.run(
    'UPDATE notifications SET is_read = 1 WHERE notification_id = $1 AND recipient_user_id = $2',
    [notificationId, userId]
  );
  return result.rowCount > 0;
}

async function markAllRead(userId) {
  const result = await db.run(
    'UPDATE notifications SET is_read = 1 WHERE recipient_user_id = $1 AND is_read = 0',
    [userId]
  );
  return result.rowCount;
}

async function deleteNotification(notificationId, userId) {
  const result = await db.run(
    'DELETE FROM notifications WHERE notification_id = $1 AND recipient_user_id = $2',
    [notificationId, userId]
  );
  return result.rowCount > 0;
}

async function getLabDepartment(labId) {
  const row = await db.get('SELECT department_id FROM laboratories WHERE lab_id = $1', [labId]);
  return row ? row.department_id : null;
}

module.exports = {
  NOTIFICATION_TYPES,
  createNotification,
  notifyRole,
  notifyDepartment,
  notifyUser,
  getUserNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllRead,
  deleteNotification,
  getLabDepartment
};
