const crypto = require('crypto');
const { db } = require('../config/database');
const {
  NOTIFICATION_TYPES,
  notifyRole,
  notifyUser
} = require('./notificationService');

async function createLabBooking(data, currentUser, ipAddress = '127.0.0.1') {
  const labId = data.labId || data.lab_id;
  const title = data.title;
  // The documented request contract exposes the operator's notes as `notes`;
  // accept it as an alias so the setup requirements are not silently dropped.
  const description = data.description || data.notes;
  const bookingType = (data.booking_type || data.bookingType || 'GENERAL').toUpperCase();
  const bookingDate = data.bookingDate || data.booking_date;
  const dayOfWeek = (data.dayOfWeek || data.day_of_week || '').toUpperCase();
  const periodIndex = data.periodIndex != null ? data.periodIndex : data.period_index;
  const startTime = data.startTime || data.start_time;
  const endTime = data.endTime || data.end_time;
  const coordinatorName = data.coordinatorName || data.coordinator_name;

  if (!labId || !title || !dayOfWeek) {
    throw new Error('labId, title, and dayOfWeek are required.');
  }

  const normalizedId = labId.replace(/-/g, '_');
  const lab = await db.get(
    `
      SELECT l.*, s.full_name as incharge_name, s.user_id as incharge_user_id
      FROM laboratories l
      LEFT JOIN staff s ON l.staff_incharge_id = s.staff_id
      WHERE l.lab_id = $1 OR l.room_id = $2 OR l.lab_id = $3
    `,
    [labId, labId, normalizedId]
  );

  if (!lab) {
    throw new Error(`Laboratory '${labId}' was not found.`);
  }

  const isDean = currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'DEAN';
  const isHOD = currentUser.role === 'DEPT_ADMIN';
  const isCoordinator = currentUser.role === 'COORDINATOR';
  const isFaculty = currentUser.role === 'TEACHING_STAFF';
  const isStudent = currentUser.role === 'STUDENT';
  const isIncharge = lab.incharge_user_id === currentUser.userId || currentUser.role === 'NON_TEACHING_STAFF';

  if (!isDean && !isHOD && !isCoordinator && !isFaculty && !isStudent && !isIncharge) {
    throw new Error('Access denied: Unauthorized user role for laboratory reservation.');
  }

  const pIndex = periodIndex ? parseInt(periodIndex, 10) : null;
  const durationPeriods = Math.max(1, parseInt(data.durationPeriods || data.duration_periods || 1, 10));

  if (pIndex) {
    if (pIndex + durationPeriods - 1 > 7) {
      throw new Error(`Invalid continuous duration: Period ${pIndex} + ${durationPeriods} periods exceeds maximum academic period (Period 7).`);
    }

    for (let curP = pIndex; curP < pIndex + durationPeriods; curP++) {
      const existingSlot = await db.get(
        `
          SELECT ts.*, sub.subject_code, sub.subject_name, sec.section_name, sem.semester_number, st.full_name as faculty_name
          FROM timetable_slots ts
          JOIN subjects sub ON ts.subject_id = sub.subject_id
          JOIN sections sec ON ts.section_id = sec.section_id
          JOIN semesters sem ON sec.semester_id = sem.semester_id
          JOIN staff st ON ts.faculty_id = st.staff_id
          JOIN timetable_versions tv ON ts.version_id = tv.version_id
          WHERE (ts.lab_id = $1 OR ts.room_id = $2)
            AND ts.day_of_week = $3
            AND ts.period_index = $4
            AND tv.status = 'PUBLISHED'
        `,
        [lab.lab_id, lab.room_id, dayOfWeek, curP]
      );

      if (existingSlot) {
        throw new Error(
          `Laboratory Conflict: ${lab.name} is scheduled for ${existingSlot.subject_code} (${existingSlot.subject_name}) with ${existingSlot.faculty_name} in Sem ${existingSlot.semester_number} Sec ${existingSlot.section_name} during ${dayOfWeek} Period ${curP}. Cannot reserve continuous block.`
        );
      }

      const existingBooking = await db.get(
        `
          SELECT * FROM lab_bookings
          WHERE lab_id = $1
            AND day_of_week = $2
            AND period_index = $3
            AND status IN ('CONFIRMED', 'PENDING')
        `,
        [lab.lab_id, dayOfWeek, curP]
      );

      if (existingBooking) {
        throw new Error(
          `Laboratory already booked: Event '${existingBooking.title}' is already scheduled for ${lab.name} on ${dayOfWeek} Period ${curP}.`
        );
      }
    }
  }

  const bookingId = `LBK-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;
  const effectiveDate = bookingDate || new Date().toISOString().split('T')[0];
  const bookingTitle = durationPeriods > 1 ? `${title.trim()} (P${pIndex}-P${pIndex + durationPeriods - 1} Continuous Block)` : title.trim();
  const initialStatus = (isDean || isHOD) ? 'CONFIRMED' : 'PENDING';

  await db.transaction(async (tx) => {
    await tx.run(
      `
        INSERT INTO lab_bookings (
          booking_id, lab_id, title, description, booking_type, booking_date, day_of_week, period_index,
          start_time, end_time, coordinator_name, booked_by_user_id, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `,
      [
        bookingId,
        lab.lab_id,
        bookingTitle,
        description ? description.trim() : null,
        bookingType,
        effectiveDate,
        dayOfWeek,
        pIndex,
        startTime || null,
        endTime || null,
        coordinatorName ? coordinatorName.trim() : currentUser.fullName,
        currentUser.userId,
        initialStatus
      ]
    );

    if (pIndex && durationPeriods > 1) {
      for (let curP = pIndex + 1; curP < pIndex + durationPeriods; curP++) {
        const companionId = `${bookingId}-P${curP}`;
        await tx.run(
          `
            INSERT INTO lab_bookings (
              booking_id, lab_id, title, description, booking_type, booking_date, day_of_week, period_index,
              start_time, end_time, coordinator_name, booked_by_user_id, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          `,
          [
            companionId,
            lab.lab_id,
            `${title.trim()} (P${pIndex}-P${pIndex + durationPeriods - 1} Part ${curP - pIndex + 1})`,
            description ? description.trim() : null,
            bookingType,
            effectiveDate,
            dayOfWeek,
            curP,
            startTime || null,
            endTime || null,
            coordinatorName ? coordinatorName.trim() : currentUser.fullName,
            currentUser.userId,
            initialStatus
          ]
        );
      }
    }

    await tx.run(
      `
        INSERT INTO audit_logs (log_id, admin_id, admin_name, action, entity_name, entity_id, old_value, new_value, ip_address)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        `AUD-${crypto.randomUUID().substring(0, 8).toUpperCase()}`,
        currentUser.userId,
        currentUser.fullName,
        'CREATE_LAB_BOOKING',
        'LAB_BOOKING',
        bookingId,
        null,
        JSON.stringify({ labId: lab.lab_id, title, bookingType, dayOfWeek, periodIndex: pIndex, bookingDate: effectiveDate, status: initialStatus }),
        ipAddress
      ]
    );
  });

  if (initialStatus === 'PENDING') {
    const deptId = lab.department_id;
    const periodLabel = pIndex ? ` Period ${pIndex}` : '';
    await notifyRole('DEPT_ADMIN', {
      type: NOTIFICATION_TYPES.LAB_REQUEST,
      title: 'New Laboratory Booking Request',
      message: `${currentUser.fullName} requested ${lab.name} on ${dayOfWeek}${periodLabel} for "${title.trim()}". Approval required.`,
      entityType: 'LAB_BOOKING',
      entityId: bookingId,
      actionUrl: 'laboratories',
      createdByUserId: currentUser.userId,
      createdByName: currentUser.fullName
    }, deptId);
    await notifyRole('SUPER_ADMIN', {
      type: NOTIFICATION_TYPES.LAB_REQUEST,
      title: 'New Laboratory Booking Request',
      message: `${currentUser.fullName} requested ${lab.name} on ${dayOfWeek}${periodLabel} for "${title.trim()}". Approval required.`,
      entityType: 'LAB_BOOKING',
      entityId: bookingId,
      actionUrl: 'laboratories',
      createdByUserId: currentUser.userId,
      createdByName: currentUser.fullName
    }, deptId);
  }

  return {
    bookingId,
    booking_id: bookingId,
    labId: lab.lab_id,
    labName: lab.name,
    title,
    bookingType,
    booking_type: bookingType,
    description: description ? description.trim() : null,
    dayOfWeek,
    periodIndex: pIndex,
    bookingDate: effectiveDate,
    coordinatorName: coordinatorName || currentUser.fullName,
    status: initialStatus
  };
}

