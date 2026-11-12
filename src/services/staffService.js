const { db } = require('../config/database');

async function getStaffByDepartment(deptId, category = 'TEACHING') {
  const query = `
    SELECT 
      s.staff_id,
      s.user_id,
      COALESCE(u.pnrno, REPLACE(s.staff_id, 'staff_', '')) as pnrno,
      s.department_id,
      s.full_name,
      s.category,
      s.designation,
      s.official_email,
      s.photo_url,
      s.lab_responsibility,
      s.display_approved,
      (SELECT COUNT(ts.slot_id)::int FROM timetable_slots ts WHERE ts.faculty_id = s.staff_id) as total_periods_per_week,
      (SELECT COUNT(ts.slot_id)::int FROM timetable_slots ts WHERE ts.faculty_id = s.staff_id AND ts.is_laboratory = 0) as theory_periods,
      (SELECT COUNT(ts.slot_id)::int FROM timetable_slots ts WHERE ts.faculty_id = s.staff_id AND ts.is_laboratory = 1) as lab_periods,
      (SELECT CASE WHEN COUNT(ts.slot_id) > 18 THEN 1 ELSE 0 END FROM timetable_slots ts WHERE ts.faculty_id = s.staff_id) as is_overloaded
    FROM staff s
    LEFT JOIN users u ON s.user_id = u.user_id
    WHERE s.department_id = $1 
      AND s.category = $2
      AND s.display_approved = 1
    ORDER BY LOWER(s.full_name) ASC
  `;

  return db.all(query, [deptId.toUpperCase(), category.toUpperCase()]);
}

async function getAllStaff(category = null, schoolId = null) {
  let query = `
    SELECT 
      s.staff_id,
      s.user_id,
      COALESCE(u.pnrno, REPLACE(s.staff_id, 'staff_', '')) as pnrno,
      s.department_id,
      d.name as department_name,
      s.full_name,
      s.category,
      s.designation,
      s.official_email,
      s.photo_url,
      s.lab_responsibility,
      s.display_approved,
      (SELECT COUNT(ts.slot_id)::int FROM timetable_slots ts WHERE ts.faculty_id = s.staff_id) as total_periods_per_week,
      (SELECT COUNT(ts.slot_id)::int FROM timetable_slots ts WHERE ts.faculty_id = s.staff_id AND ts.is_laboratory = 0) as theory_periods,
      (SELECT COUNT(ts.slot_id)::int FROM timetable_slots ts WHERE ts.faculty_id = s.staff_id AND ts.is_laboratory = 1) as lab_periods,
      (SELECT CASE WHEN COUNT(ts.slot_id) > 18 THEN 1 ELSE 0 END FROM timetable_slots ts WHERE ts.faculty_id = s.staff_id) as is_overloaded
    FROM staff s
    JOIN departments d ON s.department_id = d.department_id
    LEFT JOIN users u ON s.user_id = u.user_id
  `;

  const where = [];
  const params = [];
  if (category) {
    params.push(category.toUpperCase());
    where.push(`s.category = $${params.length}`);
  }
  if (schoolId) {
    params.push(schoolId.toUpperCase());
    where.push(`d.school_id = $${params.length}`);
  }
  if (where.length > 0) {
    query += ' WHERE ' + where.join(' AND ');
  }
  query += ' ORDER BY LOWER(s.full_name) ASC';

  return db.all(query, params);
}

async function resolveStaffRecord(identifier) {
  if (!identifier) return null;

  const byStaffId = await db.get('SELECT * FROM staff WHERE staff_id = $1', [identifier]);
  if (byStaffId) return byStaffId;

  const byPnr = await db.get(
    `
      SELECT s.* FROM staff s
      LEFT JOIN users u ON s.user_id = u.user_id
      WHERE u.pnrno = $1 OR u.user_id = $2 OR s.staff_id = $3
      LIMIT 1
    `,
    [identifier, identifier, `staff_${identifier}`]
  );

  return byPnr || null;
}

