const crypto = require('crypto');
const { db } = require('../config/database');
const {
  NOTIFICATION_TYPES,
  notifyRole,
  notifyUser
} = require('./notificationService');
const { broadcast } = require('./notificationStream');

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

      const existingFacBooking = await db.get(
        `
          SELECT * FROM facility_bookings
          WHERE (facility_id = $1 OR facility_id = $2)
            AND day_of_week = $3
            AND period_index = $4
            AND status IN ('CONFIRMED', 'PENDING')
        `,
        [lab.room_id, lab.lab_id, dayOfWeek, curP]
      );

      if (existingFacBooking) {
        throw new Error(
          `Facility already booked: Event '${existingFacBooking.title}' is already scheduled for ${lab.name} on ${dayOfWeek} Period ${curP}.`
        );
      }
    }
  }

  const bookingId = `LBK-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;
  const effectiveDate = bookingDate || new Date().toISOString().split('T')[0];
  const bookingTitle = durationPeriods > 1 ? `${title.trim()} (P${pIndex}-P${pIndex + durationPeriods - 1} Continuous Block)` : title.trim();
  const initialStatus = (isDean || isHOD) ? 'CONFIRMED' : 'PENDING';
  const effectiveRoomId = lab.room_id || lab.lab_id;

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

    await tx.run(
      `
        INSERT INTO facility_bookings (
          booking_id, facility_id, facility_name, facility_type, title,
          description, booking_date, day_of_week, period_index,
          start_time, end_time, coordinator_name, expected_attendees,
          booked_by_user_id, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (booking_id) DO UPDATE SET
          status = EXCLUDED.status,
          title = EXCLUDED.title
      `,
      [
        bookingId,
        effectiveRoomId,
        lab.name,
        'LABORATORY',
        bookingTitle,
        description ? description.trim() : null,
        effectiveDate,
        dayOfWeek,
        pIndex,
        startTime || null,
        endTime || null,
        coordinatorName ? coordinatorName.trim() : currentUser.fullName,
        lab.capacity || 60,
        currentUser.userId,
        initialStatus
      ]
    );

    if (pIndex && durationPeriods > 1) {
      for (let curP = pIndex + 1; curP < pIndex + durationPeriods; curP++) {
        const companionId = `${bookingId}-P${curP}`;
        const companionTitle = `${title.trim()} (P${pIndex}-P${pIndex + durationPeriods - 1} Part ${curP - pIndex + 1})`;
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
            companionTitle,
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

        await tx.run(
          `
            INSERT INTO facility_bookings (
              booking_id, facility_id, facility_name, facility_type, title,
              description, booking_date, day_of_week, period_index,
              start_time, end_time, coordinator_name, expected_attendees,
              booked_by_user_id, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            ON CONFLICT (booking_id) DO UPDATE SET
              status = EXCLUDED.status,
              title = EXCLUDED.title
          `,
          [
            companionId,
            effectiveRoomId,
            lab.name,
            'LABORATORY',
            companionTitle,
            description ? description.trim() : null,
            effectiveDate,
            dayOfWeek,
            curP,
            startTime || null,
            endTime || null,
            coordinatorName ? coordinatorName.trim() : currentUser.fullName,
            lab.capacity || 60,
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

  // Real-time campus broadcast: notify all connected SSE clients instantly
  broadcast('booking_change', {
    action: 'CREATED',
    bookingId,
    labId: lab.lab_id,
    facilityId: effectiveRoomId,
    dayOfWeek,
    periodIndex: pIndex,
    status: initialStatus
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

  const rawId = String(bookingId || '').trim();
  const rootId = rawId.replace(/-P\d+$/i, '');
  const existing =
    (await db.get('SELECT * FROM lab_bookings WHERE booking_id = $1', [rootId])) ||
    (await db.get('SELECT * FROM lab_bookings WHERE booking_id = $1', [rawId])) ||
    (await db.get('SELECT * FROM facility_bookings WHERE booking_id = $1', [rootId])) ||
    (await db.get('SELECT * FROM facility_bookings WHERE booking_id = $1', [rawId]));

  if (!existing) {
    throw new Error(`Booking '${rawId}' was not found.`);
  }
  const targetId = existing.booking_id.replace(/-P\d+$/i, '');

  const newStatus = action.toUpperCase() === 'APPROVE' ? 'CONFIRMED' : 'CANCELLED';

  await db.transaction(async (tx) => {
    await tx.run(
      'UPDATE lab_bookings SET status = $1 WHERE booking_id = $2 OR booking_id LIKE $3',
      [newStatus, targetId, `${targetId}-%`]
    );

    await tx.run(
      'UPDATE facility_bookings SET status = $1 WHERE booking_id = $2 OR booking_id LIKE $3',
      [newStatus, targetId, `${targetId}-%`]
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
        targetId,
        JSON.stringify({ previousStatus: existing.status }),
        JSON.stringify({ status: newStatus }),
        ipAddress
      ]
    );
  });

  // Real-time broadcast
  broadcast('booking_change', {
    action: newStatus,
    bookingId: targetId,
    status: newStatus
  });

  const approved = action.toUpperCase() === 'APPROVE';

  if (existing.booked_by_user_id) {
    await notifyUser(existing.booked_by_user_id, {
      type: NOTIFICATION_TYPES.LAB_APPROVAL,
      title: approved ? 'Laboratory Booking Approved' : 'Laboratory Booking Rejected',
      message: `Your booking "${existing.title}" on ${existing.day_of_week}${existing.period_index ? ` Period ${existing.period_index}` : ''} was ${approved ? 'approved and confirmed' : 'rejected'} by ${currentUser.fullName}.`,
      entityType: 'LAB_BOOKING',
      entityId: targetId,
      actionUrl: 'laboratories',
      createdByUserId: currentUser.userId,
      createdByName: currentUser.fullName
    });
  }

  return {
    success: true,
    bookingId: targetId,
    status: newStatus,
    message: `Laboratory booking ${approved ? 'approved and confirmed' : 'rejected and cancelled'}.`
  };
}

async function getLabBookings(labId = null, includeAllStatuses = false, labIds = null, bookedByUserId = null, departmentId = null) {
  // Query both lab_bookings and facility_bookings to provide a unified, authoritative booking view
  const [labRows, facRows] = await Promise.all([
    db.all(`
      SELECT lb.*, l.name as lab_name, l.name as facility_name, l.room_id, l.department_id, r.room_number,
             s.full_name as incharge_name, NULL as club_name, NULL as expected_attendees, NULL as faculty_mentor
      FROM lab_bookings lb
      JOIN laboratories l ON lb.lab_id = l.lab_id
      JOIN rooms r ON l.room_id = r.room_id
      LEFT JOIN staff s ON l.staff_incharge_id = s.staff_id
    `),
    db.all(`
      SELECT fb.*, COALESCE(l.lab_id, fb.facility_id) as lab_id, fb.facility_type as booking_type,
             COALESCE(l.name, fb.facility_name, r.room_number, fb.facility_id) as lab_name,
             COALESCE(fb.facility_name, l.name, r.room_number, fb.facility_id) as facility_name,
             COALESCE(r.room_id, l.room_id, fb.facility_id) as room_id,
             COALESCE(r.department_id, l.department_id, 'CSE') as department_id,
             COALESCE(r.room_number, fb.facility_id) as room_number,
             s.full_name as incharge_name
      FROM facility_bookings fb
      LEFT JOIN rooms r ON (fb.facility_id = r.room_id OR fb.facility_id = r.room_number OR fb.facility_id = REPLACE(r.room_id, 'RM-', ''))
      LEFT JOIN laboratories l ON (fb.facility_id = l.lab_id OR fb.facility_id = l.room_id OR r.room_id = l.room_id)
      LEFT JOIN staff s ON l.staff_incharge_id = s.staff_id
    `)
  ]);

  const byId = new Map();
  for (const row of facRows) {
    byId.set(row.booking_id, row);
  }
  for (const row of labRows) {
    if (byId.has(row.booking_id)) {
      byId.set(row.booking_id, { ...byId.get(row.booking_id), ...row });
    } else {
      byId.set(row.booking_id, row);
    }
  }

  let list = Array.from(byId.values());

  // Status filtering
  if (includeAllStatuses) {
    list = list.filter((b) => ['CONFIRMED', 'PENDING', 'CANCELLED', 'REJECTED'].includes(b.status));
  } else {
    list = list.filter((b) => b.status === 'CONFIRMED');
  }

  // Lab IDs filter
  if (Array.isArray(labIds)) {
    if (labIds.length === 0) return [];
    const set = new Set(labIds);
    list = list.filter((b) => set.has(b.lab_id) || set.has(b.room_id) || set.has(b.facility_id));
  } else if (labId) {
    list = list.filter((b) => b.lab_id === labId || b.room_id === labId || b.facility_id === labId);
  }

  // Booked by user filter
  if (bookedByUserId) {
    list = list.filter((b) => b.booked_by_user_id === bookedByUserId);
  }

  // Department filter
  if (Array.isArray(departmentId)) {
    if (departmentId.length > 0) {
      const dSet = new Set(departmentId);
      list = list.filter((b) => dSet.has(b.department_id));
    }
  } else if (departmentId && departmentId !== 'ALL') {
    list = list.filter((b) => b.department_id === departmentId);
  }

  // Sort: newest first
  list.sort((a, b) => {
    const dateComp = String(b.booking_date || '').localeCompare(String(a.booking_date || ''));
    if (dateComp !== 0) return dateComp;
    return String(b.created_at || '').localeCompare(String(a.created_at || ''));
  });

  return list;
}

async function deleteLabBooking(bookingId, currentUser, ipAddress = '127.0.0.1') {
  const existing =
    (await db.get('SELECT * FROM lab_bookings WHERE booking_id = $1', [bookingId])) ||
    (await db.get('SELECT * FROM facility_bookings WHERE booking_id = $1', [bookingId]));

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
      "UPDATE facility_bookings SET status = 'CANCELLED' WHERE booking_id = $1 OR booking_id LIKE $2",
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

  // Real-time broadcast
  broadcast('booking_change', {
    action: 'CANCELLED',
    bookingId
  });

  return {
    success: true,
    message: 'Laboratory booking cancelled successfully.'
  };
}

async function getPendingLabRequests(departmentId = null, statusFilter = 'PENDING') {
  const normalizedStatus = String(statusFilter || 'PENDING').toUpperCase();

  const [labRows, facRows] = await Promise.all([
    db.all(`
      SELECT lb.*, l.name as lab_name, l.name as facility_name, l.room_id, l.department_id, r.room_number,
             s.full_name as incharge_name, u.full_name as requester_name, u.role as requester_role, u.pnrno as requester_pnr
      FROM lab_bookings lb
      JOIN laboratories l ON lb.lab_id = l.lab_id
      JOIN rooms r ON l.room_id = r.room_id
      LEFT JOIN staff s ON l.staff_incharge_id = s.staff_id
      LEFT JOIN users u ON lb.booked_by_user_id = u.user_id
      WHERE lb.booking_id !~ '-P[0-9]+$'
    `),
    db.all(`
      SELECT fb.*, COALESCE(l.lab_id, fb.facility_id) as lab_id, fb.facility_type as booking_type,
             COALESCE(l.name, fb.facility_name, r.room_number, fb.facility_id) as lab_name,
             COALESCE(fb.facility_name, l.name, r.room_number, fb.facility_id) as facility_name,
             COALESCE(r.room_id, l.room_id, fb.facility_id) as room_id,
             COALESCE(r.department_id, l.department_id, 'CSE') as department_id,
             COALESCE(r.room_number, fb.facility_id) as room_number,
             s.full_name as incharge_name, u.full_name as requester_name, u.role as requester_role, u.pnrno as requester_pnr
      FROM facility_bookings fb
      LEFT JOIN rooms r ON (fb.facility_id = r.room_id OR fb.facility_id = r.room_number OR fb.facility_id = REPLACE(r.room_id, 'RM-', ''))
      LEFT JOIN laboratories l ON (fb.facility_id = l.lab_id OR fb.facility_id = l.room_id OR r.room_id = l.room_id)
      LEFT JOIN staff s ON l.staff_incharge_id = s.staff_id
      LEFT JOIN users u ON fb.booked_by_user_id = u.user_id
      WHERE fb.booking_id !~ '-P[0-9]+$'
    `)
  ]);

  const byId = new Map();
  for (const row of facRows) {
    byId.set(row.booking_id, row);
  }
  for (const row of labRows) {
    if (byId.has(row.booking_id)) {
      byId.set(row.booking_id, { ...byId.get(row.booking_id), ...row });
    } else {
      byId.set(row.booking_id, row);
    }
  }

  let list = Array.from(byId.values());

  // Filter by status
  if (normalizedStatus === 'ALL') {
    list = list.filter((r) => ['PENDING', 'CONFIRMED', 'CANCELLED'].includes(r.status));
  } else if (['PENDING', 'CONFIRMED', 'CANCELLED'].includes(normalizedStatus)) {
    list = list.filter((r) => r.status === normalizedStatus);
  }

  // Filter by department
  if (Array.isArray(departmentId)) {
    if (departmentId.length > 0) {
      const dSet = new Set(departmentId);
      list = list.filter((r) => dSet.has(r.department_id));
    }
  } else if (departmentId && departmentId !== 'ALL') {
    list = list.filter((r) => r.department_id === departmentId);
  }

  list.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  return list;
}

module.exports = {
  createLabBooking,
  getLabBookings,
  deleteLabBooking,
  approveLabBooking,
  getPendingLabRequests
};
