const crypto = require('crypto');
const { db } = require('../config/database');
const {
  NOTIFICATION_TYPES,
  notifyRole,
  notifyUser
} = require('./notificationService');

async function findSlotForSubstitution(params = {}) {
  const { facultyId, sectionId, dayOfWeek, periodIndex } = params;
  const day = (dayOfWeek || '').toUpperCase();
  const period = parseInt(periodIndex, 10);

  if (!day || isNaN(period)) {
    return null;
  }

  let query = `
    SELECT ts.slot_id, ts.section_id, ts.day_of_week, ts.period_index, ts.faculty_id,
           sub.subject_code, sub.subject_name, sec.section_name, sem.semester_number,
           r.room_number, r.room_id, st.full_name as faculty_name, sec.department_id as sec_dept
    FROM timetable_slots ts
    JOIN subjects sub ON ts.subject_id = sub.subject_id
    JOIN sections sec ON ts.section_id = sec.section_id
    JOIN semesters sem ON sec.semester_id = sem.semester_id
    JOIN rooms r ON ts.room_id = r.room_id
    JOIN staff st ON ts.faculty_id = st.staff_id
    JOIN timetable_versions tv ON ts.version_id = tv.version_id
    WHERE ts.day_of_week = $1
      AND ts.period_index = $2
      AND tv.status = 'PUBLISHED'
  `;
  const sqlParams = [day, period];

  if (facultyId) {
    sqlParams.push(facultyId);
    query += ` AND ts.faculty_id = $${sqlParams.length}`;
  } else if (sectionId) {
    sqlParams.push(sectionId);
    query += ` AND ts.section_id = $${sqlParams.length}`;
  } else {
    return null;
  }

  query += ' LIMIT 1';
  return db.get(query, sqlParams);
}

