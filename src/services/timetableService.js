const crypto = require('crypto');
const { db } = require('../config/database');
const { validateSlotConflict } = require('./conflictService');
const { logSecurityEvent } = require('../middleware/telemetry');
const { NOTIFICATION_TYPES, notifyDepartment } = require('./notificationService');

// Institutional bell schedule. Slot start/end times are derived from the period
// index so clients never have to supply (or be trusted for) wall-clock timings.
const PERIOD_TIMINGS = {
  1: { start: '09:00', end: '10:00' },
  2: { start: '10:00', end: '11:00' },
  3: { start: '11:10', end: '12:10' },
  4: { start: '12:10', end: '13:10' },
  5: { start: '14:00', end: '15:00' },
  6: { start: '15:00', end: '16:00' },
  7: { start: '16:00', end: '17:00' }
};

async function notifyTimetableChange(departmentId, actor, message, entityId) {
  if (!departmentId) return;
  await notifyDepartment(
    departmentId,
    {
      type: NOTIFICATION_TYPES.TIMETABLE_CHANGE,
      title: 'Timetable Updated',
      message,
      entityType: 'TIMETABLE_SLOT',
      entityId,
      actionUrl: 'timetable',
      createdByUserId: actor.userId,
      createdByName: actor.fullName
    },
    ['DEPT_ADMIN', 'COORDINATOR', 'TEACHING_STAFF', 'STUDENT']
  );
}

async function getSectionDepartment(sectionId) {
  const row = await db.get('SELECT department_id FROM sections WHERE section_id = $1', [sectionId]);
  return row ? row.department_id : null;
}

async function getAcademicHierarchy(schoolId = null) {
  const years = await db.all('SELECT * FROM academic_years ORDER BY year_id ASC');
  const semesters = await db.all('SELECT * FROM semesters ORDER BY semester_number ASC');

  const deptFilter = schoolId
    ? 'WHERE department_id IN (SELECT department_id FROM departments WHERE school_id = $1)'
    : '';
  const scoped = (sql) => (schoolId ? db.all(sql, [schoolId.toUpperCase()]) : db.all(sql));

  const [departments, subjects, rooms, laboratories] = await Promise.all([
    schoolId
      ? db.all('SELECT department_id, name FROM departments WHERE school_id = $1 ORDER BY department_id ASC', [schoolId.toUpperCase()])
      : db.all('SELECT department_id, name FROM departments ORDER BY department_id ASC'),
    scoped(`SELECT subject_id, department_id, semester_id, subject_code, subject_name, course_type FROM subjects ${deptFilter} ORDER BY subject_code ASC`),
    scoped(`SELECT room_id, department_id, room_number, room_type, capacity, facilities_description FROM rooms ${deptFilter} ORDER BY room_number ASC`),
    scoped(`SELECT lab_id, department_id, name, room_id, staff_incharge_id, capacity, equipment_details FROM laboratories ${deptFilter} ORDER BY name ASC`)
  ]);

  return {
    departments,
    years,
    semesters,
    sections: ['A', 'B', 'C', 'D'],
    subjects,
    rooms,
    laboratories
  };
}

function enrichContinuousLabSlots(slots) {
  if (!Array.isArray(slots) || slots.length === 0) return slots;

  const dayGroups = {};
  slots.forEach((s) => {
    if (!dayGroups[s.day_of_week]) dayGroups[s.day_of_week] = [];
    dayGroups[s.day_of_week].push(s);
  });

  Object.values(dayGroups).forEach((daySlots) => {
    for (let i = 0; i < daySlots.length; i++) {
      const cur = daySlots[i];
      const isLab = cur.is_laboratory || cur.lab_id || (cur.subject_code && cur.subject_code.includes('LAB'));
      if (!isLab) continue;

      const next = daySlots.find((other) =>
        other.period_index === cur.period_index + 1 &&
        (other.is_laboratory || other.lab_id || (other.subject_code && other.subject_code.includes('LAB'))) &&
        (
          (other.lab_id && cur.lab_id && other.lab_id === cur.lab_id) ||
          (other.room_id && cur.room_id && other.room_id === cur.room_id) ||
          (other.subject_code === cur.subject_code) ||
          (other.subject_id === cur.subject_id)
        )
      );

      const prev = daySlots.find((other) =>
        other.period_index === cur.period_index - 1 &&
        (other.is_laboratory || other.lab_id || (other.subject_code && other.subject_code.includes('LAB'))) &&
        (
          (other.lab_id && cur.lab_id && other.lab_id === cur.lab_id) ||
          (other.room_id && cur.room_id && other.room_id === cur.room_id) ||
          (other.subject_code === cur.subject_code) ||
          (other.subject_id === cur.subject_id)
        )
      );

      if (next) {
        cur.is_continuous = true;
        cur.is_continuous_start = true;
        cur.continuous_part = 1;
        cur.continuous_total = 2;
        cur.continuous_span = `P${cur.period_index} - P${next.period_index}`;
        cur.continuous_start_time = cur.start_time;
        cur.continuous_end_time = next.end_time;
        cur.continuous_partner_slot_id = next.slot_id;
        cur.continuous_label = `2-Period Continuous Lab (P${cur.period_index} - P${next.period_index})`;
      } else if (prev) {
        cur.is_continuous = true;
        cur.is_continuous_start = false;
        cur.continuous_part = 2;
        cur.continuous_total = 2;
        cur.continuous_span = `P${prev.period_index} - P${cur.period_index}`;
        cur.continuous_start_time = prev.start_time;
        cur.continuous_end_time = cur.end_time;
        cur.continuous_partner_slot_id = prev.slot_id;
        cur.continuous_label = '2-Period Continuous Lab (Part 2 of 2)';
      } else {
        cur.is_continuous = false;
      }
    }
  });

  return slots;
}

