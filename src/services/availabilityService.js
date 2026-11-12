const crypto = require('crypto');
const { db } = require('../config/database');
const { getDeanSchoolScope } = require('./departmentService');
const laboratoryService = require('./laboratoryService');

const INSTITUTIONAL_PERIODS = [
  { index: 1, start: '09:00', end: '10:00' },
  { index: 2, start: '10:00', end: '11:00' },
  { index: 3, start: '11:10', end: '12:10' },
  { index: 4, start: '12:10', end: '13:10' },
  { index: 5, start: '14:00', end: '15:00' },
  { index: 6, start: '15:00', end: '16:00' },
  { index: 7, start: '16:00', end: '17:00' }
];

function getInstitutionalDayOfWeek() {
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const day = days[new Date().getDay()];
  return (day === 'SUNDAY' || day === 'SATURDAY') ? 'MONDAY' : day;
}

function getCurrentPeriodIndex() {
  const now = new Date();
  const totalMinutes = now.getHours() * 60 + now.getMinutes();
  for (const p of INSTITUTIONAL_PERIODS) {
    const [sh, sm] = p.start.split(':').map(Number);
    const [eh, em] = p.end.split(':').map(Number);
    if (totalMinutes >= sh * 60 + sm && totalMinutes < eh * 60 + em) return p.index;
  }
  return 1;
}

function buildPlaceholders(count, startAt = 1) {
  return Array.from({ length: count }, (_, i) => `$${startAt + i}`).join(', ');
}

