const { db } = require('../config/database');

async function getSchools() {
  const query = `
    SELECT 
      s.school_id,
      s.name,
      s.dean_name,
      s.dean_email,
      (SELECT COUNT(*)::int FROM departments WHERE school_id = s.school_id) AS department_count,
      (SELECT COUNT(*)::int FROM staff st JOIN departments d ON st.department_id = d.department_id WHERE d.school_id = s.school_id AND st.category = 'TEACHING') AS faculty_count,
      (SELECT COUNT(*)::int FROM laboratories l JOIN departments d ON l.department_id = d.department_id WHERE d.school_id = s.school_id) AS lab_count
    FROM schools s
    ORDER BY s.school_id ASC
  `;
  return db.all(query);
}

async function getAllDepartments(schoolId = null) {
  let query = `
    SELECT 
      d.department_id,
      d.school_id,
      s.name AS school_name,
      s.dean_name,
      d.name,
      d.description,
      d.hod_name,
      d.contact_email,
      d.contact_phone,
      (SELECT COUNT(*)::int FROM staff WHERE department_id = d.department_id AND category = 'TEACHING' AND display_approved = 1) AS faculty_count,
      (SELECT COUNT(*)::int FROM staff WHERE department_id = d.department_id AND category = 'NON_TEACHING' AND display_approved = 1) AS non_teaching_count,
      (SELECT COALESCE(SUM(student_count), 0)::int FROM sections WHERE department_id = d.department_id) AS student_count,
      (SELECT COUNT(*)::int FROM sections WHERE department_id = d.department_id) AS sections_count,
      (SELECT COUNT(*)::int FROM laboratories WHERE department_id = d.department_id) AS laboratories_count
    FROM departments d
    LEFT JOIN schools s ON d.school_id = s.school_id
  `;

  const params = [];
  if (schoolId) {
    // Executive Dean scope: only the departments governed by their school.
    query += ' WHERE d.school_id = $1';
    params.push(schoolId.toUpperCase());
  }
  query += ' ORDER BY d.department_id ASC';

  return db.all(query, params);
}

async function getSchoolDepartments(schoolId) {
  if (!schoolId) return [];
  const rows = await db.all(
    'SELECT department_id FROM departments WHERE school_id = $1 ORDER BY department_id ASC',
    [schoolId]
  );
  return rows.map((row) => row.department_id);
}

/**
 * Resolves the school-wide governance scope for an executive Dean.
 * Returns { schoolId, departmentIds } or null when the user is not a Dean.
 */
async function getDeanSchoolScope(userId) {
  if (!userId) return null;
  const assignment = await db.get(
    'SELECT school_id FROM dean_school_assignments WHERE user_id = $1',
    [userId]
  );
  if (!assignment) return null;
  return {
    schoolId: assignment.school_id,
    departmentIds: await getSchoolDepartments(assignment.school_id)
  };
}

async function getDepartmentById(deptId) {
  const idUpper = deptId.toUpperCase();
  const query = `
    SELECT 
      d.department_id,
      d.school_id,
      s.name AS school_name,
      s.dean_name,
      d.name,
      d.description,
      d.hod_name,
      d.contact_email,
      d.contact_phone,
      (SELECT COUNT(*)::int FROM staff WHERE department_id = d.department_id AND category = 'TEACHING' AND display_approved = 1) AS faculty_count,
      (SELECT COUNT(*)::int FROM staff WHERE department_id = d.department_id AND category = 'NON_TEACHING' AND display_approved = 1) AS non_teaching_count,
      (SELECT COALESCE(SUM(student_count), 0)::int FROM sections WHERE department_id = d.department_id) AS student_count,
      (SELECT COUNT(*)::int FROM sections WHERE department_id = d.department_id) AS sections_count,
      (SELECT COUNT(*)::int FROM laboratories WHERE department_id = d.department_id) AS laboratories_count
    FROM departments d
    LEFT JOIN schools s ON d.school_id = s.school_id
    WHERE d.department_id = $1
  `;

  const dept = await db.get(query, [idUpper]);
  if (!dept) {
    return null;
  }

  const sectionsQuery = `
    SELECT s.section_id, s.section_name, s.student_count, sem.semester_number, ay.year_label
    FROM sections s
    JOIN semesters sem ON s.semester_id = sem.semester_id
    JOIN academic_years ay ON sem.year_id = ay.year_id
    WHERE s.department_id = $1
    ORDER BY sem.semester_number ASC, s.section_name ASC
  `;
  dept.sections = await db.all(sectionsQuery, [idUpper]);

  const labsQuery = `
    SELECT l.lab_id, l.name, l.room_id, l.capacity, st.full_name AS incharge_name
    FROM laboratories l
    LEFT JOIN staff st ON l.staff_incharge_id = st.staff_id
    WHERE l.department_id = $1
    ORDER BY l.name ASC
  `;
  dept.laboratories = await db.all(labsQuery, [idUpper]);

  return dept;
}