async function approveLabBooking(bookingId, currentUser, action = 'APPROVE', ipAddress = '127.0.0.1') {
  if (currentUser.role !== 'SUPER_ADMIN' && currentUser.role !== 'DEAN' && currentUser.role !== 'DEPT_ADMIN') {
    throw new Error('Access denied: Only HOD or Dean may approve or reject laboratory bookings.');
  }

  const existing = await db.get('SELECT * FROM lab_bookings WHERE booking_id = $1', [bookingId]);
  if (!existing) {
    throw new Error(`Booking '${bookingId}' was not found.`);
  }

  const newStatus = action.toUpperCase() === 'APPROVE' ? 'CONFIRMED' : 'CANCELLED';

  await db.transaction(async (tx) => {
    await tx.run(
      'UPDATE lab_bookings SET status = $1 WHERE booking_id = $2 OR booking_id LIKE $3',
      [newStatus, bookingId, `${bookingId}-%`]
    );

    await tx.run(
      `
        INSERT INTO audit_logs (log_id, admin_id, admin_name, action, entity_name, entity_id, old_value, new_value, ip_address)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        `AUD-${crypto.randomUUID().substring(0, 8).toUpperCase()}`,
        currentUser.userId,
        currentUser.fullName,
        action.toUpperCase() === 'APPROVE' ? 'APPROVE_LAB_BOOKING' : 'REJECT_LAB_BOOKING',
        'LAB_BOOKING',
        bookingId,
        JSON.stringify({ previousStatus: existing.status }),
        JSON.stringify({ status: newStatus }),
        ipAddress
      ]
    );
  });

  const approved = action.toUpperCase() === 'APPROVE';

  if (existing.booked_by_user_id) {
    await notifyUser(existing.booked_by_user_id, {
      type: NOTIFICATION_TYPES.LAB_APPROVAL,
      title: approved ? 'Laboratory Booking Approved' : 'Laboratory Booking Rejected',
      message: `Your booking "${existing.title}" on ${existing.day_of_week}${existing.period_index ? ` Period ${existing.period_index}` : ''} was ${approved ? 'approved and confirmed' : 'rejected'} by ${currentUser.fullName}.`,
      entityType: 'LAB_BOOKING',
      entityId: bookingId,
      actionUrl: 'laboratories',
      createdByUserId: currentUser.userId,
      createdByName: currentUser.fullName
    });
  }

  return {
    success: true,
    bookingId,
    status: newStatus,
    message: `Laboratory booking ${approved ? 'approved and confirmed' : 'rejected and cancelled'}.`
  };
}

async function getLabBookings(labId = null, includeAllStatuses = false, labIds = null, bookedByUserId = null) {
  let query = `
    SELECT lb.*, l.name as lab_name, l.room_id, l.department_id, r.room_number,
           s.full_name as incharge_name
    FROM lab_bookings lb
    JOIN laboratories l ON lb.lab_id = l.lab_id
    JOIN rooms r ON l.room_id = r.room_id
    LEFT JOIN staff s ON l.staff_incharge_id = s.staff_id
    WHERE 1=1
  `;
  const params = [];

  if (includeAllStatuses) {
    query += " AND lb.status IN ('CONFIRMED', 'PENDING')";
  } else {
    query += " AND lb.status = 'CONFIRMED'";
  }

  if (Array.isArray(labIds)) {
    if (labIds.length === 0) return [];
    const phs = labIds.map((_, i) => `$${params.length + i + 1}`).join(', ');
    query += ` AND lb.lab_id IN (${phs})`;
    params.push(...labIds);
  } else if (labId) {
    params.push(labId);
    query += ` AND lb.lab_id = $${params.length}`;
  }

  if (bookedByUserId) {
    params.push(bookedByUserId);
    query += ` AND lb.booked_by_user_id = $${params.length}`;
  }

  query += ' ORDER BY lb.created_at DESC';

  return db.all(query, params);
}

async function deleteLabBooking(bookingId, currentUser, ipAddress = '127.0.0.1') {
  const existing = await db.get('SELECT * FROM lab_bookings WHERE booking_id = $1', [bookingId]);
  if (!existing) {
    throw new Error(`Booking '${bookingId}' was not found.`);
  }

  const isDean = currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'DEAN';
  const isHOD = currentUser.role === 'DEPT_ADMIN';
  const isOwner = existing.booked_by_user_id === currentUser.userId;

  if (!isDean && !isHOD && !isOwner) {
    throw new Error('Access denied: You can only cancel your own booking requests.');
  }

  await db.transaction(async (tx) => {
    await tx.run(
      "UPDATE lab_bookings SET status = 'CANCELLED' WHERE booking_id = $1 OR booking_id LIKE $2",
      [bookingId, `${bookingId}-%`]
    );

    await tx.run(
      `
        INSERT INTO audit_logs (log_id, admin_id, admin_name, action, entity_name, entity_id, old_value, new_value, ip_address)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        `AUD-${crypto.randomUUID().substring(0, 8).toUpperCase()}`,
        currentUser.userId,
        currentUser.fullName,
        'CANCEL_LAB_BOOKING',
        'LAB_BOOKING',
        bookingId,
        JSON.stringify({ status: existing.status }),
        JSON.stringify({ status: 'CANCELLED' }),
        ipAddress
      ]
    );
  });

  return {
    success: true,
    message: 'Laboratory booking cancelled successfully.'
  };
}