async function getFacilityAvailability(filters = {}) {
  const {
    semesterId = 'ALL',
    dayOfWeek = 'MONDAY',
    periodIndex = 1,
    duration = 1,
    facilityType = 'ALL',
    departmentId = 'ALL',
    schoolId = 'ALL',
    statusFilter = 'ALL',
    searchQuery = ''
  } = filters;

  const pIndex = parseInt(periodIndex, 10) || 1;
  const dur = Math.max(1, Math.min(7 - pIndex + 1, parseInt(duration, 10) || 1));
  const targetPeriods = Array.from({ length: dur }, (_, i) => pIndex + i);

  // 1. Fetch all rooms
  let roomsQuery = `
    SELECT r.room_id, r.department_id, r.room_number, r.room_type, r.capacity, r.facilities_description
    FROM rooms r
    WHERE 1=1
  `;
  const roomParams = [];

  if (departmentId && departmentId !== 'ALL') {
    roomParams.push(departmentId);
    roomsQuery += ` AND r.department_id = $${roomParams.length}`;
  }

  if (schoolId && schoolId !== 'ALL') {
    roomParams.push(schoolId.toUpperCase());
    roomsQuery += ` AND r.department_id IN (SELECT department_id FROM departments WHERE school_id = $${roomParams.length})`;
  }

  if (facilityType && facilityType !== 'ALL') {
    roomParams.push(facilityType.toUpperCase());
    roomsQuery += ` AND r.room_type = $${roomParams.length}`;
  }

  // 2. Query timetable slots scheduled for the given day and target periods
  const periodPh = buildPlaceholders(targetPeriods.length, 2);
  let slotQuery = `
    SELECT ts.slot_id, ts.version_id, ts.section_id, ts.day_of_week, ts.start_time, ts.end_time,
           ts.period_index, ts.subject_id, ts.faculty_id, ts.room_id, ts.is_laboratory, ts.lab_id,
           sub.subject_code, sub.subject_name, sub.course_type,
           sec.section_name, sec.semester_id, sec.department_id as sec_dept,
           sem.semester_number,
           st.full_name as faculty_name, st.designation as faculty_designation,
           st.photo_url as faculty_photo
    FROM timetable_slots ts
    JOIN subjects sub ON ts.subject_id = sub.subject_id
    JOIN sections sec ON ts.section_id = sec.section_id
    JOIN semesters sem ON sec.semester_id = sem.semester_id
    JOIN staff st ON ts.faculty_id = st.staff_id
    JOIN timetable_versions tv ON ts.version_id = tv.version_id
    WHERE ts.day_of_week = $1
      AND ts.period_index IN (${periodPh})
      AND tv.status = 'PUBLISHED'
  `;
  const slotParams = [dayOfWeek, ...targetPeriods];

  if (semesterId && semesterId !== 'ALL') {
    slotParams.push(semesterId);
    slotQuery += ` AND sec.semester_id = $${slotParams.length}`;
  }

  const [allRooms, allLabs, activeSlots, activeSubstitutions, labBookings, facBookings] = await Promise.all([
    db.all(roomsQuery, roomParams),
    db.all(`
      SELECT l.lab_id, l.department_id, l.name as lab_name, l.room_id, l.staff_incharge_id,
             l.assistant_incharge_id, l.equipment_details, l.capacity,
             s1.full_name as incharge_name, s1.designation as incharge_designation,
             s1.official_email as incharge_email, s1.photo_url as incharge_photo,
             s2.full_name as co_incharge_name, s2.designation as co_incharge_designation,
             s2.official_email as co_incharge_email
      FROM laboratories l
      LEFT JOIN staff s1 ON l.staff_incharge_id = s1.staff_id
      LEFT JOIN staff s2 ON l.assistant_incharge_id = s2.staff_id
    `),
    db.all(slotQuery, slotParams),
    db.all(
      `
        SELECT cs.substitution_id, cs.slot_id, cs.original_faculty_id, cs.substitute_faculty_id,
               cs.leave_date, cs.reason, cs.status, cs.assigned_by_name,
               subst_st.full_name as substitute_faculty_name,
               subst_st.designation as substitute_faculty_designation,
               subst_st.photo_url as substitute_faculty_photo,
               orig_st.full_name as original_faculty_name
        FROM class_substitutions cs
        JOIN staff subst_st ON cs.substitute_faculty_id = subst_st.staff_id
        JOIN staff orig_st ON cs.original_faculty_id = orig_st.staff_id
        WHERE cs.day_of_week = $1
          AND cs.period_index IN (${periodPh})
          AND cs.status = 'APPROVED'
      `,
      [dayOfWeek, ...targetPeriods]
    ),
    db.all(
      `
        SELECT lb.booking_id, lb.lab_id, lb.title, lb.description, lb.booking_date,
               lb.day_of_week, lb.period_index, lb.start_time, lb.end_time,
               lb.coordinator_name, lb.status
        FROM lab_bookings lb
        WHERE lb.day_of_week = $1
          AND (lb.period_index IN (${periodPh}) OR lb.period_index IS NULL)
          AND lb.status IN ('CONFIRMED', 'PENDING')
      `,
      [dayOfWeek, ...targetPeriods]
    ),
    db.all(
      `
        SELECT fb.*
        FROM facility_bookings fb
        WHERE fb.day_of_week = $1
          AND (fb.period_index IN (${periodPh}) OR fb.period_index IS NULL)
          AND fb.status IN ('CONFIRMED', 'PENDING')
      `,
      [dayOfWeek, ...targetPeriods]
    ).catch(() => [])
  ]);

  const labByRoomId = {};
  const labById = {};
  allLabs.forEach((lab) => {
    labByRoomId[lab.room_id] = lab;
    labById[lab.lab_id] = lab;
  });

  // 3b. Detect adjacent continuous slots for 2-period practical laboratory sessions
  try {
    const adjSlots = await db.all(
      `
        SELECT ts.slot_id, ts.period_index, ts.start_time, ts.end_time, ts.section_id, ts.subject_id,
               ts.lab_id, ts.room_id, sub.subject_code, sub.subject_name
        FROM timetable_slots ts
        JOIN subjects sub ON ts.subject_id = sub.subject_id
        JOIN timetable_versions tv ON ts.version_id = tv.version_id
        WHERE ts.day_of_week = $1
          AND ts.period_index IN ($2, $3)
          AND ts.is_laboratory = 1
          AND tv.status = 'PUBLISHED'
      `,
      [dayOfWeek, pIndex - 1, pIndex + dur]
    );

    activeSlots.forEach((slot) => {
      if (slot.is_laboratory) {
        const nextAdj = adjSlots.find((a) =>
          a.period_index === slot.period_index + 1 &&
          ((a.lab_id && slot.lab_id && a.lab_id === slot.lab_id) ||
            (a.room_id && slot.room_id && a.room_id === slot.room_id) ||
            (a.section_id === slot.section_id && a.subject_id === slot.subject_id))
        );
        const prevAdj = adjSlots.find((a) =>
          a.period_index === slot.period_index - 1 &&
          ((a.lab_id && slot.lab_id && a.lab_id === slot.lab_id) ||
            (a.room_id && slot.room_id && a.room_id === slot.room_id) ||
            (a.section_id === slot.section_id && a.subject_id === slot.subject_id))
        );

        if (nextAdj) {
          slot.is_continuous = true;
          slot.continuous_part = 1;
          slot.continuous_total = 2;
          slot.continuous_span = `P${slot.period_index} - P${slot.period_index + 1}`;
          slot.continuous_start_time = slot.start_time;
          slot.continuous_end_time = nextAdj.end_time;
          slot.continuous_label = `2-Period Continuous Lab (P${slot.period_index} - P${slot.period_index + 1})`;
        } else if (prevAdj) {
          slot.is_continuous = true;
          slot.continuous_part = 2;
          slot.continuous_total = 2;
          slot.continuous_span = `P${slot.period_index - 1} - P${slot.period_index}`;
          slot.continuous_start_time = prevAdj.start_time;
          slot.continuous_end_time = slot.end_time;
          slot.continuous_label = '2-Period Continuous Lab (Part 2 of 2)';
        } else {
          slot.is_continuous = false;
        }
      }
    });
  } catch (e) {}

  const substBySlotId = {};
  activeSubstitutions.forEach((sub) => {
    substBySlotId[sub.slot_id] = sub;
  });

  const bookingByLabId = {};
  labBookings.forEach((b) => {
    bookingByLabId[b.lab_id] = b;
  });

  const bookingByFacilityId = {};
  facBookings.forEach((b) => {
    bookingByFacilityId[b.facility_id] = b;
  });

  const slotsByRoomId = {};
  const slotsByLabId = {};
  activeSlots.forEach((slot) => {
    if (substBySlotId[slot.slot_id]) {
      const sub = substBySlotId[slot.slot_id];
      slot.is_substituted = true;
      slot.substitution_id = sub.substitution_id;
      slot.substitute_faculty_id = sub.substitute_faculty_id;
      slot.substitute_faculty_name = sub.substitute_faculty_name;
      slot.substitute_faculty_designation = sub.substitute_faculty_designation;
      slot.original_faculty_name = sub.original_faculty_name;
      slot.substitution_reason = sub.reason;
    } else {
      slot.is_substituted = false;
    }

    if (slot.room_id) {
      if (!slotsByRoomId[slot.room_id]) slotsByRoomId[slot.room_id] = [];
      slotsByRoomId[slot.room_id].push(slot);
    }
    if (slot.lab_id) {
      if (!slotsByLabId[slot.lab_id]) slotsByLabId[slot.lab_id] = [];
      slotsByLabId[slot.lab_id].push(slot);
    }
  });

  let results = allRooms.map((room) => {
    const labInfo = labByRoomId[room.room_id] || null;
    const roomSlots = slotsByRoomId[room.room_id] || [];
    const labSlots = (labInfo && slotsByLabId[labInfo.lab_id]) || [];
    const matchingSlots = [...roomSlots, ...labSlots];
    const occupiedSlot = matchingSlots.length > 0 ? matchingSlots[0] : null;
    const eventBooking = bookingByFacilityId[room.room_id] || (labInfo && bookingByFacilityId[labInfo.lab_id]) || (labInfo && bookingByLabId[labInfo.lab_id]) || null;

    let status = 'AVAILABLE';
    if (occupiedSlot) {
      status = 'OCCUPIED';
    } else if (eventBooking) {
      status = eventBooking.status === 'PENDING' ? 'RESERVED' : 'EVENT';
    }

    return {
      facility_id: room.room_id,
      facilityId: room.room_id,
      room_id: room.room_id,
      lab_id: labInfo ? labInfo.lab_id : null,
      facility_type: room.room_type,
      type: room.room_type,
      name: labInfo ? labInfo.lab_name : room.room_number,
      room_number: room.room_number,
      department_id: room.department_id,
      capacity: labInfo ? labInfo.capacity : room.capacity,
      equipment_details: labInfo ? labInfo.equipment_details : room.facilities_description,
      incharge: labInfo && labInfo.incharge_name ? {
        staff_id: labInfo.staff_incharge_id,
        name: labInfo.incharge_name,
        designation: labInfo.incharge_designation,
        email: labInfo.incharge_email,
        photo_url: labInfo.incharge_photo
      } : null,
      co_incharge: labInfo && labInfo.co_incharge_name ? {
        staff_id: labInfo.assistant_incharge_id,
        name: labInfo.co_incharge_name,
        designation: labInfo.co_incharge_designation,
        email: labInfo.co_incharge_email
      } : null,
      status,
      day_of_week: dayOfWeek,
      period_index: pIndex,
      duration: dur,
      target_periods: targetPeriods,
      continuous_span: dur > 1 ? `P${pIndex} - P${pIndex + dur - 1}` : `P${pIndex}`,
      conflicts_count: matchingSlots.length,
      all_conflicting_slots: matchingSlots.map((s) => ({
        period_index: s.period_index,
        subject_code: s.subject_code,
        subject_name: s.subject_name,
        faculty_name: s.faculty_name,
        cohort_label: `${s.sec_dept} Sem ${s.semester_number} Sec ${s.section_name}`
      })),
      session: occupiedSlot ? {
        slot_id: occupiedSlot.slot_id,
        section_id: occupiedSlot.section_id,
        section_name: occupiedSlot.section_name,
        semester_id: occupiedSlot.semester_id,
        semester_number: occupiedSlot.semester_number,
        cohort_label: `${occupiedSlot.sec_dept} Sem ${occupiedSlot.semester_number} Sec ${occupiedSlot.section_name}`,
        subject_code: occupiedSlot.subject_code,
        subject_name: occupiedSlot.subject_name,
        course_type: occupiedSlot.course_type,
        faculty_id: occupiedSlot.faculty_id,
        faculty_name: occupiedSlot.is_substituted ? occupiedSlot.substitute_faculty_name : occupiedSlot.faculty_name,
        original_faculty_name: occupiedSlot.faculty_name,
        faculty_designation: occupiedSlot.is_substituted ? occupiedSlot.substitute_faculty_designation : occupiedSlot.faculty_designation,
        is_substituted: occupiedSlot.is_substituted,
        substitution_reason: occupiedSlot.substitution_reason || null,
        substitution_id: occupiedSlot.substitution_id || null,
        start_time: occupiedSlot.start_time,
        end_time: occupiedSlot.end_time,
        is_continuous: !!occupiedSlot.is_continuous,
        continuous_span: occupiedSlot.continuous_span || null,
        continuous_part: occupiedSlot.continuous_part || null,
        continuous_total: occupiedSlot.continuous_total || null,
        continuous_start_time: occupiedSlot.continuous_start_time || occupiedSlot.start_time,
        continuous_end_time: occupiedSlot.continuous_end_time || occupiedSlot.end_time,
        continuous_label: occupiedSlot.continuous_label || null
      } : null,
      event: eventBooking ? {
        booking_id: eventBooking.booking_id,
        title: eventBooking.title,
        club_name: eventBooking.club_name || (eventBooking.status === 'PENDING' ? 'Pending HOD Approval' : 'Reserved Session'),
        description: eventBooking.description,
        coordinator_name: eventBooking.coordinator_name,
        coordinator_roll: eventBooking.coordinator_roll || null,
        coordinator_contact: eventBooking.coordinator_contact || null,
        faculty_mentor: eventBooking.faculty_mentor || null,
        expected_attendees: eventBooking.expected_attendees || null,
        booked_by_user_id: eventBooking.booked_by_user_id || null,
        start_time: eventBooking.start_time,
        end_time: eventBooking.end_time,
        status: eventBooking.status,
        is_pending: eventBooking.status === 'PENDING'
      } : null
    };
  });

  if (statusFilter && statusFilter !== 'ALL') {
    if (statusFilter === 'AVAILABLE' || statusFilter === 'VACANT_ONLY') {
      results = results.filter((r) => r.status === 'AVAILABLE');
    } else if (statusFilter === 'OCCUPIED') {
      results = results.filter((r) => r.status === 'OCCUPIED' || r.status === 'EVENT');
    }
  }

  if (searchQuery && searchQuery.trim().length > 0) {
    const q = searchQuery.trim().toLowerCase();
    results = results.filter((r) => {
      const matchName = r.name.toLowerCase().includes(q);
      const matchRoom = r.room_number.toLowerCase().includes(q);
      const matchEquip = (r.equipment_details || '').toLowerCase().includes(q);
      const matchIncharge = r.incharge ? r.incharge.name.toLowerCase().includes(q) : false;
      const matchSubject = r.session ? (r.session.subject_code.toLowerCase().includes(q) || r.session.subject_name.toLowerCase().includes(q)) : false;
      const matchFaculty = r.session ? r.session.faculty_name.toLowerCase().includes(q) : false;
      const matchCohort = r.session ? r.session.cohort_label.toLowerCase().includes(q) : false;
      return matchName || matchRoom || matchEquip || matchIncharge || matchSubject || matchFaculty || matchCohort;
    });
  }

  const total = results.length;
  const availableCount = results.filter((r) => r.status === 'AVAILABLE').length;
  const occupiedCount = results.filter((r) => r.status === 'OCCUPIED').length;
  const eventCount = results.filter((r) => r.status === 'EVENT').length;

  return {
    dayOfWeek,
    periodIndex: pIndex,
    duration: dur,
    targetPeriods,
    spanLabel: dur > 1 ? `Periods P${pIndex} - P${pIndex + dur - 1}` : `Period P${pIndex}`,
    semesterId,
    counts: {
      total,
      available: availableCount,
      occupied: occupiedCount,
      events: eventCount
    },
    facilities: results
  };
}

