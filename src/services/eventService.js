const crypto = require('crypto');
const { db } = require('../config/database');
const { NOTIFICATION_TYPES, notifyRole, notifyDepartment } = require('./notificationService');

async function getAcademicEvents(filter = {}) {
  let query = `
    SELECT 
      ae.event_id,
      ae.title,
      ae.description,
      ae.event_type,
      ae.event_date,
      ae.end_date,
      ae.start_time,
      ae.end_time,
      ae.venue,
      ae.department_id,
      d.name as department_name,
      ae.affects_schedule,
      ae.target_semester,
      ae.exam_halls,
      ae.coordinator,
      ae.status,
      ae.created_at
    FROM academic_events ae
    LEFT JOIN departments d ON ae.department_id = d.department_id
  `;

  const where = [];
  const params = [];
  const pushParam = (val) => {
    params.push(val);
    return `$${params.length}`;
  };

  if (filter.eventType && filter.eventType !== 'ALL') {
    where.push(`ae.event_type = ${pushParam(filter.eventType.toUpperCase())}`);
  }
  if (Array.isArray(filter.departmentIds)) {
    if (filter.departmentIds.length === 0) {
      where.push('1 = 0');
    } else {
      const phs = filter.departmentIds.map((d) => pushParam(d)).join(', ');
      where.push(`(ae.department_id IS NULL OR ae.department_id IN (${phs}))`);
    }
  } else if (filter.departmentId && filter.departmentId !== 'ALL') {
    const p = pushParam(filter.departmentId.toUpperCase());
    where.push(`(ae.department_id = ${p} OR ae.department_id IS NULL)`);
  }
  if (filter.date) {
    const p1 = pushParam(filter.date);
    const p2 = pushParam(filter.date);
    const p3 = pushParam(filter.date);
    where.push(`(ae.event_date = ${p1} OR (${p2} >= ae.event_date AND ${p3} <= ae.end_date))`);
  }

  if (where.length > 0) {
    query += ' WHERE ' + where.join(' AND ');
  }

  query += ' ORDER BY ae.event_date ASC, ae.start_time ASC';

  return db.all(query, params);
}

async function checkDateScheduleStatus(dateString, departmentId = null, semesterId = null) {
  const targetDate = dateString || new Date().toISOString().split('T')[0];

  const event = await db.get(
    `
      SELECT * FROM academic_events
      WHERE ($1 = event_date OR ($1 >= event_date AND $1 <= COALESCE(end_date, event_date)))
        AND status IN ('UPCOMING', 'ACTIVE')
        AND (department_id = $2 OR department_id IS NULL)
        AND (target_semester = 'ALL' OR target_semester = $3 OR target_semester IS NULL)
      ORDER BY CASE event_type
        WHEN 'HOLIDAY' THEN 1
        WHEN 'EXAM' THEN 2
        ELSE 3 END ASC
      LIMIT 1
    `,
    [targetDate, departmentId, semesterId]
  );

  if (!event) {
    return {
      status: 'REGULAR',
      date: targetDate,
      affectsSchedule: false,
      message: 'Regular Autonomous Academic Class & Laboratory Schedule'
    };
  }

  return {
    status: event.event_type,
    date: targetDate,
    affectsSchedule: Boolean(event.affects_schedule),
    event: {
      eventId: event.event_id,
      title: event.title,
      description: event.description,
      eventType: event.event_type,
      startDate: event.event_date,
      endDate: event.end_date,
      examHalls: event.exam_halls,
      venue: event.venue
    },
    message: event.event_type === 'HOLIDAY'
      ? `CAMPUS HOLIDAY: ${event.title} — Regular academic slots suspended.`
      : event.event_type === 'EXAM'
      ? `EXAMINATION ACTIVE: ${event.title} — Classes suspended; Exam Halls: ${event.exam_halls || event.venue || 'Central Blocks'}`
      : `CAMPUS EVENT: ${event.title}`
  };
}

