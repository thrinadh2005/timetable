const { db } = require('../config/database');

/**
 * Validates a candidate timetable slot against existing database slots
 * to enforce hard constraints (Faculty collision, Room collision, Section collision, Lab collision).
 */
async function validateSlotConflict(slotParams, excludeSlotId = null) {
  const { version_id, section_id, day_of_week, period_index, faculty_id, room_id, lab_id } = slotParams;
  const conflicts = [];

  const excludeClause = excludeSlotId ? 'AND s.slot_id != $5' : '';
  const excludeParams = excludeSlotId ? [excludeSlotId] : [];

  const facultyConflictQuery = `
    SELECT s.slot_id, s.section_id, s.day_of_week, s.period_index, s.room_id, 
           sub.subject_code, sub.subject_name, st.full_name as faculty_name,
           sec.section_name, sec.department_id
    FROM timetable_slots s
    JOIN subjects sub ON s.subject_id = sub.subject_id
    JOIN staff st ON s.faculty_id = st.staff_id
    JOIN sections sec ON s.section_id = sec.section_id
    WHERE s.version_id = $1
      AND s.faculty_id = $2
      AND s.day_of_week = $3
      AND s.period_index = $4
      ${excludeClause}
  `;

  const facultyRow = await db.get(facultyConflictQuery, [version_id, faculty_id, day_of_week, period_index, ...excludeParams]);
  if (facultyRow) {
    conflicts.push({
      type: 'FACULTY_COLLISION',
      message: `Faculty collision detected: ${facultyRow.faculty_name} is already assigned to ${facultyRow.department_id} Section ${facultyRow.section_name} (${facultyRow.subject_code} - ${facultyRow.subject_name}) on ${day_of_week} Period ${period_index}.`,
      details: facultyRow
    });
  }

  const roomConflictQuery = `
    SELECT s.slot_id, s.section_id, s.day_of_week, s.period_index, s.room_id,
           sub.subject_code, sub.subject_name, r.room_number,
           sec.section_name, sec.department_id
    FROM timetable_slots s
    JOIN subjects sub ON s.subject_id = sub.subject_id
    JOIN rooms r ON s.room_id = r.room_id
    JOIN sections sec ON s.section_id = sec.section_id
    WHERE s.version_id = $1
      AND s.room_id = $2
      AND s.day_of_week = $3
      AND s.period_index = $4
      ${excludeClause}
  `;

  const roomRow = await db.get(roomConflictQuery, [version_id, room_id, day_of_week, period_index, ...excludeParams]);
  if (roomRow) {
    conflicts.push({
      type: 'ROOM_COLLISION',
      message: `Room collision detected: Room ${roomRow.room_number} is already occupied by ${roomRow.department_id} Section ${roomRow.section_name} (${roomRow.subject_code}) on ${day_of_week} Period ${period_index}.`,
      details: roomRow
    });
  }

  const sectionConflictQuery = `
    SELECT s.slot_id, s.section_id, s.day_of_week, s.period_index,
           sub.subject_code, sub.subject_name, st.full_name as faculty_name
    FROM timetable_slots s
    JOIN subjects sub ON s.subject_id = sub.subject_id
    JOIN staff st ON s.faculty_id = st.staff_id
    WHERE s.version_id = $1
      AND s.section_id = $2
      AND s.day_of_week = $3
      AND s.period_index = $4
      ${excludeClause}
  `;

  const sectionRow = await db.get(sectionConflictQuery, [version_id, section_id, day_of_week, period_index, ...excludeParams]);
  if (sectionRow) {
    conflicts.push({
      type: 'SECTION_COLLISION',
      message: `Section collision detected: Section already has scheduled subject ${sectionRow.subject_code} (${sectionRow.subject_name}) with ${sectionRow.faculty_name} on ${day_of_week} Period ${period_index}.`,
      details: sectionRow
    });
  }

  if (lab_id) {
    const labConflictQuery = `
      SELECT s.slot_id, s.section_id, s.day_of_week, s.period_index,
             l.name as lab_name, sub.subject_code, sec.section_name, sec.department_id
      FROM timetable_slots s
      JOIN laboratories l ON s.lab_id = l.lab_id
      JOIN subjects sub ON s.subject_id = sub.subject_id
      JOIN sections sec ON s.section_id = sec.section_id
      WHERE s.version_id = $1
        AND s.lab_id = $2
        AND s.day_of_week = $3
        AND s.period_index = $4
        ${excludeClause}
    `;

    const labRow = await db.get(labConflictQuery, [version_id, lab_id, day_of_week, period_index, ...excludeParams]);
    if (labRow) {
      conflicts.push({
        type: 'LABORATORY_DOUBLE_BOOKING',
        message: `Laboratory double-booking detected: ${labRow.lab_name} is already assigned to ${labRow.department_id} Section ${labRow.section_name} (${labRow.subject_code}) on ${day_of_week} Period ${period_index}.`,
        details: labRow
      });
    }
  }

  return {
    hasConflict: conflicts.length > 0,
    conflicts
  };
}

module.exports = {
  validateSlotConflict
};