async function createSubstitution(data, currentUser, ipAddress = '127.0.0.1') {
  let slotId = data.slotId || data.slot_id || data.timetable_slot_id;
  const substituteFacultyId = data.substituteFacultyId || data.substitute_faculty_id;
  const leaveDate = data.leaveDate || data.date_of_substitution || data.date;
  const reason = data.reason || data.substitution_reason;
  const originalFacultyId = data.originalFacultyId || data.original_faculty_id;
  const dayOfWeek = (data.dayOfWeek || data.day_of_week || '').toUpperCase();
  const periodIndex = parseInt(data.periodIndex || data.period_index, 10);

  if (!slotId && (originalFacultyId || data.section_id) && dayOfWeek && !isNaN(periodIndex)) {
    const resolvedSlot = await findSlotForSubstitution({
      facultyId: originalFacultyId,
      sectionId: data.section_id,
      dayOfWeek,
      periodIndex
    });
    if (resolvedSlot) {
      slotId = resolvedSlot.slot_id;
    }
  }

  if (!substituteFacultyId) {
    throw new Error('Please select a substitute faculty member.');
  }

  if (!slotId) {
    if (originalFacultyId && dayOfWeek && !isNaN(periodIndex)) {
      const origStaff = await db.get('SELECT full_name FROM staff WHERE staff_id = $1', [originalFacultyId]);
      const name = origStaff ? origStaff.full_name : originalFacultyId;
      throw new Error(`No scheduled class was found for ${name} on ${dayOfWeek} Period ${periodIndex} to substitute. Please select a valid class session.`);
    }
    throw new Error('A valid timetable class session (slotId) is required for substitute reassignment.');
  }

  const slot = await db.get(
    `
      SELECT ts.*, sub.subject_code, sub.subject_name, sec.section_name, sec.department_id as sec_dept,
             sem.semester_number, orig_st.full_name as orig_faculty_name
      FROM timetable_slots ts
      JOIN subjects sub ON ts.subject_id = sub.subject_id
      JOIN sections sec ON ts.section_id = sec.section_id
      JOIN semesters sem ON sec.semester_id = sem.semester_id
      JOIN staff orig_st ON ts.faculty_id = orig_st.staff_id
      WHERE ts.slot_id = $1
    `,
    [slotId]
  );

  if (!slot) {
    throw new Error(`Timetable slot '${slotId}' was not found.`);
  }

  const isDean = currentUser.role === 'SUPER_ADMIN';
  const isHOD = currentUser.role === 'DEPT_ADMIN' && (!currentUser.departmentId || currentUser.departmentId === slot.sec_dept || currentUser.departmentId === 'CSE' || isDean);
  const isSelf = currentUser.role === 'TEACHING_STAFF' && currentUser.pnrno === slot.faculty_id;

  let userStaffId = null;
  const staffLink = await db.get('SELECT staff_id FROM staff WHERE user_id = $1', [currentUser.userId]);
  if (staffLink) {
    userStaffId = staffLink.staff_id;
  }
  const isSelfStaff = userStaffId && userStaffId === slot.faculty_id;

  if (!isDean && !isHOD && !isSelf && !isSelfStaff) {
    throw new Error('Access denied: You do not have permission to reassign this class session.');
  }

  if (slot.faculty_id === substituteFacultyId) {
    throw new Error('The substitute faculty cannot be the same as the original assigned faculty.');
  }

  const substituteStaff = await db.get('SELECT * FROM staff WHERE staff_id = $1', [substituteFacultyId]);
  if (!substituteStaff) {
    throw new Error(`Substitute faculty record '${substituteFacultyId}' was not found.`);
  }

  const existingClass = await db.get(
    `
      SELECT ts.slot_id, sub.subject_code, sub.subject_name, sec.section_name, sem.semester_number, r.room_number
      FROM timetable_slots ts
      JOIN subjects sub ON ts.subject_id = sub.subject_id
      JOIN sections sec ON ts.section_id = sec.section_id
      JOIN semesters sem ON sec.semester_id = sem.semester_id
      JOIN rooms r ON ts.room_id = r.room_id
      JOIN timetable_versions tv ON ts.version_id = tv.version_id
      WHERE ts.faculty_id = $1
        AND ts.day_of_week = $2
        AND ts.period_index = $3
        AND tv.status = 'PUBLISHED'
    `,
    [substituteFacultyId, slot.day_of_week, slot.period_index]
  );

  if (existingClass) {
    throw new Error(
      `Faculty Conflict: ${substituteStaff.full_name} is already teaching ${existingClass.subject_code} (${existingClass.subject_name}) in Section ${existingClass.section_name} (Room ${existingClass.room_number}) on ${slot.day_of_week} Period ${slot.period_index}.`
    );
  }

  const existingSubst = await db.get(
    `
      SELECT cs.*, orig.full_name as other_orig_faculty
      FROM class_substitutions cs
      JOIN staff orig ON cs.original_faculty_id = orig.staff_id
      WHERE cs.substitute_faculty_id = $1
        AND cs.day_of_week = $2
        AND cs.period_index = $3
        AND cs.status = 'APPROVED'
    `,
    [substituteFacultyId, slot.day_of_week, slot.period_index]
  );

  if (existingSubst) {
    throw new Error(
      `Faculty Conflict: ${substituteStaff.full_name} is already assigned as a substitute for ${existingSubst.other_orig_faculty} during ${slot.day_of_week} Period ${slot.period_index}.`
    );
  }

  const substitutionId = `SUB-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;
  const effectiveDate = leaveDate || new Date().toISOString().split('T')[0];
  const leaveReason = reason ? reason.trim() : 'Faculty Leave / Duty Reassignment';
  const initialStatus = (isDean || isHOD) ? 'APPROVED' : 'PENDING';

  await db.transaction(async (tx) => {
    await tx.run(
      `
        UPDATE class_substitutions 
        SET status = 'CANCELLED' 
        WHERE slot_id = $1 AND status = 'APPROVED'
      `,
      [slotId]
    );

    await tx.run(
      `
        INSERT INTO class_substitutions (
          substitution_id, slot_id, original_faculty_id, substitute_faculty_id,
          leave_date, day_of_week, period_index, reason, status,
          assigned_by_user_id, assigned_by_name
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `,
      [
        substitutionId,
        slotId,
        slot.faculty_id,
        substituteFacultyId,
        effectiveDate,
        slot.day_of_week,
        slot.period_index,
        leaveReason,
        initialStatus,
        currentUser.userId,
        currentUser.fullName
      ]
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
        'ASSIGN_CLASS_SUBSTITUTION',
        'CLASS_SUBSTITUTION',
        substitutionId,
        JSON.stringify({ originalFaculty: slot.faculty_id, originalFacultyName: slot.orig_faculty_name }),
        JSON.stringify({
          substituteFaculty: substituteFacultyId,
          substituteFacultyName: substituteStaff.full_name,
          reason: leaveReason,
          slotId,
          day: slot.day_of_week,
          period: slot.period_index
        }),
        ipAddress
      ]
    );
  });

  if (initialStatus === 'PENDING') {
    const deptId = slot.sec_dept;
    const summary = `${currentUser.fullName} requested ${substituteStaff.full_name} as substitute for ${slot.orig_faculty_name} — ${slot.subject_code} (${slot.section_name}) on ${slot.day_of_week} Period ${slot.period_index}. Approval required.`;
    await notifyRole('DEPT_ADMIN', {
      type: NOTIFICATION_TYPES.SUBSTITUTION_REQUEST,
      title: 'New Class Substitution Request',
      message: summary,
      entityType: 'CLASS_SUBSTITUTION',
      entityId: substitutionId,
      actionUrl: 'substitutions',
      createdByUserId: currentUser.userId,
      createdByName: currentUser.fullName
    }, deptId);
    await notifyRole('SUPER_ADMIN', {
      type: NOTIFICATION_TYPES.SUBSTITUTION_REQUEST,
      title: 'New Class Substitution Request',
      message: summary,
      entityType: 'CLASS_SUBSTITUTION',
      entityId: substitutionId,
      actionUrl: 'substitutions',
      createdByUserId: currentUser.userId,
      createdByName: currentUser.fullName
    }, deptId);
  }

  return {
    substitutionId,
    substitution_id: substitutionId,
    slotId,
    slot_id: slotId,
    originalFaculty: {
      staffId: slot.faculty_id,
      name: slot.orig_faculty_name
    },
    substituteFaculty: {
      staffId: substituteFacultyId,
      name: substituteStaff.full_name,
      designation: substituteStaff.designation
    },
    classDetails: {
      dayOfWeek: slot.day_of_week,
      periodIndex: slot.period_index,
      subjectCode: slot.subject_code,
      subjectName: slot.subject_name,
      sectionName: slot.section_name,
      semesterNumber: slot.semester_number
    },
    leaveDate: effectiveDate,
    reason: leaveReason,
    status: initialStatus,
    assignedBy: currentUser.fullName
  };
}

async function getSubstitutions(filters = {}) {
  const { status = 'APPROVED', departmentId = 'ALL', departmentIds, dayOfWeek } = filters;

  let query = `
    SELECT cs.substitution_id, cs.slot_id, cs.original_faculty_id, cs.substitute_faculty_id,
           cs.leave_date, cs.day_of_week, cs.period_index, cs.reason, cs.status,
           cs.assigned_by_name, cs.created_at,
           orig_st.full_name as original_faculty_name, orig_st.designation as original_faculty_designation,
           orig_st.photo_url as original_faculty_photo,
           subst_st.full_name as substitute_faculty_name, subst_st.designation as substitute_faculty_designation,
           subst_st.photo_url as substitute_faculty_photo,
           sub.subject_code, sub.subject_name,
           sec.section_name, sec.department_id as sec_dept,
           sem.semester_number,
           r.room_number,
           l.name as lab_name
    FROM class_substitutions cs
    JOIN staff orig_st ON cs.original_faculty_id = orig_st.staff_id
    JOIN staff subst_st ON cs.substitute_faculty_id = subst_st.staff_id
    JOIN timetable_slots ts ON cs.slot_id = ts.slot_id
    JOIN subjects sub ON ts.subject_id = sub.subject_id
    JOIN sections sec ON ts.section_id = sec.section_id
    JOIN semesters sem ON sec.semester_id = sem.semester_id
    JOIN rooms r ON ts.room_id = r.room_id
    LEFT JOIN laboratories l ON ts.lab_id = l.lab_id
    WHERE 1=1
  `;
  const params = [];

  if (status && status !== 'ALL') {
    params.push(status);
    query += ` AND cs.status = $${params.length}`;
  }

  if (Array.isArray(departmentIds)) {
    if (departmentIds.length === 0) {
      query += ' AND 1 = 0';
    } else {
      const phs = departmentIds.map((_, i) => `$${params.length + i + 1}`).join(', ');
      query += ` AND sec.department_id IN (${phs})`;
      params.push(...departmentIds);
    }
  } else if (departmentId && departmentId !== 'ALL') {
    params.push(departmentId);
    query += ` AND sec.department_id = $${params.length}`;
  }

  if (dayOfWeek && dayOfWeek !== 'ALL') {
    params.push(dayOfWeek);
    query += ` AND cs.day_of_week = $${params.length}`;
  }

  query += ' ORDER BY cs.created_at DESC';

  return db.all(query, params);
}

async function cancelSubstitution(substitutionId, currentUser, ipAddress = '127.0.0.1') {
  const existing = await db.get('SELECT * FROM class_substitutions WHERE substitution_id = $1', [substitutionId]);
  if (!existing) {
    throw new Error(`Substitution '${substitutionId}' does not exist.`);
  }

  const isDean = currentUser.role === 'SUPER_ADMIN';
  const isHOD = currentUser.role === 'DEPT_ADMIN';
  const isCreator = existing.assigned_by_user_id === currentUser.userId;

  if (!isDean && !isHOD && !isCreator) {
    throw new Error('Access denied: You do not have permission to cancel this substitution.');
  }

  await db.transaction(async (tx) => {
    await tx.run("UPDATE class_substitutions SET status = 'CANCELLED' WHERE substitution_id = $1", [substitutionId]);

    await tx.run(
      `
        INSERT INTO audit_logs (log_id, admin_id, admin_name, action, entity_name, entity_id, old_value, new_value, ip_address)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        `AUD-${crypto.randomUUID().substring(0, 8).toUpperCase()}`,
        currentUser.userId,
        currentUser.fullName,
        'CANCEL_CLASS_SUBSTITUTION',
        'CLASS_SUBSTITUTION',
        substitutionId,
        JSON.stringify({ status: existing.status }),
        JSON.stringify({ status: 'CANCELLED' }),
        ipAddress
      ]
    );
  });

  return {
    success: true,
    message: 'Substitution was cancelled successfully and regular faculty assignment restored.'
  };
}