async function getFacultyTimetable(staffId) {
  const faculty = await resolveStaffRecord(staffId);
  if (!faculty) {
    return null;
  }

  const resolvedStaffId = faculty.staff_id;

  const query = `
    SELECT 
      s.slot_id,
      s.day_of_week,
      s.start_time,
      s.end_time,
      s.period_index,
      s.is_laboratory,
      sub.subject_code,
      sub.subject_name,
      sub.course_type,
      sec.section_name,
      sec.department_id as section_dept,
      sem.semester_number,
      ay.year_label,
      r.room_number,
      r.room_id,
      l.name as lab_name
    FROM timetable_slots s
    JOIN subjects sub ON s.subject_id = sub.subject_id
    JOIN sections sec ON s.section_id = sec.section_id
    JOIN semesters sem ON sec.semester_id = sem.semester_id
    JOIN academic_years ay ON sem.year_id = ay.year_id
    JOIN rooms r ON s.room_id = r.room_id
    LEFT JOIN laboratories l ON s.lab_id = l.lab_id
    WHERE s.faculty_id = $1
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
  `;

  const slots = await db.all(query, [resolvedStaffId]);

  const slotIds = slots.map((s) => s.slot_id);
  if (slotIds.length > 0) {
    const placeholders = slotIds.map((_, i) => `$${i + 1}`).join(',');
    const leaveSubsts = await db.all(
      `
        SELECT cs.*, st.full_name as substitute_faculty_name
        FROM class_substitutions cs
        JOIN staff st ON cs.substitute_faculty_id = st.staff_id
        WHERE cs.slot_id IN (${placeholders})
          AND cs.status = 'APPROVED'
      `,
      slotIds
    );

    const leaveMap = {};
    leaveSubsts.forEach((l) => {
      leaveMap[l.slot_id] = l;
    });

    slots.forEach((slot) => {
      if (leaveMap[slot.slot_id]) {
        slot.is_on_leave = true;
        slot.substitute_faculty_name = leaveMap[slot.slot_id].substitute_faculty_name;
        slot.substitution_reason = leaveMap[slot.slot_id].reason;
      } else {
        slot.is_on_leave = false;
      }
      slot.is_substitute_duty = false;
    });
  }

  const substituteSlots = await db.all(
    `
      SELECT 
        s.slot_id,
        s.day_of_week,
        s.start_time,
        s.end_time,
        s.period_index,
        s.is_laboratory,
        sub.subject_code,
        sub.subject_name,
        sub.course_type,
        sec.section_name,
        sec.department_id as section_dept,
        sem.semester_number,
        ay.year_label,
        r.room_number,
        r.room_id,
        l.name as lab_name,
        orig_st.full_name as original_faculty_name,
        cs.reason as substitution_reason,
        cs.substitution_id
      FROM class_substitutions cs
      JOIN timetable_slots s ON cs.slot_id = s.slot_id
      JOIN subjects sub ON s.subject_id = sub.subject_id
      JOIN sections sec ON s.section_id = sec.section_id
      JOIN semesters sem ON sec.semester_id = sem.semester_id
      JOIN academic_years ay ON sem.year_id = ay.year_id
      JOIN rooms r ON s.room_id = r.room_id
      LEFT JOIN laboratories l ON s.lab_id = l.lab_id
      JOIN staff orig_st ON cs.original_faculty_id = orig_st.staff_id
      WHERE cs.substitute_faculty_id = $1
        AND cs.status = 'APPROVED'
    `,
    [resolvedStaffId]
  );

  substituteSlots.forEach((ps) => {
    ps.is_substitute_duty = true;
    ps.is_on_leave = false;
    slots.push(ps);
  });

  const dayOrder = { MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6 };
  slots.sort((a, b) => {
    const da = dayOrder[a.day_of_week] || 7;
    const dbOrder = dayOrder[b.day_of_week] || 7;
    if (da !== dbOrder) return da - dbOrder;
    return a.period_index - b.period_index;
  });

  return {
    faculty,
    slots
  };
}

module.exports = {
  getStaffByDepartment,
  getAllStaff,
  getFacultyTimetable
};