async function createSchool({ schoolId, name, deanName = '', deanEmail = '' }) {
  const cleanId = String(schoolId || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '_');
  const cleanName = String(name || '').trim();
  if (!cleanId || !cleanName) {
    const err = new Error('school_id and name are required');
    err.status = 400;
    throw err;
  }

  const existing = await db.query('SELECT school_id FROM schools WHERE school_id = $1', [cleanId]);
  if (existing.rows.length > 0) {
    const err = new Error(`School "${cleanId}" already exists`);
    err.status = 409;
    throw err;
  }

  const res = await db.query(
    `INSERT INTO schools (school_id, name, dean_name, dean_email)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [cleanId, cleanName, String(deanName || 'School Dean').trim(), String(deanEmail || '').trim()]
  );
  return res.rows[0];
}

async function updateSchool(schoolId, updates = {}) {
  const cleanId = String(schoolId || '').trim();
  const existing = await db.query('SELECT * FROM schools WHERE school_id = $1', [cleanId]);
  if (existing.rows.length === 0) {
    const err = new Error('School not found');
    err.status = 404;
    throw err;
  }
  const cur = existing.rows[0];
  const nextName = updates.name !== undefined ? String(updates.name).trim() : cur.name;
  const nextDeanName = updates.deanName !== undefined || updates.dean_name !== undefined
    ? String(updates.deanName ?? updates.dean_name ?? '').trim()
    : cur.dean_name;
  const nextDeanEmail = updates.deanEmail !== undefined || updates.dean_email !== undefined
    ? String(updates.deanEmail ?? updates.dean_email ?? '').trim()
    : cur.dean_email;

  if (!nextName) {
    const err = new Error('School name cannot be empty');
    err.status = 400;
    throw err;
  }

  const res = await db.query(
    `UPDATE schools
     SET name = $1, dean_name = $2, dean_email = $3
     WHERE school_id = $4
     RETURNING *`,
    [nextName, nextDeanName, nextDeanEmail, cleanId]
  );
  return res.rows[0];
}

async function deleteSchool(schoolId) {
  const cleanId = String(schoolId || '').trim();
  const existing = await db.query('SELECT * FROM schools WHERE school_id = $1', [cleanId]);
  if (existing.rows.length === 0) {
    const err = new Error('School not found');
    err.status = 404;
    throw err;
  }
  const deps = await db.query('SELECT COUNT(*)::int AS cnt FROM departments WHERE school_id = $1', [cleanId]);
  if (Number(deps.rows[0]?.cnt || 0) > 0) {
    const err = new Error('Reassign or remove linked departments before deleting this school');
    err.status = 409;
    throw err;
  }
  await db.query('DELETE FROM schools WHERE school_id = $1', [cleanId]);
  return { deleted: true, school_id: cleanId };
}

async function createDepartment({
  departmentId,
  schoolId = null,
  name,
  description = '',
  hodName = '',
  contactEmail = '',
  contactPhone = ''
}) {
  const cleanId = String(departmentId || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '_');
  const cleanName = String(name || '').trim();
  if (!cleanId || !cleanName) {
    const err = new Error('department_id and name are required');
    err.status = 400;
    throw err;
  }

  const existing = await db.query('SELECT department_id FROM departments WHERE department_id = $1', [cleanId]);
  if (existing.rows.length > 0) {
    const err = new Error(`Department "${cleanId}" already exists`);
    err.status = 409;
    throw err;
  }

  const cleanSchoolId = schoolId ? String(schoolId).trim() : null;
  if (cleanSchoolId) {
    const sc = await db.query('SELECT school_id FROM schools WHERE school_id = $1', [cleanSchoolId]);
    if (sc.rows.length === 0) {
      const err = new Error(`School "${cleanSchoolId}" not found`);
      err.status = 404;
      throw err;
    }
  }

  const inserted = await db.query(
    `INSERT INTO departments (department_id, school_id, name, description, hod_name, contact_email, contact_phone)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      cleanId,
      cleanSchoolId,
      cleanName,
      String(description || '').trim(),
      String(hodName || 'Department Head').trim(),
      String(contactEmail || '').trim(),
      String(contactPhone || '').trim()
    ]
  );

  // Initialize academic programme, timetable version, and default semester sections
  await db.query(
    `INSERT INTO academic_programmes (programme_id, department_id, programme_name, duration_years)
     VALUES ($1, $2, $3, 4)
     ON CONFLICT (programme_id) DO NOTHING`,
    [`BTECH-${cleanId}`, cleanId, `B.Tech ${cleanName}`]
  );

  await db.query(
    `INSERT INTO timetable_versions (version_id, department_id, academic_session, version_number, status, effective_from, created_by)
     VALUES ($1, $2, '2026-27', 1, 'PUBLISHED', '2026-07-01', 'SYSTEM')
     ON CONFLICT (version_id) DO NOTHING`,
    [`VER-${cleanId}-2026-V1`, cleanId]
  );

  const semRes = await db.query('SELECT semester_id FROM semesters');
  for (const sem of semRes.rows) {
    for (const secLetter of ['A', 'B', 'C', 'D']) {
      await db.query(
        `INSERT INTO sections (section_id, department_id, semester_id, section_name, student_count, academic_session)
         VALUES ($1, $2, $3, $4, 60, '2026-27')
         ON CONFLICT (section_id) DO NOTHING`,
        [`${cleanId}-${sem.semester_id}-${secLetter}`, cleanId, sem.semester_id, secLetter]
      );
    }
  }

  return getDepartmentById(cleanId);
}