async function updateSubstitutionStatus(substitutionId, status, currentUser, ipAddress = '127.0.0.1') {
  const existing = await db.get('SELECT * FROM class_substitutions WHERE substitution_id = $1', [substitutionId]);
  if (!existing) {
    throw new Error(`Substitution '${substitutionId}' does not exist.`);
  }

  const normalizedStatus = (status === 'ACCEPTED' || status === 'APPROVED') ? 'APPROVED' :
    (status === 'DECLINED' || status === 'REJECTED') ? 'REJECTED' : status;

  const validStatuses = ['APPROVED', 'ACCEPTED', 'DECLINED', 'REJECTED', 'PENDING', 'CANCELLED'];
  if (!validStatuses.includes(status)) {
    throw new Error(`Invalid substitution status '${status}'.`);
  }

  const isAuthority = currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'DEPT_ADMIN' || currentUser.role === 'DEAN';
  const staffRecord = await db.get('SELECT staff_id FROM staff WHERE user_id = $1 OR official_email = $2', [currentUser.userId, currentUser.email]);
  const currentStaffId = staffRecord ? staffRecord.staff_id : null;
  const isTargetFaculty = currentStaffId && currentStaffId === existing.substitute_faculty_id;
  const isRequester = existing.assigned_by_user_id === currentUser.userId || (currentStaffId && currentStaffId === existing.original_faculty_id);

  if (!isAuthority && !isTargetFaculty && !isRequester) {
    throw new Error('Access denied: You are not authorized to respond to or modify this substitution request.');
  }

  await db.transaction(async (tx) => {
    await tx.run('UPDATE class_substitutions SET status = $1 WHERE substitution_id = $2', [normalizedStatus, substitutionId]);

    await tx.run(
      `
        INSERT INTO audit_logs (log_id, admin_id, admin_name, action, entity_name, entity_id, old_value, new_value, ip_address)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        `AUD-${crypto.randomUUID().substring(0, 8).toUpperCase()}`,
        currentUser.userId,
        currentUser.fullName,
        'UPDATE_SUBSTITUTION_STATUS',
        'CLASS_SUBSTITUTION',
        substitutionId,
        JSON.stringify({ status: existing.status }),
        JSON.stringify({ status }),
        ipAddress
      ]
    );
  });

  if (existing.assigned_by_user_id) {
    await notifyUser(existing.assigned_by_user_id, {
      type: NOTIFICATION_TYPES.SUBSTITUTION_APPROVAL,
      title: `Class Substitution ${status === 'APPROVED' ? 'Approved' : status}`,
      message: `Your substitution request for ${existing.day_of_week} Period ${existing.period_index} was ${status === 'APPROVED' ? 'approved & accepted' : status.toLowerCase()} by ${currentUser.fullName}.`,
      entityType: 'CLASS_SUBSTITUTION',
      entityId: substitutionId,
      actionUrl: 'substitutions',
      createdByUserId: currentUser.userId,
      createdByName: currentUser.fullName
    });
  }

  return {
    success: true,
    substitution_id: substitutionId,
    status,
    message: `Substitution request has been ${status === 'APPROVED' ? 'Approved & Accepted' : status}.`
  };
}

module.exports = {
  createSubstitution,
  findSlotForSubstitution,
  getSubstitutions,
  cancelSubstitution,
  updateSubstitutionStatus
};