async function getSectionTimetable(departmentId, semesterId, sectionName) {
  const normDept = (departmentId || '').trim().toUpperCase();
  const rawSem = (semesterId || '').toString().trim().toUpperCase();
  const normSem = rawSem.startsWith('SEM_') ? rawSem : (rawSem ? `SEM_${rawSem}` : 'SEM_3');
  const normSec = (sectionName || '').trim().toUpperCase();

  const section = await db.get(
    `
      SELECT s.*, sem.semester_number, ay.year_label, ay.year_id, d.name as department_name
      FROM sections s
      JOIN semesters sem ON s.semester_id = sem.semester_id
      JOIN academic_years ay ON sem.year_id = ay.year_id
      JOIN departments d ON s.department_id = d.department_id
      WHERE s.department_id = $1 
        AND s.semester_id = $2 
        AND s.section_name = $3
    `,
    [normDept, normSem, normSec]
  );

  if (!section) {
    return null;
  }

  const version = await db.get(
    `
      SELECT * FROM timetable_versions
      WHERE department_id = $1 AND status = 'PUBLISHED'
      ORDER BY version_number DESC
      LIMIT 1
    `,
    [departmentId.toUpperCase()]
  );

  if (!version) {
    return {
      section,
      version: null,
      slots: [],
      message: 'No published timetable version found for this department.'
    };
  }

  const slots = await db.all(
    `
      SELECT 
        s.slot_id,
        s.version_id,
        s.section_id,
        s.day_of_week,
        s.start_time,
        s.end_time,
        s.period_index,
        s.is_laboratory,
        sub.subject_id,
        sub.subject_code,
        sub.subject_name,
        sub.course_type,
        st.staff_id,
        st.full_name as faculty_name,
        st.designation as faculty_designation,
        r.room_id,
        r.room_number,
        l.lab_id,
        l.name as lab_name
      FROM timetable_slots s
      JOIN subjects sub ON s.subject_id = sub.subject_id
      JOIN staff st ON s.faculty_id = st.staff_id
      JOIN rooms r ON s.room_id = r.room_id
      LEFT JOIN laboratories l ON s.lab_id = l.lab_id
      WHERE s.section_id = $1 AND s.version_id = $2
      ORDER BY 
        CASE s.day_of_week
          WHEN 'MONDAY' THEN 1
          WHEN 'TUESDAY' THEN 2
          WHEN 'WEDNESDAY' THEN 3
          WHEN 'THURSDAY' THEN 4
          WHEN 'FRIDAY' THEN 5
          WHEN 'SATURDAY' THEN 6
          ELSE 7
        END,
        s.period_index ASC
    `,
    [section.section_id, version.version_id]
  );

  const slotIds = slots.map((s) => s.slot_id);
  if (slotIds.length > 0) {
    const placeholders = slotIds.map((_, i) => `$${i + 1}`).join(',');
    const substitutions = await db.all(
      `
        SELECT cs.*, st.full_name as substitute_faculty_name, st.designation as substitute_faculty_designation,
               st.photo_url as substitute_faculty_photo
        FROM class_substitutions cs
        JOIN staff st ON cs.substitute_faculty_id = st.staff_id
        WHERE cs.slot_id IN (${placeholders})
          AND cs.status = 'APPROVED'
      `,
      slotIds
    );

    const substMap = {};
    substitutions.forEach((sub) => {
      substMap[sub.slot_id] = sub;
    });

    slots.forEach((slot) => {
      if (substMap[slot.slot_id]) {
        const sub = substMap[slot.slot_id];
        slot.is_substituted = true;
        slot.substitution_id = sub.substitution_id;
        slot.substitute_faculty_id = sub.substitute_faculty_id;
        slot.substitute_faculty_name = sub.substitute_faculty_name;
        slot.substitute_faculty_designation = sub.substitute_faculty_designation;
        slot.original_faculty_name = slot.faculty_name;
        slot.substitution_reason = sub.reason;
        slot.leave_date = sub.leave_date;
      } else {
        slot.is_substituted = false;
      }
    });
  }

  enrichContinuousLabSlots(slots);

  return {
    section,
    version,
    slots
  };
}