async function createAcademicEvent(data, adminUser, ipAddress = '127.0.0.1') {
  const title = (data.title || '').trim();
  const description = data.description || '';
  const event_type = (data.event_type || data.eventType || 'GENERAL').toUpperCase();
  const event_date = data.event_date || data.startDate || data.start_date;
  const end_date = data.end_date || data.endDate || event_date;
  const start_time = data.start_time || data.startTime || null;
  const end_time = data.end_time || data.endTime || null;
  const venue = data.venue || 'Campus Wide';
  const department_id = data.department_id || data.departmentId || null;
  const affects_schedule = data.affects_schedule || data.affectsSchedule || false;
  const target_semester = data.target_semester || data.targetSemester || 'ALL';
  const exam_halls = data.exam_halls || data.examHalls || null;
  const coordinator = data.coordinator || (adminUser ? adminUser.fullName : 'Academic Coordinator');

  if (!title || !event_date || !event_type) {
    throw new Error('Title, event_date, and event_type are required.');
  }

  const eventId = `ACAD-EVT-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;

  await db.run(
    `
      INSERT INTO academic_events (
        event_id, title, description, event_type, event_date, end_date,
        start_time, end_time, venue, department_id,
        affects_schedule, target_semester, exam_halls, coordinator, status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'UPCOMING', $15)
    `,
    [
      eventId,
      title,
      description,
      event_type,
      event_date,
      end_date || event_date,
      start_time,
      end_time,
      venue,
      department_id,
      affects_schedule ? 1 : 0,
      target_semester,
      exam_halls,
      coordinator || adminUser.fullName,
      adminUser.userId
    ]
  );

  if (affects_schedule) {
    const notifMsg = `${event_type}: ${title} scheduled for ${event_date}. Regular class schedule is suspended.`;
    if (department_id) {
      await notifyDepartment(department_id, {
        type: NOTIFICATION_TYPES.TIMETABLE_CHANGE,
        title: `Academic Notice: ${event_type}`,
        message: notifMsg,
        entityType: 'ACADEMIC_EVENT',
        entityId: eventId,
        actionUrl: 'timetable',
        createdByUserId: adminUser.userId,
        createdByName: adminUser.fullName
      });
    } else {
      await notifyRole(['STUDENT', 'TEACHING_STAFF', 'NON_TEACHING_STAFF', 'COORDINATOR', 'DEPT_ADMIN'], {
        type: NOTIFICATION_TYPES.ANNOUNCEMENT,
        title: `Campus Notice: ${event_type}`,
        message: notifMsg,
        entityType: 'ACADEMIC_EVENT',
        entityId: eventId,
        actionUrl: 'timetable',
        createdByUserId: adminUser.userId,
        createdByName: adminUser.fullName
      });
    }
  }

  return { event_id: eventId, ...data };
}

async function seedDefaultAcademicEvents() {
  // Sample holidays and mock exams are omitted so academic events start empty
  // and reflect only real events created via the Academic Events portal/API.
  return;
}

async function deleteAcademicEvent(eventId, adminUser, ipAddress = '127.0.0.1') {
  const existing = await db.get('SELECT * FROM academic_events WHERE event_id = $1', [eventId]);
  if (!existing) {
    throw new Error(`Academic event '${eventId}' not found.`);
  }

  if (
    adminUser &&
    ['DEPT_ADMIN', 'COORDINATOR'].includes(adminUser.role) &&
    existing.department_id &&
    existing.department_id !== adminUser.departmentId
  ) {
    throw new Error('Unauthorized: cannot delete an academic event belonging to another department.');
  }

  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM academic_events WHERE event_id = $1', [eventId]);
    await tx.run(
      `
        INSERT INTO audit_logs (log_id, admin_id, admin_name, action, entity_name, entity_id, old_value, new_value, ip_address)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        `AUD-${crypto.randomUUID().substring(0, 8).toUpperCase()}`,
        (adminUser && adminUser.userId) || 'ADMIN',
        (adminUser && adminUser.fullName) || 'Administrator',
        'DELETE_EVENT',
        'ACADEMIC_EVENT',
        eventId,
        JSON.stringify({ title: existing.title, event_type: existing.event_type, event_date: existing.event_date }),
        null,
        ipAddress
      ]
    );
  });

  return { success: true, eventId, message: `Academic event "${existing.title}" deleted successfully.` };
}

