const crypto = require('crypto');
const { db } = require('../config/database');

async function getLaboratoriesByDepartment(deptId = null, schoolId = null) {
  let query = `
    SELECT 
      l.lab_id,
      l.department_id,
      d.name as department_name,
      l.name,
      l.room_id,
      r.room_number,
      l.capacity,
      l.equipment_details,
      l.staff_incharge_id as incharge_id,
      st.full_name as incharge_name,
      st.designation as incharge_designation,
      st.official_email as incharge_email,
      l.assistant_incharge_id,
      ast.full_name as assistant_incharge_name,
      ast.designation as assistant_incharge_designation
    FROM laboratories l
    JOIN departments d ON l.department_id = d.department_id
    JOIN rooms r ON l.room_id = r.room_id
    LEFT JOIN staff st ON l.staff_incharge_id = st.staff_id
    LEFT JOIN staff ast ON l.assistant_incharge_id = ast.staff_id
  `;

  const where = [];
  const params = [];
  if (deptId && deptId.toUpperCase() !== 'ALL') {
    params.push(deptId.toUpperCase());
    where.push(`l.department_id = $${params.length}`);
  }
  if (schoolId && schoolId.toUpperCase() !== 'ALL') {
    params.push(schoolId.toUpperCase());
    where.push(`d.school_id = $${params.length}`);
  }
  if (where.length > 0) {
    query += ' WHERE ' + where.join(' AND ');
  }
  query += ' ORDER BY d.department_id ASC, l.name ASC';

  const labs = await db.all(query, params);

  let slotAgg = [];
  try {
    slotAgg = await db.all(`
      SELECT ts.lab_id,
             COUNT(DISTINCT ts.faculty_id)::int as faculty_count,
             COUNT(DISTINCT ts.section_id)::int as section_count,
             STRING_AGG(DISTINCT st.full_name, ',') as faculty_names,
             STRING_AGG(DISTINCT ts.section_id, ',') as section_ids
      FROM timetable_slots ts
      JOIN staff st ON ts.faculty_id = st.staff_id
      JOIN timetable_versions tv ON ts.version_id = tv.version_id
      WHERE ts.is_laboratory = 1 AND tv.status = 'PUBLISHED' AND ts.lab_id IS NOT NULL
      GROUP BY ts.lab_id
    `);
  } catch (e) {
    slotAgg = [];
  }

  const slotMap = {};
  slotAgg.forEach((s) => {
    slotMap[s.lab_id] = s;
  });

  return labs.map((lab) => {
    const meta = slotMap[lab.lab_id] || {};
    const facultyList = meta.faculty_names ? meta.faculty_names.split(',').map((s) => s.trim()) : [];
    const sectionList = meta.section_ids ? meta.section_ids.split(',').map((s) => s.trim()) : [];
    const concurrentBatches = Math.max(1, Math.floor((lab.capacity || 70) / 35));

    return {
      ...lab,
      shared_faculty_count: facultyList.length,
      shared_faculty_names: facultyList,
      shared_sections_count: sectionList.length,
      shared_section_ids: sectionList,
      concurrent_batches_supported: concurrentBatches,
      batch_sharing_label: `Capacity: ${lab.capacity} Desks &bull; Up to ${concurrentBatches} Parallel Batches`
    };
  });
}

async function getLaboratoryDetails(labId) {
  const query = `
    SELECT 
      l.lab_id,
      l.department_id,
      d.name as department_name,
      l.name,
      l.room_id,
      r.room_number,
      l.capacity,
      l.equipment_details,
      st.staff_id as incharge_id,
      st.full_name as incharge_name,
      st.designation as incharge_designation,
      st.official_email as incharge_email,
      st.photo_url as incharge_photo
    FROM laboratories l
    JOIN departments d ON l.department_id = d.department_id
    JOIN rooms r ON l.room_id = r.room_id
    LEFT JOIN staff st ON l.staff_incharge_id = st.staff_id
    WHERE l.lab_id = $1
  `;

  return db.get(query, [labId]);
}