async function addTimetableSlot(slotData, adminUser, ipAddress = '127.0.0.1') {
  const { version_id, section_id, day_of_week, subject_id, faculty_id, room_id, lab_id } = slotData;

  const period_index = parseInt(slotData.period_index, 10);
  if (isNaN(period_index) || period_index < 1 || period_index > 7) {
    throw new Error('A valid class period (1-7) is required to schedule a timetable slot.');
  }

  // Derive institutional timings from the period unless explicitly supplied.
  const timing = PERIOD_TIMINGS[period_index];
  const start_time = slotData.start_time || timing.start;
  const end_time = slotData.end_time || timing.end;

  // Clients may send the laboratory flag as a boolean or its string form.
  const isLaboratory =
    slotData.is_laboratory === true ||
    slotData.is_laboratory === 1 ||
    slotData.is_laboratory === '1' ||
    String(slotData.is_laboratory).toLowerCase() === 'true';

  const validation = await validateSlotConflict({
    version_id,
    section_id,
    day_of_week,
    period_index,
    faculty_id,
    room_id,
    lab_id
  });

  if (validation.hasConflict) {
    const errorMsg = validation.conflicts.map((c) => c.message).join(' | ');
    logSecurityEvent('TIMETABLE_CONFLICT_PREVENTED', 'WARNING', `Admin ${adminUser.email} conflict: ${errorMsg}`, ipAddress, adminUser.email);
    const err = new Error(errorMsg);
    err.conflicts = validation.conflicts;
    throw err;
  }

  const slotId = `SLOT-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;

  await db.transaction(async (tx) => {
    await tx.run(
      `
        INSERT INTO timetable_slots (slot_id, version_id, section_id, day_of_week, start_time, end_time, period_index, subject_id, faculty_id, room_id, is_laboratory, lab_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `,
      [
        slotId,
        version_id,
        section_id,
        day_of_week,
        start_time,
        end_time,
        period_index,
        subject_id,
        faculty_id,
        room_id,
        isLaboratory ? 1 : 0,
        lab_id || null
      ]
    );

    await tx.run(
      `
        INSERT INTO audit_logs (log_id, admin_id, admin_name, action, entity_name, entity_id, old_value, new_value, ip_address)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        `AUD-${crypto.randomUUID().substring(0, 8).toUpperCase()}`,
        adminUser.userId,
        adminUser.fullName,
        'CREATE_TIMETABLE_SLOT',
        'TIMETABLE_SLOT',
        slotId,
        null,
        JSON.stringify(slotData),
        ipAddress
      ]
    );
  });

  await notifyTimetableChange(
    await getSectionDepartment(section_id),
    adminUser,
    `${adminUser.fullName} added a ${day_of_week} Period ${period_index} slot for section ${section_id}.`,
    slotId
  );

  return { slot_id: slotId, ...slotData };
}