async function updateAcademicEvent(eventId, updates = {}) {
  const curRes = await db.query('SELECT * FROM academic_events WHERE event_id = $1', [eventId]);
  if (curRes.rows.length === 0) {
    const err = new Error('Academic event not found');
    err.status = 404;
    throw err;
  }
  const cur = curRes.rows[0];
  const title = updates.title !== undefined ? String(updates.title).trim() : cur.title;
  const description = updates.description !== undefined ? String(updates.description || '').trim() : cur.description;
  const eventType = updates.eventType !== undefined || updates.event_type !== undefined
    ? String(updates.eventType ?? updates.event_type ?? cur.event_type).trim().toUpperCase()
    : cur.event_type;
  const eventDate = updates.eventDate !== undefined || updates.event_date !== undefined
    ? String(updates.eventDate ?? updates.event_date ?? cur.event_date).trim()
    : cur.event_date;
  const endDate = updates.endDate !== undefined || updates.end_date !== undefined
    ? (String(updates.endDate ?? updates.end_date ?? '').trim() || null)
    : cur.end_date;
  const startTime = updates.startTime !== undefined || updates.start_time !== undefined
    ? (String(updates.startTime ?? updates.start_time ?? '').trim() || null)
    : cur.start_time;
  const endTime = updates.endTime !== undefined || updates.end_time !== undefined
    ? (String(updates.endTime ?? updates.end_time ?? '').trim() || null)
    : cur.end_time;
  const venue = updates.venue !== undefined ? (String(updates.venue || '').trim() || null) : cur.venue;
  const departmentId = updates.departmentId !== undefined || updates.department_id !== undefined
    ? (String(updates.departmentId ?? updates.department_id ?? '').trim().toUpperCase() || null)
    : cur.department_id;
  const affectsSchedule = updates.affectsSchedule !== undefined || updates.affects_schedule !== undefined
    ? (Number(updates.affectsSchedule ?? updates.affects_schedule) === 1 || updates.affectsSchedule === true ? 1 : 0)
    : cur.affects_schedule;
  const coordinator = updates.coordinator !== undefined ? (String(updates.coordinator || '').trim() || null) : cur.coordinator;
  const status = updates.status !== undefined ? String(updates.status).trim().toUpperCase() : cur.status;

  if (!title || !eventDate) {
    const err = new Error('title and event_date are required');
    err.status = 400;
    throw err;
  }

  const res = await db.query(
    `UPDATE academic_events
     SET title = $1, description = $2, event_type = $3, event_date = $4, end_date = $5,
         start_time = $6, end_time = $7, venue = $8, department_id = $9,
         affects_schedule = $10, coordinator = $11, status = $12
     WHERE event_id = $13
     RETURNING *`,
    [title, description, eventType, eventDate, endDate, startTime, endTime, venue, departmentId, affectsSchedule, coordinator, status, eventId]
  );
  return res.rows[0];
}

module.exports = {
  getAcademicEvents,
  checkDateScheduleStatus,
  createAcademicEvent,
  updateAcademicEvent,
  deleteAcademicEvent,
  seedDefaultAcademicEvents,
  getEvents: (filter) => getAcademicEvents(filter),
  createEvent: (data, user, ip) => createAcademicEvent(data, user, ip),
  updateEventStatus: async (id, status) => {
    await db.run('UPDATE academic_events SET status = $1 WHERE event_id = $2', [status, id]);
    return { success: true };
  }
};