async function getLaboratorySchedule(labId) {
  const lab = await getLaboratoryDetails(labId);
  if (!lab) {
    return null;
  }

  const query = `
    SELECT 
      s.slot_id,
      s.day_of_week,
      s.start_time,
      s.end_time,
      s.period_index,
      sub.subject_code,
      sub.subject_name,
      st.full_name as faculty_incharge_name,
      st.designation as faculty_designation,
      sec.section_name,
      sec.department_id as section_dept,
      sem.semester_number,
      ay.year_label,
      r.room_number
    FROM timetable_slots s
    JOIN subjects sub ON s.subject_id = sub.subject_id
    JOIN staff st ON s.faculty_id = st.staff_id
    JOIN sections sec ON s.section_id = sec.section_id
    JOIN semesters sem ON sec.semester_id = sem.semester_id
    JOIN academic_years ay ON sem.year_id = ay.year_id
    JOIN rooms r ON s.room_id = r.room_id
    WHERE s.lab_id = $1
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

  const slots = await db.all(query, [labId]);

  const dayGroups = {};
  slots.forEach((s) => {
    if (!dayGroups[s.day_of_week]) dayGroups[s.day_of_week] = [];
    dayGroups[s.day_of_week].push(s);
  });

  Object.values(dayGroups).forEach((daySlots) => {
    for (let i = 0; i < daySlots.length; i++) {
      const cur = daySlots[i];
      const next = daySlots.find((other) =>
        other.period_index === cur.period_index + 1 &&
        (other.subject_code === cur.subject_code || other.section_name === cur.section_name)
      );
      const prev = daySlots.find((other) =>
        other.period_index === cur.period_index - 1 &&
        (other.subject_code === cur.subject_code || other.section_name === cur.section_name)
      );

      if (next) {
        cur.is_continuous = true;
        cur.is_continuous_start = true;
        cur.continuous_part = 1;
        cur.continuous_total = 2;
        cur.continuous_span = `P${cur.period_index} - P${next.period_index}`;
        cur.continuous_start_time = cur.start_time;
        cur.continuous_end_time = next.end_time;
        cur.continuous_label = `2-Period Continuous Lab (P${cur.period_index} - P${next.period_index})`;
      } else if (prev) {
        cur.is_continuous = true;
        cur.is_continuous_start = false;
        cur.continuous_part = 2;
        cur.continuous_total = 2;
        cur.continuous_span = `P${prev.period_index} - P${cur.period_index}`;
        cur.continuous_start_time = prev.start_time;
        cur.continuous_end_time = cur.end_time;
        cur.continuous_label = '2-Period Continuous Lab (Part 2 of 2)';
      } else {
        cur.is_continuous = false;
      }
    }
  });

  return {
    laboratory: lab,
    slots
  };
}

async function createLaboratory(data, user = {}, ip = '127.0.0.1') {
  const {
    lab_id,
    department_id = 'CSE',
    name,
    room_id,
    room_number,
    staff_incharge_id = null,
    equipment_details = '',
    capacity = 70
  } = data;

  if (!name || !name.trim()) {
    throw new Error('Laboratory name is required.');
  }

  const cap = parseInt(capacity, 10);
  if (isNaN(cap) || cap <= 0) {
    throw new Error('Capacity must be a positive integer.');
  }

  const dept = (department_id || 'CSE').toUpperCase();
  const labId = (lab_id && lab_id.trim())
    ? lab_id.trim().toUpperCase()
    : `LAB_${name.trim().toUpperCase().replace(/[^A-Z0-9]/g, '_').substring(0, 15)}_${crypto.randomUUID().substring(0, 4).toUpperCase()}`;

  const roomId = (room_id && room_id.trim())
    ? room_id.trim()
    : `ROOM-${labId}`;

  const roomNum = (room_number && room_number.trim())
    ? room_number.trim()
    : `${name.trim()} (${dept})`;

  await db.transaction(async (tx) => {
    await tx.run(
      `
        INSERT INTO rooms (room_id, department_id, room_number, room_type, capacity, facilities_description)
        VALUES ($1, $2, $3, 'LABORATORY', $4, $5)
        ON CONFLICT (room_id) DO UPDATE SET
          department_id = EXCLUDED.department_id,
          room_number = EXCLUDED.room_number,
          room_type = 'LABORATORY',
          capacity = EXCLUDED.capacity,
          facilities_description = EXCLUDED.facilities_description
      `,
      [roomId, dept, roomNum, cap, equipment_details || 'High-performance computing laboratory']
    );

    await tx.run(
      `
        INSERT INTO laboratories (lab_id, department_id, name, room_id, staff_incharge_id, equipment_details, capacity)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (lab_id) DO UPDATE SET
          department_id = EXCLUDED.department_id,
          name = EXCLUDED.name,
          room_id = EXCLUDED.room_id,
          staff_incharge_id = EXCLUDED.staff_incharge_id,
          equipment_details = EXCLUDED.equipment_details,
          capacity = EXCLUDED.capacity
      `,
      [labId, dept, name.trim(), roomId, staff_incharge_id || null, equipment_details, cap]
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
        'CREATE_LABORATORY',
        'LABORATORY',
        labId,
        null,
        JSON.stringify({ lab_id: labId, name: name.trim(), capacity: cap, department_id: dept, room_id: roomId }),
        ip
      ]
    );
  });

  return getLaboratoryDetails(labId);
}

async function updateLaboratory(labId, updates, user = {}, ip = '127.0.0.1') {
  const existing = await getLaboratoryDetails(labId);
  if (!existing) {
    throw new Error(`Laboratory '${labId}' was not found.`);
  }

  const name = updates.name !== undefined ? updates.name.trim() : existing.name;
  const dept = updates.department_id !== undefined ? updates.department_id.toUpperCase() : existing.department_id;
  const inchargeId = updates.staff_incharge_id !== undefined ? (updates.staff_incharge_id || null) : existing.incharge_id;
  const equipment = updates.equipment_details !== undefined ? updates.equipment_details : existing.equipment_details;

  let cap = existing.capacity;
  if (updates.capacity !== undefined) {
    const parsedCap = parseInt(updates.capacity, 10);
    if (isNaN(parsedCap) || parsedCap <= 0) {
      throw new Error('Capacity must be a positive integer.');
    }
    cap = parsedCap;
  }

  const roomNumber = updates.room_number !== undefined ? updates.room_number.trim() : existing.room_number;

  await db.transaction(async (tx) => {
    await tx.run(
      `
        UPDATE laboratories
        SET name = $1, department_id = $2, staff_incharge_id = $3, equipment_details = $4, capacity = $5
        WHERE lab_id = $6
      `,
      [name, dept, inchargeId, equipment, cap, labId]
    );

    if (existing.room_id) {
      await tx.run(
        `
          UPDATE rooms
          SET capacity = $1, room_number = $2, facilities_description = $3, department_id = $4
          WHERE room_id = $5
        `,
        [cap, roomNumber, equipment, dept, existing.room_id]
      );
    }

    await tx.run(
      `
        INSERT INTO audit_logs (log_id, admin_id, admin_name, action, entity_name, entity_id, old_value, new_value, ip_address)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        `AUD-${crypto.randomUUID().substring(0, 8).toUpperCase()}`,
        user.userId || 'ADMIN',
        user.fullName || 'Administrator',
        'UPDATE_LABORATORY',
        'LABORATORY',
        labId,
        JSON.stringify({ name: existing.name, capacity: existing.capacity, room_number: existing.room_number }),
        JSON.stringify({ name, capacity: cap, room_number: roomNumber }),
        ip
      ]
    );
  });

  return getLaboratoryDetails(labId);
}