async function getFacilityWeeklySchedule(facilityId) {
  const [room, lab] = await Promise.all([
    db.get('SELECT * FROM rooms WHERE room_id = $1', [facilityId]),
    db.get(
      `
        SELECT l.*, s.full_name as incharge_name, s.designation as incharge_designation,
               s.official_email as incharge_email
        FROM laboratories l
        LEFT JOIN staff s ON l.staff_incharge_id = s.staff_id
        WHERE l.lab_id = $1 OR l.room_id = $2
      `,
      [facilityId, facilityId]
    )
  ]);

  if (!room && !lab) {
    return null;
  }

  const roomId = room ? room.room_id : lab.room_id;
  const labId = lab ? lab.lab_id : null;

  const slots = await db.all(
    `
      SELECT ts.slot_id, ts.day_of_week, ts.period_index, ts.start_time, ts.end_time,
             sub.subject_code, sub.subject_name, sub.course_type,
             sec.section_name, sec.department_id as sec_dept,
             sem.semester_number,
             st.staff_id as faculty_id, st.full_name as faculty_name,
             r.room_number,
             l.name as lab_name
      FROM timetable_slots ts
      JOIN subjects sub ON ts.subject_id = sub.subject_id
      JOIN sections sec ON ts.section_id = sec.section_id
      JOIN semesters sem ON sec.semester_id = sem.semester_id
      JOIN staff st ON ts.faculty_id = st.staff_id
      JOIN rooms r ON ts.room_id = r.room_id
      LEFT JOIN laboratories l ON ts.lab_id = l.lab_id
      JOIN timetable_versions tv ON ts.version_id = tv.version_id
      WHERE (ts.room_id = $1 OR ts.lab_id = $2)
        AND tv.status = 'PUBLISHED'
      ORDER BY ts.day_of_week, ts.period_index
    `,
    [roomId, labId || '']
  );

  const slotIds = slots.map((s) => s.slot_id);
  const substitutions = slotIds.length > 0
    ? await db.all(
        `
          SELECT cs.*, st.full_name as substitute_faculty_name
          FROM class_substitutions cs
          JOIN staff st ON cs.substitute_faculty_id = st.staff_id
          WHERE cs.slot_id IN (${buildPlaceholders(slotIds.length)})
            AND cs.status = 'APPROVED'
        `,
        slotIds
      )
    : [];

  const substMap = {};
  substitutions.forEach((sub) => {
    substMap[sub.slot_id] = sub;
  });

  slots.forEach((slot) => {
    if (substMap[slot.slot_id]) {
      const sub = substMap[slot.slot_id];
      slot.is_substituted = true;
      slot.substitute_faculty_id = sub.substitute_faculty_id;
      slot.substitute_faculty_name = sub.substitute_faculty_name;
      slot.original_faculty_name = slot.faculty_name;
      slot.substitution_reason = sub.reason;
    } else {
      slot.is_substituted = false;
    }
  });

  let bookings = await db.all(
    `
      SELECT * FROM facility_bookings
      WHERE (facility_id = $1 OR facility_id = $2) AND status IN ('CONFIRMED', 'PENDING')
    `,
    [roomId, labId || '']
  ).catch(() => []);

  if (labId) {
    const labBkgs = await db.all(
      "SELECT * FROM lab_bookings WHERE lab_id = $1 AND status IN ('CONFIRMED', 'PENDING')",
      [labId]
    ).catch(() => []);
    bookings = [...bookings, ...labBkgs];
  }

  const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const periods = [1, 2, 3, 4, 5, 6, 7];

  const grid = {};
  days.forEach((day) => {
    grid[day] = {};
    periods.forEach((p) => {
      grid[day][p] = {
        period_index: p,
        status: 'AVAILABLE',
        slot: null,
        booking: null
      };
    });
  });

  slots.forEach((slot) => {
    if (grid[slot.day_of_week] && grid[slot.day_of_week][slot.period_index]) {
      grid[slot.day_of_week][slot.period_index] = {
        period_index: slot.period_index,
        status: 'OCCUPIED',
        slot,
        booking: null
      };
    }
  });

  bookings.forEach((b) => {
    if (b.period_index && grid[b.day_of_week] && grid[b.day_of_week][b.period_index]) {
      if (grid[b.day_of_week][b.period_index].status === 'AVAILABLE') {
        grid[b.day_of_week][b.period_index] = {
          period_index: b.period_index,
          status: 'EVENT',
          slot: null,
          booking: b
        };
      }
    }
  });

  days.forEach((day) => {
    for (let p = 1; p <= 6; p++) {
      const curCell = grid[day][p];
      const nextCell = grid[day][p + 1];
      if (curCell && nextCell && curCell.status === 'OCCUPIED' && nextCell.status === 'OCCUPIED') {
        const s1 = curCell.slot;
        const s2 = nextCell.slot;
        if (s1 && s2 && (
          (s1.subject_code && s1.subject_code === s2.subject_code) ||
          (s1.course_type === 'PRACTICAL' && s2.course_type === 'PRACTICAL') ||
          (s1.lab_name && s1.lab_name === s2.lab_name) ||
          (s1.sec_dept && s1.section_name && s1.sec_dept === s2.sec_dept && s1.section_name === s2.section_name && (s1.subject_code === s2.subject_code || (s1.faculty_id && s1.faculty_id === s2.faculty_id)))
        )) {
          s1.is_continuous = true;
          s1.is_continuous_start = true;
          s1.continuous_part = 1;
          s1.continuous_total = 2;
          s1.continuous_span = `P${p} - P${p + 1}`;
          s1.continuous_start_time = s1.start_time;
          s1.continuous_end_time = s2.end_time;
          s1.continuous_label = `2-Period Continuous Lab (P${p} - P${p + 1})`;

          s2.is_continuous = true;
          s2.is_continuous_start = false;
          s2.continuous_part = 2;
          s2.continuous_total = 2;
          s2.continuous_span = `P${p} - P${p + 1}`;
          s2.continuous_start_time = s1.start_time;
          s2.continuous_end_time = s2.end_time;
          s2.continuous_label = '2-Period Continuous Lab (Part 2 of 2)';
        }
      }
    }
  });

  return {
    facility: {
      room_id: roomId,
      lab_id: labId,
      name: lab ? lab.name : (room ? room.room_number : roomId),
      room_number: room ? room.room_number : (lab ? lab.room_id : ''),
      facility_type: room ? room.room_type : 'LABORATORY',
      capacity: lab ? lab.capacity : (room ? room.capacity : 0),
      equipment_details: lab ? lab.equipment_details : (room ? room.facilities_description : ''),
      incharge: lab ? {
        name: lab.incharge_name,
        designation: lab.incharge_designation,
        email: lab.incharge_email
      } : null
    },
    grid,
    slots,
    bookings
  };
}

async function getFreeFacultyForPeriod(dayOfWeek, periodIndex, excludeFacultyId = null, departmentId = 'CSE') {
  const pIndex = parseInt(periodIndex, 10);

  let facQuery = `
    SELECT s.staff_id, s.full_name, s.designation, s.official_email, s.photo_url, s.department_id
    FROM staff s
    WHERE s.category = 'TEACHING'
  `;
  const facParams = [];

  if (departmentId && departmentId !== 'ALL') {
    facParams.push(departmentId);
    facQuery += ` AND s.department_id = $${facParams.length}`;
  }
  facQuery += ' ORDER BY s.full_name ASC';

  const [allFaculty, busyRegular, busySubstitute] = await Promise.all([
    db.all(facQuery, facParams),
    db.all(
      `
        SELECT DISTINCT ts.faculty_id, sub.subject_code, sec.section_name, sem.semester_number, r.room_number
        FROM timetable_slots ts
        JOIN subjects sub ON ts.subject_id = sub.subject_id
        JOIN sections sec ON ts.section_id = sec.section_id
        JOIN semesters sem ON sec.semester_id = sem.semester_id
        JOIN rooms r ON ts.room_id = r.room_id
        JOIN timetable_versions tv ON ts.version_id = tv.version_id
        WHERE ts.day_of_week = $1
          AND ts.period_index = $2
          AND tv.status = 'PUBLISHED'
      `,
      [dayOfWeek, pIndex]
    ),
    db.all(
      `
        SELECT DISTINCT cs.substitute_faculty_id, cs.reason
        FROM class_substitutions cs
        WHERE cs.day_of_week = $1
          AND cs.period_index = $2
          AND cs.status = 'APPROVED'
      `,
      [dayOfWeek, pIndex]
    )
  ]);

  const busyRegularMap = {};
  busyRegular.forEach((b) => {
    busyRegularMap[b.faculty_id] = b;
  });

  const busySubstMap = {};
  busySubstitute.forEach((b) => {
    busySubstMap[b.substitute_faculty_id] = b;
  });

  const availableList = [];
  const busyList = [];

  allFaculty.forEach((fac) => {
    if (excludeFacultyId && fac.staff_id === excludeFacultyId) {
      return;
    }

    const regConflict = busyRegularMap[fac.staff_id];
    const substConflict = busySubstMap[fac.staff_id];

    if (!regConflict && !substConflict) {
      availableList.push({
        ...fac,
        is_free: true,
        current_status: 'FREE',
        conflict_details: null
      });
    } else {
      const conflictMsg = regConflict
        ? `Scheduled in Sem ${regConflict.semester_number} Sec ${regConflict.section_name} (${regConflict.subject_code}) in ${regConflict.room_number}`
        : 'Already assigned as a substitute for another period';

      busyList.push({
        ...fac,
        is_free: false,
        current_status: 'BUSY',
        conflict_details: conflictMsg
      });
    }
  });

  return {
    dayOfWeek,
    periodIndex: pIndex,
    availableFacultyCount: availableList.length,
    busyFacultyCount: busyList.length,
    availableFaculty: availableList,
    busyFaculty: busyList
  };
}