async function getPendingLabRequests(departmentId = null) {
  let query = `
    SELECT lb.*, l.name as lab_name, l.room_id, r.room_number,
           s.full_name as incharge_name, u.full_name as requester_name, u.role as requester_role, u.pnrno as requester_pnr
    FROM lab_bookings lb
    JOIN laboratories l ON lb.lab_id = l.lab_id
    JOIN rooms r ON l.room_id = r.room_id
    LEFT JOIN staff s ON l.staff_incharge_id = s.staff_id
    LEFT JOIN users u ON lb.booked_by_user_id = u.user_id
    WHERE lb.status = 'PENDING'
  `;
  const params = [];
  if (Array.isArray(departmentId)) {
    if (departmentId.length === 0) {
      query += ' AND 1 = 0';
    } else {
      const phs = departmentId.map((_, i) => `$${params.length + i + 1}`).join(', ');
      query += ` AND r.department_id IN (${phs})`;
      params.push(...departmentId);
    }
  } else if (departmentId && departmentId !== 'ALL') {
    params.push(departmentId);
    query += ` AND r.department_id = $${params.length}`;
  }
  query += ' ORDER BY lb.created_at DESC';
  return db.all(query, params);
}

module.exports = {
  createLabBooking,
  getLabBookings,
  deleteLabBooking,
  approveLabBooking,
  getPendingLabRequests
};