async function deleteLaboratory(labId, user = {}, ip = '127.0.0.1') {
  const existing = await getLaboratoryDetails(labId);
  if (!existing) {
    throw new Error(`Laboratory '${labId}' was not found.`);
  }

  await db.transaction(async (tx) => {
    await tx.run('UPDATE timetable_slots SET lab_id = NULL, is_laboratory = 0 WHERE lab_id = $1', [labId]);
    await tx.run('DELETE FROM lab_bookings WHERE lab_id = $1', [labId]);
    await tx.run('DELETE FROM laboratories WHERE lab_id = $1', [labId]);

    const remainingSlots = await tx.get(
      'SELECT COUNT(*)::int as cnt FROM timetable_slots WHERE room_id = $1',
      [existing.room_id]
    );
    if (remainingSlots.cnt === 0) {
      await tx.run("DELETE FROM rooms WHERE room_id = $1 AND room_type = 'LABORATORY'", [existing.room_id]);
    }

    await tx.run(
      `
        INSERT INTO audit_logs (log_id, admin_id, admin_name, action, entity_name, entity_id, old_value, new_value, ip_address)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        `AUD-${crypto.randomUUID().substring(0, 8).toUpperCase()}`,
        user.userId || 'ADMIN',
        user.fullName || 'Administrator',
        'DELETE_LABORATORY',
        'LABORATORY',
        labId,
        JSON.stringify({ name: existing.name, room_id: existing.room_id }),
        null,
        ip
      ]
    );
  });

  return { success: true, labId, message: `Laboratory '${existing.name}' deleted successfully.` };
}

async function getUserSpecificLaboratories({
  user = null,
  department = null,
  school = null,
  scope = 'AUTO',
  pnr = null,
  email = null,
  role = null,
  sectionId = null,
  inchargeId = null
} = {}) {
  const allDeptLabs = await getLaboratoriesByDepartment(department, school);

  let inchargeStaffList = [];
  try {
    inchargeStaffList = await db.all(`
      SELECT DISTINCT st.staff_id, st.full_name, st.designation, st.official_email,
             (SELECT COUNT(*)::int FROM laboratories l WHERE l.staff_incharge_id = st.staff_id OR l.assistant_incharge_id = st.staff_id) as lab_count
      FROM staff st
      WHERE st.staff_id IN (
        SELECT staff_incharge_id FROM laboratories WHERE staff_incharge_id IS NOT NULL
        UNION
        SELECT assistant_incharge_id FROM laboratories WHERE assistant_incharge_id IS NOT NULL
      )
      ORDER BY st.full_name ASC
    `);
  } catch (e) {
    inchargeStaffList = [];
  }

  if (inchargeId && inchargeId !== 'ALL') {
    const matched = allDeptLabs.filter((l) => l.incharge_id === inchargeId || l.assistant_incharge_id === inchargeId);
    const targetStaff = inchargeStaffList.find((s) => s.staff_id === inchargeId);
    return {
      scope: 'BY_INCHARGE',
      targetStaffId: inchargeId,
      targetStaffName: targetStaff ? targetStaff.full_name : inchargeId,
      relationDescription: `Designated & Co-Assigned facilities for ${targetStaff ? targetStaff.full_name : inchargeId} (${matched.length} Labs)`,
      labs: matched.map((l) => {
        const isPrimary = l.incharge_id === inchargeId;
        return {
          ...l,
          user_relation: isPrimary ? 'DESIGNATED_INCHARGE' : 'CO_INCHARGE',
          user_relation_label: isPrimary
            ? `Primary In-Charge: ${targetStaff ? targetStaff.full_name : 'Staff'}`
            : `Co-Incharge / Assistant: ${targetStaff ? targetStaff.full_name : 'Staff'}`
        };
      }),
      allCount: allDeptLabs.length,
      myCount: matched.length,
      inchargeStaffList
    };
  }

  if (sectionId && (scope === 'BY_COHORT' || (scope === 'MY_LABS' && role === 'STUDENT'))) {
    const cohortLabSlots = await db.all(
      `
        SELECT DISTINCT l.lab_id, sub.subject_code, sub.subject_name
        FROM timetable_slots ts
        JOIN laboratories l ON ts.lab_id = l.lab_id
        JOIN subjects sub ON ts.subject_id = sub.subject_id
        JOIN timetable_versions tv ON ts.version_id = tv.version_id
        WHERE ts.section_id = $1 AND ts.is_laboratory = 1 AND tv.status = 'PUBLISHED'
      `,
      [sectionId]
    );

    const cohortLabIds = new Set(cohortLabSlots.map((s) => s.lab_id));
    const matched = allDeptLabs.filter((l) => cohortLabIds.has(l.lab_id)).map((lab) => {
      const mySubjects = cohortLabSlots.filter((s) => s.lab_id === lab.lab_id);
      return {
        ...lab,
        user_relation: 'STUDENT_COHORT',
        user_relation_label: `Cohort Practical Lab (${mySubjects.map((s) => s.subject_code).join(', ')})`,
        assigned_subjects: mySubjects
      };
    });

    return {
      scope: 'BY_COHORT',
      sectionId,
      relationDescription: `Scheduled practical laboratories for ${sectionId} (${matched.length} Labs)`,
      labs: matched,
      allCount: allDeptLabs.length,
      myCount: matched.length,
      inchargeStaffList
    };
  }

  const userRole = (role || (user && user.role) || 'GUEST').toUpperCase();
  const userPnr = pnr || (user && (user.pnr || user.pnrno || user.userId)) || '';
  const userEmail = (email || (user && user.email) || '').toLowerCase();

  if (scope === 'ALL') {
    return {
      scope: 'ALL',
      relationDescription: `Showing all ${allDeptLabs.length} institutional laboratories`,
      labs: allDeptLabs.map((l) => ({
        ...l,
        user_relation: 'CAMPUS_FACILITY',
        user_relation_label: 'Campus Department Facility'
      })),
      allCount: allDeptLabs.length,
      myCount: allDeptLabs.length,
      inchargeStaffList
    };
  }

  if (userRole === 'NON_TEACHING_STAFF') {
    const staff = await db.get('SELECT * FROM staff WHERE staff_id = $1 OR official_email = $2', [userPnr, userEmail]);
    const staffId = staff ? staff.staff_id : userPnr;
    const staffName = staff ? staff.full_name : (user ? user.fullName : 'Technical Staff');

    const myLabs = allDeptLabs.filter((l) => l.incharge_id === staffId || l.assistant_incharge_id === staffId).map((lab) => {
      const isPrimary = lab.incharge_id === staffId;
      return {
        ...lab,
        user_relation: isPrimary ? 'DESIGNATED_INCHARGE' : 'CO_INCHARGE',
        user_relation_label: isPrimary ? 'Primary Designated In-Charge' : 'Co-Incharge / Assistant Technician'
      };
    });

    return {
      scope: 'MY_LABS',
      userRole,
      staffId,
      staffName,
      relationDescription: myLabs.length > 0
        ? `Showing your designated and shared laboratories (${myLabs.length} assigned to ${staffName})`
        : `No laboratories currently assigned to ${staffName} in department roster`,
      labs: myLabs,
      allCount: allDeptLabs.length,
      myCount: myLabs.length,
      inchargeStaffList
    };
  }

  if (userRole === 'TEACHING_STAFF') {
    const staff = await db.get('SELECT * FROM staff WHERE staff_id = $1 OR official_email = $2', [userPnr, userEmail]);
    const staffId = staff ? staff.staff_id : userPnr;
    const staffName = staff ? staff.full_name : (user ? user.fullName : 'Faculty Member');

    const teachingSlots = await db.all(
      `
        SELECT DISTINCT ts.lab_id, sub.subject_code, sub.subject_name
        FROM timetable_slots ts
        JOIN subjects sub ON ts.subject_id = sub.subject_id
        JOIN timetable_versions tv ON ts.version_id = tv.version_id
        WHERE ts.faculty_id = $1 AND ts.is_laboratory = 1 AND tv.status = 'PUBLISHED'
      `,
      [staffId]
    );

    const teachingLabIds = new Set(teachingSlots.map((s) => s.lab_id));
    const myLabs = allDeptLabs.filter((l) => teachingLabIds.has(l.lab_id) || l.incharge_id === staffId || l.assistant_incharge_id === staffId).map((lab) => {
      const mySubjects = teachingSlots.filter((s) => s.lab_id === lab.lab_id);
      const isIncharge = lab.incharge_id === staffId;
      const isAssistant = lab.assistant_incharge_id === staffId;
      return {
        ...lab,
        user_relation: isIncharge ? 'DESIGNATED_INCHARGE' : (isAssistant ? 'CO_INCHARGE' : 'TEACHING_FACULTY'),
        user_relation_label: isIncharge ? 'Designated In-Charge' : (isAssistant ? 'Co-Incharge / Assistant Technician' : `Your Teaching Lab (${mySubjects.map((s) => s.subject_code).join(', ')})`),
        assigned_subjects: mySubjects
      };
    });

    return {
      scope: 'MY_LABS',
      userRole,
      staffId,
      staffName,
      relationDescription: myLabs.length > 0
        ? `Showing your assigned teaching laboratory sessions (${myLabs.length} Labs)`
        : `No practical lab sessions currently assigned to ${staffName}`,
      labs: myLabs,
      allCount: allDeptLabs.length,
      myCount: myLabs.length,
      inchargeStaffList
    };
  }

  if (userRole === 'STUDENT') {
    let resolvedSection = sectionId;
    if (!resolvedSection) {
      if (userEmail.includes('cse3a') || userEmail.includes('sem3a') || userEmail.includes('24341a0502') || userEmail.includes('student')) {
        resolvedSection = 'CSE-SEM_3-A';
      } else if (userEmail.includes('3b')) resolvedSection = 'CSE-SEM_3-B';
      else if (userEmail.includes('3c')) resolvedSection = 'CSE-SEM_3-C';
      else if (userEmail.includes('3d')) resolvedSection = 'CSE-SEM_3-D';
      else if (userEmail.includes('5a')) resolvedSection = 'CSE-SEM_5-A';
      else if (userEmail.includes('5b')) resolvedSection = 'CSE-SEM_5-B';
      else resolvedSection = 'CSE-SEM_3-A';
    }

    const cohortLabSlots = await db.all(
      `
        SELECT DISTINCT l.lab_id, sub.subject_code, sub.subject_name
        FROM timetable_slots ts
        JOIN laboratories l ON ts.lab_id = l.lab_id
        JOIN subjects sub ON ts.subject_id = sub.subject_id
        JOIN timetable_versions tv ON ts.version_id = tv.version_id
        WHERE ts.section_id = $1 AND ts.is_laboratory = 1 AND tv.status = 'PUBLISHED'
      `,
      [resolvedSection]
    );

    const cohortLabIds = new Set(cohortLabSlots.map((s) => s.lab_id));
    const myLabs = allDeptLabs.filter((l) => cohortLabIds.has(l.lab_id)).map((lab) => {
      const mySubjects = cohortLabSlots.filter((s) => s.lab_id === lab.lab_id);
      return {
        ...lab,
        user_relation: 'STUDENT_COHORT',
        user_relation_label: `Cohort Practical Lab (${mySubjects.map((s) => s.subject_code).join(', ')})`,
        assigned_subjects: mySubjects
      };
    });

    return {
      scope: 'MY_LABS',
      userRole,
      sectionId: resolvedSection,
      relationDescription: `Showing scheduled practical laboratories for your cohort ${resolvedSection} (${myLabs.length} Labs)`,
      labs: myLabs,
      allCount: allDeptLabs.length,
      myCount: myLabs.length,
      inchargeStaffList
    };
  }

  return {
    scope: 'ALL',
    relationDescription: `Showing all ${allDeptLabs.length} institutional laboratories`,
    labs: allDeptLabs.map((l) => ({
      ...l,
      user_relation: 'CAMPUS_FACILITY',
      user_relation_label: 'Campus Department Facility'
    })),
    allCount: allDeptLabs.length,
    myCount: allDeptLabs.length,
    inchargeStaffList
  };
}

module.exports = {
  getLaboratoriesByDepartment,
  getLaboratoryDetails,
  getLaboratorySchedule,
  getUserSpecificLaboratories,
  createLaboratory,
  updateLaboratory,
  deleteLaboratory
};