async function createFacility(data, user = {}, ip = '127.0.0.1') {
  const type = (data.room_type || data.type || 'CLASSROOM').toUpperCase();
  if (type === 'LABORATORY') {
    return laboratoryService.createLaboratory(data, user, ip);
  }

  const {
    room_id,
    department_id = 'CSE',
    room_number,
    capacity = 70,
    facilities_description = 'Smart Board, High-Lumen Projector, Audio System'
  } = data;

  if (!room_number || !room_number.trim()) {
    throw new Error('Room name / number is required.');
  }

  const cap = parseInt(capacity, 10);
  if (isNaN(cap) || cap <= 0) {
    throw new Error('Capacity must be a positive integer.');
  }

  const dept = (department_id || 'CSE').toUpperCase();
  const roomId = (room_id && room_id.trim())
    ? room_id.trim()
    : `ROOM-${dept}-${crypto.randomUUID().substring(0, 5).toUpperCase()}`;

  await db.transaction(async (tx) => {
    await tx.run(
      `
        INSERT INTO rooms (room_id, department_id, room_number, room_type, capacity, facilities_description)
        VALUES ($1, $2, $3, 'CLASSROOM', $4, $5)
        ON CONFLICT (room_id) DO UPDATE SET
          department_id = EXCLUDED.department_id,
          room_number = EXCLUDED.room_number,
          room_type = 'CLASSROOM',
          capacity = EXCLUDED.capacity,
          facilities_description = EXCLUDED.facilities_description
      `,
      [roomId, dept, room_number.trim(), cap, facilities_description]
    );

    await tx.run(
      `
        INSERT INTO audit_logs (log_id, admin_id, admin_name, action, entity_name, entity_id, old_value, new_value, ip_address)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        `AUD-${crypto.randomUUID().substring(0, 8).toUpperCase()}`,
        user.userId || 'ADMIN',
        user.fullName || 'Administrator',
        'CREATE_CLASSROOM',
        'ROOM',
        roomId,
        null,
        JSON.stringify({ room_id: roomId, room_number: room_number.trim(), capacity: cap, department_id: dept }),
        ip
      ]
    );
  });

  return db.get('SELECT * FROM rooms WHERE room_id = $1', [roomId]);
}

async function updateFacility(facilityId, updates, user = {}, ip = '127.0.0.1') {
  const lab = await db.get('SELECT lab_id FROM laboratories WHERE lab_id = $1 OR room_id = $2', [facilityId, facilityId]);
  if (lab) {
    return laboratoryService.updateLaboratory(lab.lab_id, updates, user, ip);
  }

  const room = await db.get('SELECT * FROM rooms WHERE room_id = $1', [facilityId]);
  if (!room) {
    throw new Error(`Facility '${facilityId}' was not found.`);
  }

  const roomNumber = updates.room_number !== undefined ? updates.room_number.trim() : room.room_number;
  const dept = updates.department_id !== undefined ? updates.department_id.toUpperCase() : room.department_id;
  const desc = updates.facilities_description !== undefined ? updates.facilities_description : (updates.equipment_details || room.facilities_description);

  let cap = room.capacity;
  if (updates.capacity !== undefined) {
    const parsedCap = parseInt(updates.capacity, 10);
    if (isNaN(parsedCap) || parsedCap <= 0) {
      throw new Error('Capacity must be a positive integer.');
    }
    cap = parsedCap;
  }

  await db.transaction(async (tx) => {
    await tx.run(
      `
        UPDATE rooms
        SET room_number = $1, capacity = $2, facilities_description = $3, department_id = $4
        WHERE room_id = $5
      `,
      [roomNumber, cap, desc, dept, facilityId]
    );

    await tx.run(
      `
        INSERT INTO audit_logs (log_id, admin_id, admin_name, action, entity_name, entity_id, old_value, new_value, ip_address)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        `AUD-${crypto.randomUUID().substring(0, 8).toUpperCase()}`,
        user.userId || 'ADMIN',
        user.fullName || 'Administrator',
        'UPDATE_FACILITY',
        'ROOM',
        facilityId,
        JSON.stringify({ capacity: room.capacity, room_number: room.room_number }),
        JSON.stringify({ capacity: cap, room_number: roomNumber }),
        ip
      ]
    );
  });

  return db.get('SELECT * FROM rooms WHERE room_id = $1', [facilityId]);
}