async function updateDepartment(departmentId, updates = {}) {
  const cleanId = String(departmentId || '').trim().toUpperCase();
  const existing = await db.query('SELECT * FROM departments WHERE department_id = $1', [cleanId]);
  if (existing.rows.length === 0) {
    const err = new Error('Department not found');
    err.status = 404;
    throw err;
  }
  const cur = existing.rows[0];

  const nextSchoolId = updates.schoolId !== undefined || updates.school_id !== undefined
    ? (String(updates.schoolId ?? updates.school_id ?? '').trim() || null)
    : cur.school_id;
  if (nextSchoolId) {
    const sc = await db.query('SELECT school_id FROM schools WHERE school_id = $1', [nextSchoolId]);
    if (sc.rows.length === 0) {
      const err = new Error(`School "${nextSchoolId}" not found`);
      err.status = 404;
      throw err;
    }
  }

  const nextName = updates.name !== undefined ? String(updates.name).trim() : cur.name;
  const nextDesc = updates.description !== undefined ? String(updates.description || '').trim() : cur.description;
  const nextHod = updates.hodName !== undefined || updates.hod_name !== undefined
    ? String(updates.hodName ?? updates.hod_name ?? '').trim()
    : cur.hod_name;
  const nextEmail = updates.contactEmail !== undefined || updates.contact_email !== undefined
    ? String(updates.contactEmail ?? updates.contact_email ?? '').trim()
    : cur.contact_email;
  const nextPhone = updates.contactPhone !== undefined || updates.contact_phone !== undefined
    ? String(updates.contactPhone ?? updates.contact_phone ?? '').trim()
    : cur.contact_phone;

  if (!nextName) {
    const err = new Error('Department name cannot be empty');
    err.status = 400;
    throw err;
  }

  await db.query(
    `UPDATE departments
     SET school_id = $1, name = $2, description = $3, hod_name = $4, contact_email = $5, contact_phone = $6
     WHERE department_id = $7`,
    [nextSchoolId, nextName, nextDesc, nextHod, nextEmail, nextPhone, cleanId]
  );
  return getDepartmentById(cleanId);
}

async function deleteDepartment(departmentId) {
  const cleanId = String(departmentId || '').trim().toUpperCase();
  const existing = await db.query('SELECT * FROM departments WHERE department_id = $1', [cleanId]);
  if (existing.rows.length === 0) {
    const err = new Error('Department not found');
    err.status = 404;
    throw err;
  }

  // Check active dependent records that should not be orphaned silently
  const checks = await Promise.all([
    db.query('SELECT COUNT(*)::int AS cnt FROM staff WHERE department_id = $1', [cleanId]),
    db.query('SELECT COUNT(*)::int AS cnt FROM subjects WHERE department_id = $1', [cleanId]),
    db.query('SELECT COUNT(*)::int AS cnt FROM laboratories WHERE department_id = $1', [cleanId]),
    db.query('SELECT COUNT(*)::int AS cnt FROM users WHERE department_id = $1', [cleanId]),
  ]);
  const blockers = checks.reduce((sum, r) => sum + Number(r.rows[0]?.cnt || 0), 0);
  if (blockers > 0) {
    const err = new Error('Remove or reassign linked users, staff, subjects, and laboratories before deleting this department');
    err.status = 409;
    throw err;
  }

  // Remove auto-scaffolded sections, versions, and programmes first
  await db.query('DELETE FROM timetable_versions WHERE department_id = $1', [cleanId]);
  await db.query('DELETE FROM sections WHERE department_id = $1', [cleanId]);
  await db.query('DELETE FROM academic_programmes WHERE department_id = $1', [cleanId]);
  await db.query('DELETE FROM departments WHERE department_id = $1', [cleanId]);
  return { deleted: true, department_id: cleanId };
}

module.exports = {
  getAllDepartments,
  getDepartmentById,
  getSchools,
  getSchoolDepartments,
  getDeanSchoolScope,
  createSchool,
  updateSchool,
  deleteSchool,
  createDepartment,
  updateDepartment,
  deleteDepartment
};