async function deleteTimetableSlot(slotId, adminUser, ipAddress = '127.0.0.1') {
  const existing = await db.get('SELECT * FROM timetable_slots WHERE slot_id = $1', [slotId]);
  if (!existing) {
    throw new Error('Slot does not exist.');
  }

  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM timetable_slots WHERE slot_id = $1', [slotId]);
    await tx.run(
      `
        INSERT INTO audit_logs (log_id, admin_id, admin_name, action, entity_name, entity_id, old_value, new_value, ip_address)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        `AUD-${crypto.randomUUID().substring(0, 8).toUpperCase()}`,
        adminUser.userId,
        adminUser.fullName,
        'DELETE_TIMETABLE_SLOT',
        'TIMETABLE_SLOT',
        slotId,
        JSON.stringify(existing),
        null,
        ipAddress
      ]
    );
  });

  await notifyTimetableChange(
    await getSectionDepartment(existing.section_id),
    adminUser,
    `${adminUser.fullName} removed the ${existing.day_of_week} Period ${existing.period_index} slot for section ${existing.section_id}.`,
    slotId
  );

  return { success: true, slotId };
}

function resolveStudentEnrolledSection(pnrno, email = '') {
  const cleanPnr = (pnrno || '').trim().toUpperCase();
  const cleanEmail = (email || '').trim().toLowerCase();

  const exactMap = {
    '24341A0502': { department: 'CSE', semester: 'SEM_3', section: 'A', sectionId: 'CSE-SEM_3-A', label: '3rd Semester Section A' },
    '2301A0501': { department: 'CSE', semester: 'SEM_3', section: 'A', sectionId: 'CSE-SEM_3-A', label: '3rd Semester Section A' },
    '2301A05001': { department: 'CSE', semester: 'SEM_3', section: 'A', sectionId: 'CSE-SEM_3-A', label: '3rd Semester Section A' },
    '2301A05065': { department: 'CSE', semester: 'SEM_3', section: 'B', sectionId: 'CSE-SEM_3-B', label: '3rd Semester Section B' },
    '2301A05125': { department: 'CSE', semester: 'SEM_3', section: 'C', sectionId: 'CSE-SEM_3-C', label: '3rd Semester Section C' },
    '2301A05185': { department: 'CSE', semester: 'SEM_3', section: 'D', sectionId: 'CSE-SEM_3-D', label: '3rd Semester Section D' },
    '2201A05001': { department: 'CSE', semester: 'SEM_5', section: 'A', sectionId: 'CSE-SEM_5-A', label: '5th Semester Section A' },
    '2201A05065': { department: 'CSE', semester: 'SEM_5', section: 'B', sectionId: 'CSE-SEM_5-B', label: '5th Semester Section B' },
    '2201A05125': { department: 'CSE', semester: 'SEM_5', section: 'C', sectionId: 'CSE-SEM_5-C', label: '5th Semester Section C' },
    '2201A05185': { department: 'CSE', semester: 'SEM_5', section: 'D', sectionId: 'CSE-SEM_5-D', label: '5th Semester Section D' }
  };

  if (exactMap[cleanPnr]) return exactMap[cleanPnr];

  if (cleanEmail.includes('cse3a') || cleanEmail.includes('sec3a')) return exactMap['2301A05001'];
  if (cleanEmail.includes('cse3b') || cleanEmail.includes('sec3b')) return exactMap['2301A05065'];
  if (cleanEmail.includes('cse3c') || cleanEmail.includes('sec3c')) return exactMap['2301A05125'];
  if (cleanEmail.includes('cse3d') || cleanEmail.includes('sec3d')) return exactMap['2301A05185'];
  if (cleanEmail.includes('cse5a') || cleanEmail.includes('sec5a')) return exactMap['2201A05001'];
  if (cleanEmail.includes('cse5b') || cleanEmail.includes('sec5b')) return exactMap['2201A05065'];
  if (cleanEmail.includes('cse5c') || cleanEmail.includes('sec5c')) return exactMap['2201A05125'];
  if (cleanEmail.includes('cse5d') || cleanEmail.includes('sec5d')) return exactMap['2201A05185'];

  let sem = 'SEM_3';
  let sec = 'A';
  if (cleanPnr.startsWith('22')) sem = 'SEM_5';
  else if (cleanPnr.startsWith('23') || cleanPnr.startsWith('24')) sem = 'SEM_3';

  const lastDigits = parseInt(cleanPnr.slice(-3), 10);
  if (!isNaN(lastDigits)) {
    if (lastDigits > 185) sec = 'D';
    else if (lastDigits > 125) sec = 'C';
    else if (lastDigits > 65) sec = 'B';
    else sec = 'A';
  }

  const semNum = sem === 'SEM_5' ? '5th' : '3rd';
  return {
    department: 'CSE',
    semester: sem,
    section: sec,
    sectionId: `CSE-${sem}-${sec}`,
    label: `${semNum} Semester Section ${sec}`
  };
}

async function getFacultyWorkloadMatrix(departmentId = 'CSE') {
  const dept = (departmentId || 'CSE').toUpperCase();
  const query = `
    SELECT 
      st.staff_id,
      st.full_name,
      st.designation,
      st.official_email,
      st.photo_url,
      st.department_id,
      COUNT(ts.slot_id)::int as total_periods_per_week,
      COALESCE(SUM(CASE WHEN ts.is_laboratory = 0 THEN 1 ELSE 0 END), 0)::int as theory_periods,
      COALESCE(SUM(CASE WHEN ts.is_laboratory = 1 THEN 1 ELSE 0 END), 0)::int as lab_periods,
      STRING_AGG(DISTINCT sub.subject_code || ' (' || sub.subject_name || ')', ',') as subjects_taught
    FROM staff st
    LEFT JOIN timetable_slots ts ON st.staff_id = ts.faculty_id
    LEFT JOIN subjects sub ON ts.subject_id = sub.subject_id
    WHERE st.department_id = $1 AND st.category = 'TEACHING'
    GROUP BY st.staff_id, st.full_name, st.designation, st.official_email, st.photo_url, st.department_id
    ORDER BY total_periods_per_week DESC, st.full_name ASC
  `;
  const rows = await db.all(query, [dept]);
  return rows.map((r) => ({
    ...r,
    total_periods_per_week: r.total_periods_per_week || 0,
    theory_periods: r.theory_periods || 0,
    lab_periods: r.lab_periods || 0,
    max_recommended_periods: 18,
    is_overloaded: (r.total_periods_per_week || 0) > 18,
    overload_periods: Math.max(0, (r.total_periods_per_week || 0) - 18)
  }));
}

async function updateTimetableSlot(slotId, slotData, adminUser, ipAddress = '127.0.0.1') {
  const existing = await db.get('SELECT * FROM timetable_slots WHERE slot_id = $1', [slotId]);
  if (!existing) {
    const err = new Error('Slot does not exist.');
    err.status = 404;
    throw err;
  }

  const version_id = slotData.version_id || existing.version_id;
  const section_id = slotData.section_id || existing.section_id;
  const day_of_week = String(slotData.day_of_week || existing.day_of_week).trim().toUpperCase();
  const period_index = slotData.period_index !== undefined ? parseInt(slotData.period_index, 10) : existing.period_index;
  if (isNaN(period_index) || period_index < 1 || period_index > 7) {
    throw new Error('A valid class period (1-7) is required to update a timetable slot.');
  }
  const timing = PERIOD_TIMINGS[period_index];
  const start_time = slotData.start_time || timing.start;
  const end_time = slotData.end_time || timing.end;
  const subject_id = slotData.subject_id || existing.subject_id;
  const faculty_id = slotData.faculty_id || existing.faculty_id;
  const room_id = slotData.room_id || existing.room_id;
  const lab_id = slotData.lab_id !== undefined ? (slotData.lab_id || null) : existing.lab_id;
  const isLaboratory =
    slotData.is_laboratory === undefined
      ? existing.is_laboratory === 1
      : (slotData.is_laboratory === true || slotData.is_laboratory === 1 || slotData.is_laboratory === '1' || String(slotData.is_laboratory).toLowerCase() === 'true');

  const validation = await validateSlotConflict(
    { version_id, section_id, day_of_week, period_index, faculty_id, room_id, lab_id },
    slotId
  );
  if (validation.hasConflict) {
    const err = new Error(validation.conflicts.map((c) => c.message).join(' | '));
    err.conflicts = validation.conflicts;
    err.status = 409;
    throw err;
  }

  await db.transaction(async (tx) => {
    await tx.run(
      `UPDATE timetable_slots
       SET version_id = $1, section_id = $2, day_of_week = $3, start_time = $4, end_time = $5,
           period_index = $6, subject_id = $7, faculty_id = $8, room_id = $9, is_laboratory = $10, lab_id = $11
       WHERE slot_id = $12`,
      [version_id, section_id, day_of_week, start_time, end_time, period_index, subject_id, faculty_id, room_id, isLaboratory ? 1 : 0, lab_id, slotId]
    );
    await tx.run(
      `INSERT INTO audit_logs (log_id, admin_id, admin_name, action, entity_name, entity_id, old_value, new_value, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        `AUD-${crypto.randomUUID().substring(0, 8).toUpperCase()}`,
        adminUser.userId,
        adminUser.fullName,
        'UPDATE_TIMETABLE_SLOT',
        'TIMETABLE_SLOT',
        slotId,
        JSON.stringify(existing),
        JSON.stringify({ version_id, section_id, day_of_week, period_index, subject_id, faculty_id, room_id, lab_id }),
        ipAddress
      ]
    );
  });

  const updated = await db.get('SELECT * FROM timetable_slots WHERE slot_id = $1', [slotId]);
  await notifyTimetableChange(
    await getSectionDepartment(section_id),
    adminUser,
    `${adminUser.fullName} updated the ${day_of_week} Period ${period_index} slot for section ${section_id}.`,
    slotId
  );
  return updated;
}

module.exports = {
  getAcademicHierarchy,
  getSectionTimetable,
  addTimetableSlot,
  updateTimetableSlot,
  deleteTimetableSlot,
  resolveStudentEnrolledSection,
  getFacultyWorkloadMatrix
};