async function deleteFacility(facilityId, user = {}, ip = '127.0.0.1') {
  const lab = await db.get('SELECT lab_id FROM laboratories WHERE lab_id = $1 OR room_id = $2', [facilityId, facilityId]);
  if (lab) {
    return laboratoryService.deleteLaboratory(lab.lab_id, user, ip);
  }

  const room = await db.get('SELECT * FROM rooms WHERE room_id = $1', [facilityId]);
  if (!room) {
    throw new Error(`Facility '${facilityId}' was not found.`);
  }

  const activeSlots = await db.get('SELECT COUNT(*)::int as count FROM timetable_slots WHERE room_id = $1', [facilityId]);
  if (activeSlots.count > 0) {
    throw new Error(`Cannot delete facility '${facilityId}': ${activeSlots.count} timetable slots are currently assigned to this room. Reassign them first.`);
  }

  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM rooms WHERE room_id = $1', [facilityId]);
    await tx.run(
      `
        INSERT INTO audit_logs (log_id, admin_id, admin_name, action, entity_name, entity_id, old_value, new_value, ip_address)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        `AUD-${crypto.randomUUID().substring(0, 8).toUpperCase()}`,
        user.userId || 'ADMIN',
        user.fullName || 'Administrator',
        'DELETE_ROOM',
        'ROOM',
        facilityId,
        JSON.stringify(room),
        null,
        ip
      ]
    );
  });

  return { success: true, facilityId, message: `Facility '${room.room_number}' deleted successfully.` };
}

async function getRoleSpecificDashboard(user = null, filters = {}) {
  const day = (filters.dayOfWeek || 'MONDAY').toUpperCase();
  const pIndex = parseInt(filters.periodIndex, 10) || 1;
  const role = user ? (user.role || 'GUEST') : 'GUEST';
  const deptId = (filters.departmentId || (user ? user.departmentId : 'CSE') || 'CSE').toUpperCase();

  const [totalRoomsRow, totalLabsRow, activeSlots, substitutionsToday, labBookingsToday] = await Promise.all([
    db.get('SELECT COUNT(*)::int as count FROM rooms'),
    db.get('SELECT COUNT(*)::int as count FROM laboratories'),
    db.all(
      `
        SELECT ts.slot_id, ts.version_id, ts.section_id, ts.day_of_week, ts.start_time, ts.end_time,
               ts.period_index, ts.subject_id, ts.faculty_id, ts.room_id, ts.is_laboratory, ts.lab_id,
               sub.subject_code, sub.subject_name, sub.course_type,
               sec.section_name, sec.semester_id, sec.department_id as sec_dept,
               sem.semester_number,
               st.full_name as faculty_name, st.designation as faculty_designation,
               r.room_number,
               l.name as lab_name
        FROM timetable_slots ts
        JOIN subjects sub ON ts.subject_id = sub.subject_id
        JOIN sections sec ON ts.section_id = sec.section_id
        JOIN semesters sem ON sec.semester_id = sem.semester_id
        JOIN staff st ON ts.faculty_id = st.staff_id
        JOIN rooms r ON ts.room_id = r.room_id
        LEFT JOIN laboratories l ON ts.lab_id = l.lab_id
        JOIN timetable_versions tv ON ts.version_id = tv.version_id
        WHERE ts.day_of_week = $1
          AND ts.period_index = $2
          AND tv.status = 'PUBLISHED'
      `,
      [day, pIndex]
    ),
    db.all(
      `
        SELECT cs.*, orig_st.full_name as original_faculty_name, orig_st.department_id as original_dept,
               subst_st.full_name as substitute_faculty_name, subst_st.designation as substitute_designation,
               ts.room_id, r.room_number, sub.subject_code, sub.subject_name,
               sec.section_name, sem.semester_number
        FROM class_substitutions cs
        JOIN staff orig_st ON cs.original_faculty_id = orig_st.staff_id
        JOIN staff subst_st ON cs.substitute_faculty_id = subst_st.staff_id
        LEFT JOIN timetable_slots ts ON cs.slot_id = ts.slot_id
        LEFT JOIN rooms r ON ts.room_id = r.room_id
        LEFT JOIN subjects sub ON ts.subject_id = sub.subject_id
        LEFT JOIN sections sec ON ts.section_id = sec.section_id
        LEFT JOIN semesters sem ON sec.semester_id = sem.semester_id
        WHERE cs.day_of_week = $1
          AND cs.status = 'APPROVED'
      `,
      [day]
    ),
    db.all(
      `
        SELECT lb.*, l.name as lab_name, l.room_id, r.room_number
        FROM lab_bookings lb
        JOIN laboratories l ON lb.lab_id = l.lab_id
        JOIN rooms r ON l.room_id = r.room_id
        WHERE lb.day_of_week = $1
          AND lb.status IN ('CONFIRMED', 'PENDING')
      `,
      [day]
    )
  ]);

  const totalRooms = totalRoomsRow.count;
  const totalLabs = totalLabsRow.count;

  const substBySlotId = {};
  substitutionsToday.forEach((s) => {
    substBySlotId[s.slot_id] = s;
  });

  const result = {
    role,
    dayOfWeek: day,
    periodIndex: pIndex,
    user: user ? {
      userId: user.userId,
      pnr: user.pnr,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      departmentId: user.departmentId
    } : null,
    campusMetrics: {
      totalFacilities: totalRooms,
      totalLaboratories: totalLabs,
      occupiedFacilitiesCount: activeSlots.length,
      availableFacilitiesCount: Math.max(0, totalRooms - activeSlots.length),
      activeSubstitutionsCount: substitutionsToday.length,
      activeLabBookingsCount: labBookingsToday.length
    }
  };

  if (role === 'SUPER_ADMIN') {
    const auditLogs = await db.all('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 8');
    const deptUsage = {};
    activeSlots.forEach((s) => {
      const d = s.sec_dept || 'OTHER';
      deptUsage[d] = (deptUsage[d] || 0) + 1;
    });

    result.superAdminData = {
      activeSessions: activeSlots.map((s) => ({
        ...s,
        substitution: substBySlotId[s.slot_id] || null
      })),
      substitutionsToday,
      labBookingsToday,
      deptUsage,
      recentAuditLogs: auditLogs
    };
  } else if (role === 'DEAN') {
    const scope = await getDeanSchoolScope(user.userId);
    const schoolId = scope ? scope.schoolId : null;
    const schoolDeptIds = scope ? scope.departmentIds : [];
    const phs = buildPlaceholders(schoolDeptIds.length);

    const school = schoolId
      ? await db.get('SELECT school_id, name, dean_name, dean_email FROM schools WHERE school_id = $1', [schoolId])
      : null;

    const schoolSlots = schoolDeptIds.length
      ? activeSlots.filter((s) => schoolDeptIds.includes(s.sec_dept))
      : [];

    const departmentBreakdown = await Promise.all(
      schoolDeptIds.map(async (dId) => {
        const [deptRow, sectionsRow, facultyRow, labsRow] = await Promise.all([
          db.get('SELECT department_id, name FROM departments WHERE department_id = $1', [dId]),
          db.get('SELECT COUNT(*)::int as c FROM sections WHERE department_id = $1', [dId]),
          db.get("SELECT COUNT(*)::int as c FROM staff WHERE department_id = $1 AND category = 'TEACHING'", [dId]),
          db.get('SELECT COUNT(*)::int as c FROM laboratories WHERE department_id = $1', [dId])
        ]);
        return {
          departmentId: dId,
          departmentName: deptRow ? deptRow.name : dId,
          sectionsCount: sectionsRow.c,
          facultyCount: facultyRow.c,
          laboratoriesCount: labsRow.c,
          activeSlotsNow: schoolSlots.filter((s) => s.sec_dept === dId).length
        };
      })
    );

    const [substRow, labRow, fbRow] = schoolDeptIds.length
      ? await Promise.all([
          db.get(
            `
              SELECT COUNT(*)::int as c FROM class_substitutions cs
              JOIN timetable_slots ts ON cs.slot_id = ts.slot_id
              JOIN sections sec ON ts.section_id = sec.section_id
              WHERE cs.status = 'PENDING' AND sec.department_id IN (${phs})
            `,
            schoolDeptIds
          ),
          db.get(
            `
              SELECT COUNT(*)::int as c FROM lab_bookings lb
              JOIN laboratories l ON lb.lab_id = l.lab_id
              WHERE lb.status = 'PENDING' AND l.department_id IN (${phs})
            `,
            schoolDeptIds
          ),
          db.get(
            `
              SELECT COUNT(*)::int as c FROM user_feedback
              WHERE status = 'PENDING' AND department_id IN (${phs})
            `,
            schoolDeptIds
          )
        ])
      : [{ c: 0 }, { c: 0 }, { c: 0 }];

    result.deanData = {
      school,
      departmentIds: schoolDeptIds,
      departmentBreakdown,
      activeSessions: schoolSlots.map((s) => ({
        ...s,
        substitution: substBySlotId[s.slot_id] || null
      })),
      pendingApprovals: {
        substitutions: substRow.c,
        labBookings: labRow.c,
        feedback: fbRow.c,
        total: substRow.c + labRow.c + fbRow.c
      }
    };
  } else if (role === 'DEPT_ADMIN' || role === 'COORDINATOR') {
    const [deptSections, deptLabs, freeFac] = await Promise.all([
      db.all(
        `
          SELECT sec.section_id, sec.section_name, sec.semester_id, sem.semester_number, r.room_number, r.room_id
          FROM sections sec
          JOIN semesters sem ON sec.semester_id = sem.semester_id
          LEFT JOIN rooms r ON r.room_id = (
            SELECT room_id FROM timetable_slots ts 
            JOIN timetable_versions tv ON ts.version_id = tv.version_id
            WHERE ts.section_id = sec.section_id AND tv.status = 'PUBLISHED' LIMIT 1
          )
          WHERE sec.department_id = $1
            AND sec.semester_id IN ('SEM_3', 'SEM_5')
          ORDER BY sem.semester_number, sec.section_name
        `,
        [deptId]
      ),
      db.all(
        `
          SELECT l.lab_id, l.name, l.room_id, l.capacity, l.equipment_details,
                 r.room_number,
                 s.full_name as incharge_name, s.designation as incharge_designation
          FROM laboratories l
          JOIN rooms r ON l.room_id = r.room_id
          LEFT JOIN staff s ON l.staff_incharge_id = s.staff_id
          WHERE l.department_id = $1
        `,
        [deptId]
      ),
      getFreeFacultyForPeriod(day, pIndex, null, deptId)
    ]);

    const sectionLiveStatus = deptSections.map((sec) => {
      const activeSlot = activeSlots.find((s) => s.section_id === sec.section_id);
      const sub = activeSlot ? substBySlotId[activeSlot.slot_id] : null;
      return {
        sectionId: sec.section_id,
        sectionName: sec.section_name,
        semesterNumber: sec.semester_number,
        defaultRoom: sec.room_number || 'Block 5-S',
        currentSession: activeSlot ? {
          slotId: activeSlot.slot_id,
          subjectCode: activeSlot.subject_code,
          subjectName: activeSlot.subject_name,
          courseType: activeSlot.course_type,
          roomNumber: activeSlot.room_number,
          facultyId: activeSlot.faculty_id,
          facultyName: activeSlot.faculty_name,
          isSubstituted: !!sub,
          substituteFacultyName: sub ? sub.substitute_faculty_name : null,
          substitutionReason: sub ? sub.reason : null,
          isLab: activeSlot.is_laboratory === 1,
          labName: activeSlot.lab_name
        } : null
      };
    });

    const labLiveStatus = deptLabs.map((lab) => {
      const activeLabSlot = activeSlots.find((s) => s.lab_id === lab.lab_id || s.room_id === lab.room_id);
      const booking = labBookingsToday.find((b) => b.lab_id === lab.lab_id && (b.period_index === pIndex || !b.period_index));
      let status = 'AVAILABLE';
      if (activeLabSlot) status = 'OCCUPIED';
      else if (booking) status = 'EVENT';

      return {
        ...lab,
        status,
        activeSession: activeLabSlot ? {
          subjectCode: activeLabSlot.subject_code,
          subjectName: activeLabSlot.subject_name,
          cohortLabel: `${activeLabSlot.sec_dept} Sem ${activeLabSlot.semester_number} Sec ${activeLabSlot.section_name}`,
          facultyName: activeLabSlot.faculty_name
        } : null,
        activeBooking: booking ? {
          title: booking.title,
          coordinatorName: booking.coordinator_name
        } : null
      };
    });

    result.deptAdminData = {
      departmentId: deptId,
      sectionLiveStatus,
      labLiveStatus,
      freeFacultyCount: freeFac.availableFacultyCount,
      substitutionsToday: substitutionsToday.filter((s) => s.original_dept === deptId),
      availableFacultyList: freeFac.availableFaculty.slice(0, 10)
    };
  } else if (role === 'TEACHING_STAFF') {
    const pnr = user ? (user.pnr || user.pnrno || '') : '';
    const staff = await db.get('SELECT * FROM staff WHERE staff_id = $1 OR official_email = $2', [pnr, user ? user.email : '']);
    const staffId = staff ? staff.staff_id : pnr;

    const myDaySlots = await db.all(
      `
        SELECT ts.slot_id, ts.period_index, ts.start_time, ts.end_time,
               sub.subject_code, sub.subject_name, sub.course_type,
               sec.section_name, sec.department_id as sec_dept,
               sem.semester_number,
               r.room_number, r.room_id,
               ts.is_laboratory,
               l.name as lab_name
        FROM timetable_slots ts
        JOIN subjects sub ON ts.subject_id = sub.subject_id
        JOIN sections sec ON ts.section_id = sec.section_id
        JOIN semesters sem ON sec.semester_id = sem.semester_id
        JOIN rooms r ON ts.room_id = r.room_id
        LEFT JOIN laboratories l ON ts.lab_id = l.lab_id
        JOIN timetable_versions tv ON ts.version_id = tv.version_id
        WHERE ts.faculty_id = $1
          AND ts.day_of_week = $2
          AND tv.status = 'PUBLISHED'
        ORDER BY ts.period_index ASC
      `,
      [staffId, day]
    );

    const ongoingSlot = myDaySlots.find((s) => s.period_index === pIndex);
    const nextSlot = myDaySlots.find((s) => s.period_index > pIndex);

    result.facultyData = {
      staffProfile: staff,
      todaySlots: myDaySlots,
      currentClass: ongoingSlot || null,
      nextClass: nextSlot || null,
      substituteDutiesAssignedToMe: substitutionsToday.filter((s) => s.substitute_faculty_id === staffId),
      myLeaveSubstitutions: substitutionsToday.filter((s) => s.original_faculty_id === staffId),
      totalPeriodsToday: myDaySlots.length
    };
  } else if (role === 'NON_TEACHING_STAFF') {
    const pnr = user ? (user.pnr || user.pnrno || '') : '';
    const staff = await db.get('SELECT * FROM staff WHERE staff_id = $1 OR official_email = $2', [pnr, user ? user.email : '']);
    const staffId = staff ? staff.staff_id : pnr;

    const myLabs = (await db.all(
      `
        SELECT l.*, r.room_number, r.capacity as room_cap,
               st_p.full_name as primary_incharge_name,
               st_a.full_name as assistant_incharge_name,
               CASE WHEN l.staff_incharge_id = $1 THEN 'PRIMARY_INCHARGE' ELSE 'ASSISTANT_INCHARGE' END as user_incharge_role
        FROM laboratories l
        JOIN rooms r ON l.room_id = r.room_id
        LEFT JOIN staff st_p ON l.staff_incharge_id = st_p.staff_id
        LEFT JOIN staff st_a ON l.assistant_incharge_id = st_a.staff_id
        WHERE l.staff_incharge_id = $1 OR l.assistant_incharge_id = $1
      `,
      [staffId]
    )) || [];

    const assignedLabsWithSchedule = await Promise.all(
      myLabs.map(async (lab) => {
        const labDaySlots = await db.all(
          `
            SELECT ts.slot_id, ts.period_index, ts.start_time, ts.end_time,
                   sub.subject_code, sub.subject_name,
                   sec.section_name, sec.department_id as sec_dept,
                   sem.semester_number,
                   st.full_name as faculty_name,
                   r.room_number
            FROM timetable_slots ts
            JOIN subjects sub ON ts.subject_id = sub.subject_id
            JOIN sections sec ON ts.section_id = sec.section_id
            JOIN semesters sem ON sec.semester_id = sem.semester_id
            JOIN staff st ON ts.faculty_id = st.staff_id
            JOIN rooms r ON ts.room_id = r.room_id
            JOIN timetable_versions tv ON ts.version_id = tv.version_id
            WHERE (ts.lab_id = $1 OR ts.room_id = $2)
              AND ts.day_of_week = $3
              AND tv.status = 'PUBLISHED'
            ORDER BY ts.period_index ASC
          `,
          [lab.lab_id, lab.room_id, day]
        );

        const activeSlot = labDaySlots.find((s) => s.period_index === pIndex);
        const booking = labBookingsToday.find((b) => b.lab_id === lab.lab_id && (b.period_index === pIndex || !b.period_index));

        let liveStatus = 'AVAILABLE';
        if (activeSlot) liveStatus = 'OCCUPIED';
        else if (booking) liveStatus = 'EVENT';

        return {
          ...lab,
          liveStatus,
          activeSession: activeSlot || null,
          activeBooking: booking || null,
          todaySchedule: labDaySlots,
          upcomingBookings: labBookingsToday.filter((b) => b.lab_id === lab.lab_id)
        };
      })
    );

    result.labStaffData = {
      staffProfile: staff,
      assignedLaboratories: assignedLabsWithSchedule
    };
  } else if (role === 'STUDENT') {
    let sectionId = (user && user.sectionId) || filters.sectionId || null;

    if (!sectionId && user && user.userId) {
      const assignment = await db.get('SELECT section_id FROM user_section_assignments WHERE user_id = $1', [user.userId]);
      if (assignment) sectionId = assignment.section_id;
    }

    const secInfo = sectionId
      ? await db.get(
          `
            SELECT sec.*, sem.semester_number, sem.year_id, dept.name as department_name,
                   (SELECT r.room_number FROM timetable_slots ts JOIN rooms r ON ts.room_id = r.room_id WHERE ts.section_id = sec.section_id AND ts.is_laboratory = 0 LIMIT 1) as room_number,
                   (SELECT ts.room_id FROM timetable_slots ts WHERE ts.section_id = sec.section_id AND ts.is_laboratory = 0 LIMIT 1) as room_id
            FROM sections sec
            JOIN semesters sem ON sec.semester_id = sem.semester_id
            JOIN departments dept ON sec.department_id = dept.department_id
            WHERE sec.section_id = $1
          `,
          [sectionId]
        )
      : null;

    const secDaySlots = sectionId
      ? await db.all(
          `
            SELECT ts.slot_id, ts.period_index, ts.start_time, ts.end_time,
                   sub.subject_code, sub.subject_name, sub.course_type,
                   st.full_name as faculty_name, st.designation as faculty_designation,
                   r.room_number, ts.is_laboratory,
                   l.name as lab_name
            FROM timetable_slots ts
            JOIN subjects sub ON ts.subject_id = sub.subject_id
            JOIN staff st ON ts.faculty_id = st.staff_id
            JOIN rooms r ON ts.room_id = r.room_id
            LEFT JOIN laboratories l ON ts.lab_id = l.lab_id
            JOIN timetable_versions tv ON ts.version_id = tv.version_id
            WHERE ts.section_id = $1
              AND ts.day_of_week = $2
              AND tv.status = 'PUBLISHED'
            ORDER BY ts.period_index ASC
          `,
          [sectionId, day]
        )
      : [];

    secDaySlots.forEach((slot) => {
      if (substBySlotId[slot.slot_id]) {
        const sub = substBySlotId[slot.slot_id];
        slot.isSubstituted = true;
        slot.substituteFacultyName = sub.substitute_faculty_name;
        slot.substitutionReason = sub.reason;
      } else {
        slot.isSubstituted = false;
      }
    });

    const ongoingSlot = secDaySlots.find((s) => s.period_index === pIndex);
    const nextSlot = secDaySlots.find((s) => s.period_index > pIndex);

    if (ongoingSlot) {
      ongoingSlot.location = ongoingSlot.is_laboratory && ongoingSlot.lab_name
        ? `${ongoingSlot.lab_name} (${ongoingSlot.room_number})`
        : `Room ${ongoingSlot.room_number}`;
      ongoingSlot.time_range = `${ongoingSlot.start_time} - ${ongoingSlot.end_time}`;
    }

    if (nextSlot) {
      nextSlot.location = nextSlot.is_laboratory && nextSlot.lab_name
        ? `${nextSlot.lab_name} (${nextSlot.room_number})`
        : `Room ${nextSlot.room_number}`;
      nextSlot.time_range = `${nextSlot.start_time} - ${nextSlot.end_time}`;
    }

    const busyLabs = [...new Set([
      ...activeSlots.filter((s) => s.lab_id).map((s) => s.lab_id),
      ...labBookingsToday.filter((b) => b.period_index === pIndex || !b.period_index).map((b) => b.lab_id)
    ])];
    const busyRooms = [...new Set(activeSlots.filter((s) => s.room_id).map((s) => s.room_id))];

    let freeLabsSql = `
      SELECT l.lab_id, l.name, l.room_id, l.capacity, r.room_number, l.equipment_details
      FROM laboratories l
      JOIN rooms r ON l.room_id = r.room_id
    `;
    if (busyLabs.length > 0) {
      freeLabsSql += ` WHERE l.lab_id NOT IN (${buildPlaceholders(busyLabs.length)})`;
    }
    freeLabsSql += ' LIMIT 6';

    let freeRoomsSql = `
      SELECT r.room_id, r.room_number, r.capacity, r.facilities_description
      FROM rooms r
      WHERE r.room_type = 'CLASSROOM'
    `;
    if (busyRooms.length > 0) {
      freeRoomsSql += ` AND r.room_id NOT IN (${buildPlaceholders(busyRooms.length)})`;
    }
    freeRoomsSql += ' LIMIT 6';

    const [freeLabs, freeRooms, recentEvents] = await Promise.all([
      db.all(freeLabsSql, busyLabs),
      db.all(freeRoomsSql, busyRooms),
      db.all(
        `
          SELECT fb.*, r.room_number
          FROM facility_bookings fb
          LEFT JOIN rooms r ON fb.facility_id = r.room_id
          WHERE fb.status IN ('CONFIRMED', 'PENDING')
          ORDER BY fb.booking_date ASC, fb.period_index ASC
          LIMIT 6
        `
      ).catch(() => [])
    ]);

    result.studentData = {
      section: secInfo || null,
      sectionAssigned: Boolean(secInfo),
      todaySchedule: secDaySlots,
      currentClass: ongoingSlot || null,
      nextClass: nextSlot || null,
      freeLabsForPractice: freeLabs,
      freeClassrooms: freeRooms,
      emptyClassroomsCount: freeRooms.length,
      emptyLabsCount: freeLabs.length,
      recentPlannedEvents: recentEvents
    };
  } else {
    result.guestData = {
      activeSessionsCount: activeSlots.length,
      availableRoomsCount: Math.max(0, totalRooms - activeSlots.length)
    };
  }

  return result;
}

async function planFacilityEvent(data, currentUser, ipAddress = '127.0.0.1') {
  if (!currentUser) {
    throw new Error('Authentication required: Please log in to plan and reserve facilities.');
  }

  const facilityId = (data.facilityId || data.facility_id || '').trim();
  const title = (data.title || data.eventName || data.event_name || '').trim();
  const clubName = (data.clubName || data.club_name || '').trim();
  const description = (data.description || '').trim();
  const bookingDate = data.bookingDate || data.booking_date || new Date().toISOString().split('T')[0];
  const dayOfWeek = (data.dayOfWeek || data.day_of_week || '').toUpperCase().trim();
  const periodIndex = data.periodIndex != null ? parseInt(data.periodIndex, 10) : null;
  const duration = data.duration != null ? Math.max(1, Math.min(7, parseInt(data.duration, 10))) : 1;
  const coordinatorName = (data.coordinatorName || data.coordinator_name || currentUser.fullName || '').trim();
  const coordinatorRoll = (data.coordinatorRoll || data.coordinator_roll || currentUser.pnrno || '').trim();
  const coordinatorContact = (data.coordinatorContact || data.coordinator_contact || '').trim();
  const facultyMentor = (data.facultyMentor || data.faculty_mentor || '').trim();
  const expectedAttendees = data.expectedAttendees ? parseInt(data.expectedAttendees, 10) : null;

  if (!facilityId || !title || !dayOfWeek) {
    throw new Error('Facility, Event Title, and Day of Week are required.');
  }

  const [room, lab] = await Promise.all([
    db.get('SELECT * FROM rooms WHERE room_id = $1 OR room_number = $2', [facilityId, facilityId]),
    db.get('SELECT * FROM laboratories WHERE lab_id = $1 OR room_id = $2', [facilityId, facilityId])
  ]);

  if (!room && !lab) {
    throw new Error(`Facility '${facilityId}' was not found in institutional directory.`);
  }

  const rawFacilityType = lab ? 'LABORATORY' : (room ? (room.room_type || 'CLASSROOM') : 'CLASSROOM');
  const validFacilityTypes = ['CLASSROOM', 'LABORATORY', 'SEMINAR_HALL', 'AUDITORIUM', 'WORKSHOP', 'DRAWING_HALL', 'CONFERENCE_HALL', 'FACILITY'];
  const facilityType = validFacilityTypes.includes(rawFacilityType) ? rawFacilityType : (lab ? 'LABORATORY' : 'CLASSROOM');
  const facilityName = lab ? lab.name : `${room.room_type === 'SEMINAR_HALL' ? 'Seminar Hall' : room.room_type === 'AUDITORIUM' ? 'Auditorium' : 'Room'} ${room.room_number}`;
  const effectiveRoomId = room ? room.room_id : lab.room_id;
  const effectiveLabId = lab ? lab.lab_id : null;

  const targetPeriods = periodIndex ? Array.from({ length: duration }, (_, i) => periodIndex + i) : [null];

  for (const p of targetPeriods) {
    if (p) {
      if (p > 7) {
        throw new Error(`Requested booking exceeds daily academic periods (Period ${p} does not exist; maximum is Period 7).`);
      }

      const timetableSlot = await db.get(
        `
          SELECT ts.*, sub.subject_code, sub.subject_name, sec.section_name, sem.semester_number, st.full_name as faculty_name
          FROM timetable_slots ts
          JOIN subjects sub ON ts.subject_id = sub.subject_id
          JOIN sections sec ON ts.section_id = sec.section_id
          JOIN semesters sem ON sec.semester_id = sem.semester_id
          JOIN staff st ON ts.faculty_id = st.staff_id
          JOIN timetable_versions tv ON ts.version_id = tv.version_id
          WHERE (ts.room_id = $1 OR (ts.lab_id IS NOT NULL AND ts.lab_id = $2))
            AND ts.day_of_week = $3
            AND ts.period_index = $4
            AND tv.status = 'PUBLISHED'
        `,
        [effectiveRoomId, effectiveLabId || '', dayOfWeek, p]
      );

      if (timetableSlot) {
        throw new Error(
          `Facility Conflict: ${facilityName} is already scheduled for regular class ${timetableSlot.subject_code} (${timetableSlot.subject_name}) with faculty ${timetableSlot.faculty_name} in Sem ${timetableSlot.semester_number} Sec ${timetableSlot.section_name} on ${dayOfWeek} Period ${p}. Please select an empty slot or another facility.`
        );
      }

      const existingFacBooking = await db.get(
        `
          SELECT * FROM facility_bookings
          WHERE (facility_id = $1 OR facility_id = $2 OR facility_id = $3)
            AND day_of_week = $4
            AND (period_index = $5 OR period_index IS NULL)
            AND status IN ('CONFIRMED', 'PENDING')
        `,
        [facilityId, effectiveRoomId, effectiveLabId || '', dayOfWeek, p]
      );

      if (existingFacBooking) {
        throw new Error(
          `Facility already booked: Event '${existingFacBooking.title}' (${existingFacBooking.club_name || 'Event'}) is already scheduled/pending in ${facilityName} on ${dayOfWeek} Period ${p} by coordinator ${existingFacBooking.coordinator_name}.`
        );
      }

      if (effectiveLabId) {
        const existingLabBooking = await db.get(
          `
            SELECT * FROM lab_bookings
            WHERE lab_id = $1
              AND day_of_week = $2
              AND (period_index = $3 OR period_index IS NULL)
              AND status IN ('CONFIRMED', 'PENDING')
          `,
          [effectiveLabId, dayOfWeek, p]
        );

        if (existingLabBooking) {
          throw new Error(
            `Laboratory already booked: '${existingLabBooking.title}' is scheduled on ${dayOfWeek} Period ${p}.`
          );
        }
      }
    }
  }

  const primaryBookingId = `EVT-FAC-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;

  await db.transaction(async (tx) => {
    for (let idx = 0; idx < targetPeriods.length; idx++) {
      const p = targetPeriods[idx];
      const bookingId = idx === 0 ? primaryBookingId : `${primaryBookingId}-${p}`;

      try {
        await tx.run(
          `
            INSERT INTO facility_bookings (
              booking_id, facility_id, facility_name, facility_type, title, club_name, description,
              booking_date, day_of_week, period_index, coordinator_name, coordinator_roll,
              coordinator_contact, faculty_mentor, expected_attendees, booked_by_user_id, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'CONFIRMED')
          `,
          [
            bookingId,
            facilityId,
            facilityName,
            facilityType,
            title,
            clubName || 'Student Chapter / Society',
            description || null,
            bookingDate,
            dayOfWeek,
            p,
            coordinatorName,
            coordinatorRoll || null,
            coordinatorContact || null,
            facultyMentor || null,
            expectedAttendees || null,
            currentUser.userId
          ]
        );
      } catch (insertErr) {
        if (insertErr.message && insertErr.message.includes('facility_bookings_facility_type_check')) {
          // If the underlying database table has a legacy 2-value check constraint ('CLASSROOM', 'LABORATORY'),
          // fall back to 'CLASSROOM' so booking for seminar halls, auditoriums, etc. never fails!
          const fallbackType = facilityType === 'LABORATORY' ? 'LABORATORY' : 'CLASSROOM';
          await tx.run(
            `
              INSERT INTO facility_bookings (
                booking_id, facility_id, facility_name, facility_type, title, club_name, description,
                booking_date, day_of_week, period_index, coordinator_name, coordinator_roll,
                coordinator_contact, faculty_mentor, expected_attendees, booked_by_user_id, status
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'CONFIRMED')
            `,
            [
              bookingId,
              facilityId,
              facilityName,
              fallbackType,
              title,
              clubName || 'Student Chapter / Society',
              description || null,
              bookingDate,
              dayOfWeek,
              p,
              coordinatorName,
              coordinatorRoll || null,
              coordinatorContact || null,
              facultyMentor || null,
              expectedAttendees || null,
              currentUser.userId
            ]
          );
        } else {
          throw insertErr;
        }
      }

      if (effectiveLabId) {
        await tx.run(
          `
            INSERT INTO lab_bookings (
              booking_id, lab_id, title, description, booking_date, day_of_week,
              period_index, coordinator_name, booked_by_user_id, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'CONFIRMED')
          `,
          [
            bookingId,
            effectiveLabId,
            title,
            description || null,
            bookingDate,
            dayOfWeek,
            p,
            coordinatorName,
            currentUser.userId
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
        'EVENT_FACILITY_BOOKED',
        facilityType,
        facilityId,
        null,
        JSON.stringify({ bookingId: primaryBookingId, title, dayOfWeek, periodIndex, duration, facilityName }),
        ipAddress
      ]
    );
  });

  return {
    bookingId: primaryBookingId,
    facilityId,
    facilityName,
    facilityType,
    title,
    clubName,
    dayOfWeek,
    periodIndex,
    duration,
    bookingDate,
    coordinatorName,
    status: 'CONFIRMED',
    message: `Event "${title}" successfully scheduled in ${facilityName} for ${dayOfWeek} Period ${periodIndex}${duration > 1 ? ` to Period ${periodIndex + duration - 1}` : ''}!`
  };
}

async function getLiveClassesByCohort(dayOfWeek, periodIndex, departmentId) {
  const day = dayOfWeek || getInstitutionalDayOfWeek();
  const pIndex = periodIndex || getCurrentPeriodIndex();

  let query = `
    SELECT ts.slot_id, ts.section_id, sec.section_name, sec.department_id, sem.semester_number,
           ts.day_of_week, ts.period_index, ts.start_time, ts.end_time,
           sub.subject_code, sub.subject_name, sub.course_type,
           st.full_name as faculty_name, st.designation as faculty_designation,
           r.room_number, r.room_id, ts.is_laboratory,
           l.name as lab_name, l.lab_id
    FROM timetable_slots ts
    JOIN subjects sub ON ts.subject_id = sub.subject_id
    JOIN sections sec ON ts.section_id = sec.section_id
    JOIN semesters sem ON sec.semester_id = sem.semester_id
    JOIN staff st ON ts.faculty_id = st.staff_id
    JOIN rooms r ON ts.room_id = r.room_id
    LEFT JOIN laboratories l ON ts.lab_id = l.lab_id
    JOIN timetable_versions tv ON ts.version_id = tv.version_id
    WHERE ts.day_of_week = $1
      AND ts.period_index = $2
      AND tv.status = 'PUBLISHED'
  `;
  const params = [day, pIndex];
  if (departmentId && departmentId !== 'ALL') {
    params.push(departmentId);
    query += ` AND sec.department_id = $${params.length}`;
  }
  query += ' ORDER BY sec.department_id, sem.semester_number, sec.section_name';

  const [slots, substs] = await Promise.all([
    db.all(query, params),
    db.all(
      `
        SELECT cs.*, st.full_name as substitute_faculty_name
        FROM class_substitutions cs
        JOIN staff st ON cs.substitute_faculty_id = st.staff_id
        WHERE cs.day_of_week = $1 AND cs.period_index = $2 AND cs.status = 'APPROVED'
      `,
      [day, pIndex]
    )
  ]);

  const substMap = {};
  substs.forEach((s) => {
    substMap[s.slot_id] = s;
  });

  const resultList = slots.map((s) => {
    const sub = substMap[s.slot_id];
    return {
      section_id: s.section_id,
      cohort_label: `${s.department_id} Sem ${s.semester_number} Sec ${s.section_name}`,
      department_id: s.department_id,
      semester_number: s.semester_number,
      section_name: s.section_name,
      period_index: s.period_index,
      time_range: `${s.start_time} - ${s.end_time}`,
      subject_code: s.subject_code,
      subject_name: s.subject_name,
      course_type: s.course_type,
      location: s.is_laboratory && s.lab_name ? `${s.lab_name} (${s.room_number})` : `Room ${s.room_number}`,
      room_number: s.room_number,
      is_laboratory: s.is_laboratory,
      faculty_name: sub ? sub.substitute_faculty_name : s.faculty_name,
      original_faculty_name: s.faculty_name,
      is_substituted: !!sub,
      substitution_reason: sub ? sub.reason : null
    };
  });

  return {
    dayOfWeek: day,
    periodIndex: pIndex,
    count: resultList.length,
    classes: resultList
  };
}

async function getFacilityBookings(facilityId = null) {
  let query = "SELECT * FROM facility_bookings WHERE status = 'CONFIRMED'";
  const params = [];
  if (facilityId && facilityId !== 'ALL') {
    query += ' AND (facility_id = $1 OR facility_name = $2)';
    params.push(facilityId, facilityId);
  }
  query += ' ORDER BY booking_date DESC, period_index ASC';
  return db.all(query, params);
}

async function cancelFacilityBooking(bookingId, currentUser, ipAddress = '127.0.0.1') {
  if (!currentUser) throw new Error('Authentication required.');

  const booking = await db.get('SELECT * FROM facility_bookings WHERE booking_id = $1', [bookingId]);
  if (!booking) throw new Error('Booking not found.');

  const isDean = currentUser.role === 'SUPER_ADMIN';
  const isHOD = currentUser.role === 'DEPT_ADMIN';
  const isOwner = currentUser.userId === booking.booked_by_user_id;

  if (!isDean && !isHOD && !isOwner) {
    throw new Error('Access denied: You can only cancel events you booked, or must be an administrator.');
  }

  await db.transaction(async (tx) => {
    await tx.run("UPDATE facility_bookings SET status = 'CANCELLED' WHERE booking_id = $1", [bookingId]);
    await tx.run("UPDATE lab_bookings SET status = 'CANCELLED' WHERE booking_id = $1", [bookingId]);
    await tx.run(
      `
        INSERT INTO audit_logs (log_id, admin_id, admin_name, action, entity_name, entity_id, old_value, new_value, ip_address)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        `AUD-${crypto.randomUUID().substring(0, 8).toUpperCase()}`,
        currentUser.userId,
        currentUser.fullName,
        'CANCEL_FACILITY_BOOKING',
        'FACILITY_BOOKING',
        bookingId,
        JSON.stringify(booking),
        JSON.stringify({ status: 'CANCELLED' }),
        ipAddress
      ]
    );
  });

  return { success: true, bookingId, message: `Reservation for "${booking.title}" has been cancelled.` };
}

async function getClassAdjustmentRecommendations(filters = {}) {
  const {
    dayOfWeek = 'MONDAY',
    periodIndex = 1,
    departmentId = 'CSE',
    excludeFacultyId = null
  } = filters;

  const day = (dayOfWeek || 'MONDAY').toUpperCase();
  const pIndex = parseInt(periodIndex, 10) || 1;

  const [freeFacultyResult, occupiedRoomRows, occupiedLabRows] = await Promise.all([
    getFreeFacultyForPeriod(day, pIndex, excludeFacultyId, departmentId),
    db.all(
      `
        SELECT DISTINCT ts.room_id
        FROM timetable_slots ts
        JOIN timetable_versions tv ON ts.version_id = tv.version_id
        WHERE ts.day_of_week = $1 AND ts.period_index = $2 AND tv.status = 'PUBLISHED'
      `,
      [day, pIndex]
    ),
    db.all(
      `
        SELECT DISTINCT ts.lab_id
        FROM timetable_slots ts
        JOIN timetable_versions tv ON ts.version_id = tv.version_id
        WHERE ts.day_of_week = $1 AND ts.period_index = $2 AND ts.is_laboratory = 1 AND ts.lab_id IS NOT NULL AND tv.status = 'PUBLISHED'
      `,
      [day, pIndex]
    )
  ]);

  const occupiedRooms = occupiedRoomRows.map((r) => r.room_id);
  const occupiedLabs = occupiedLabRows.map((l) => l.lab_id);

  let roomQuery = "SELECT * FROM rooms WHERE room_type = 'CLASSROOM'";
  if (occupiedRooms.length > 0) {
    roomQuery += ` AND room_id NOT IN (${buildPlaceholders(occupiedRooms.length)})`;
  }
  roomQuery += ' ORDER BY capacity DESC';

  let labQuery = `
    SELECT l.*, r.room_number, s.full_name as incharge_name
    FROM laboratories l
    JOIN rooms r ON l.room_id = r.room_id
    LEFT JOIN staff s ON l.staff_incharge_id = s.staff_id
    WHERE 1=1
  `;
  if (occupiedLabs.length > 0) {
    labQuery += ` AND l.lab_id NOT IN (${buildPlaceholders(occupiedLabs.length)})`;
  }
  labQuery += ' ORDER BY l.name ASC';

  const [vacantClassrooms, vacantLaboratories] = await Promise.all([
    db.all(roomQuery, occupiedRooms),
    db.all(labQuery, occupiedLabs)
  ]);

  return {
    dayOfWeek: day,
    periodIndex: pIndex,
    departmentId,
    availableFacultyCount: freeFacultyResult.availableFacultyCount,
    availableFaculty: freeFacultyResult.availableFaculty,
    vacantClassroomsCount: vacantClassrooms.length,
    vacantClassrooms,
    vacantLaboratoriesCount: vacantLaboratories.length,
    vacantLaboratories
  };
}

module.exports = {
  getFacilityAvailability,
  getFacilityWeeklySchedule,
  getFreeFacultyForPeriod,
  getClassAdjustmentRecommendations,
  createFacility,
  updateFacility,
  deleteFacility,
  getRoleSpecificDashboard,
  planFacilityEvent,
  getLiveClassesByCohort,
  getFacilityBookings,
  cancelFacilityBooking
};
