const bcrypt = require('bcryptjs');
const { db, initializeSchema } = require('../config/database');

// Clean baseline: no pre-seeded institutional roster beyond the 8 demo accounts.
// Real faculty, non-teaching staff, rooms, laboratories, subjects, timetables,
// notices, and academic events are added directly through the live UI / APIs.
const MASTER_STAFF_ROSTER = [];

async function seedDatabase() {
  await initializeSchema();

  console.log('Synchronizing GMRITDU clean baseline database (taxonomy + demo accounts)...');

  await db.transaction(async (tx) => {
    // 1. Academic Schools (Dean Governance Scope)
    const upsertSchoolSql = `
      INSERT INTO schools (school_id, name, dean_name, dean_email)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT(school_id) DO UPDATE SET
        name = EXCLUDED.name,
        dean_name = EXCLUDED.dean_name,
        dean_email = EXCLUDED.dean_email
    `;

    const schools = [
      { id: 'SOAC', name: 'School of Computing', dean: 'School Dean (Editable)', email: 'dean.soac@gmritdu.edu.in' },
      { id: 'SOAE', name: 'School of Engineering', dean: 'School Dean (Editable)', email: 'dean.soae@gmritdu.edu.in' }
    ];

    for (const s of schools) {
      await tx.run(upsertSchoolSql, [s.id, s.name, s.dean, s.email]);
    }

    // 2. Departments Registry (Customizable Structural Taxonomy)
    const upsertDeptSql = `
      INSERT INTO departments (department_id, school_id, name, description, hod_name, contact_email, contact_phone)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT(department_id) DO UPDATE SET
        school_id = EXCLUDED.school_id,
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        hod_name = EXCLUDED.hod_name,
        contact_email = EXCLUDED.contact_email,
        contact_phone = EXCLUDED.contact_phone
    `;

    const departments = [
      { id: 'CSE', school: 'SOAC', name: 'Computer Science and Engineering', desc: 'Academic curriculum and laboratory operations for Computer Science and Engineering.', hod: 'Department Head (Editable)', email: 'hod.cse@gmritdu.edu.in', phone: '' },
      { id: 'AIML', school: 'SOAC', name: 'Artificial Intelligence and Machine Learning', desc: 'Academic curriculum and laboratory operations for AI and Machine Learning.', hod: 'Department Head (Editable)', email: 'hod.aiml@gmritdu.edu.in', phone: '' },
      { id: 'AIDS', school: 'SOAC', name: 'Artificial Intelligence and Data Science', desc: 'Academic curriculum and laboratory operations for AI and Data Science.', hod: 'Department Head (Editable)', email: 'hod.aids@gmritdu.edu.in', phone: '' },
      { id: 'IT', school: 'SOAC', name: 'Information Technology', desc: 'Academic curriculum and laboratory operations for Information Technology.', hod: 'Department Head (Editable)', email: 'hod.it@gmritdu.edu.in', phone: '' },
      { id: 'CYBER', school: 'SOAC', name: 'Cyber Security', desc: 'Academic curriculum and laboratory operations for Cyber Security.', hod: 'Department Head (Editable)', email: 'hod.cyber@gmritdu.edu.in', phone: '' },
      { id: 'MECH', school: 'SOAE', name: 'Mechanical Engineering', desc: 'Academic curriculum and laboratory operations for Mechanical Engineering.', hod: 'Department Head (Editable)', email: 'hod.mech@gmritdu.edu.in', phone: '' },
      { id: 'CIVIL', school: 'SOAE', name: 'Civil Engineering', desc: 'Academic curriculum and laboratory operations for Civil Engineering.', hod: 'Department Head (Editable)', email: 'hod.civil@gmritdu.edu.in', phone: '' },
      { id: 'ECE', school: 'SOAE', name: 'Electronics and Communication Engineering', desc: 'Academic curriculum and laboratory operations for Electronics and Communication.', hod: 'Department Head (Editable)', email: 'hod.ece@gmritdu.edu.in', phone: '' },
      { id: 'EEE', school: 'SOAE', name: 'Electrical and Electronics Engineering', desc: 'Academic curriculum and laboratory operations for Electrical and Electronics.', hod: 'Department Head (Editable)', email: 'hod.eee@gmritdu.edu.in', phone: '' }
    ];

    for (const dept of departments) {
      await tx.run(upsertDeptSql, [dept.id, dept.school, dept.name, dept.desc, dept.hod, dept.email, dept.phone]);
    }

    // 3. Academic Years & Semesters
    const insertYearSql = 'INSERT INTO academic_years (year_id, year_label) VALUES ($1, $2) ON CONFLICT DO NOTHING';
    await tx.run(insertYearSql, ['YEAR_1', 'First Year']);
    await tx.run(insertYearSql, ['YEAR_2', 'Second Year']);
    await tx.run(insertYearSql, ['YEAR_3', 'Third Year']);
    await tx.run(insertYearSql, ['YEAR_4', 'Fourth Year']);

    const insertSemSql = 'INSERT INTO semesters (semester_id, semester_number, year_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING';
    await tx.run(insertSemSql, ['SEM_1', 1, 'YEAR_1']);
    await tx.run(insertSemSql, ['SEM_2', 2, 'YEAR_1']);
    await tx.run(insertSemSql, ['SEM_3', 3, 'YEAR_2']);
    await tx.run(insertSemSql, ['SEM_4', 4, 'YEAR_2']);
    await tx.run(insertSemSql, ['SEM_5', 5, 'YEAR_3']);
    await tx.run(insertSemSql, ['SEM_6', 6, 'YEAR_3']);
    await tx.run(insertSemSql, ['SEM_7', 7, 'YEAR_4']);
    await tx.run(insertSemSql, ['SEM_8', 8, 'YEAR_4']);

    // 4. Academic Programmes & Sections
    const insertProgSql = 'INSERT INTO academic_programmes (programme_id, department_id, programme_name, duration_years) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING';
    const insertSecSql = `
      INSERT INTO sections (section_id, department_id, semester_id, section_name, student_count, academic_session)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT DO NOTHING
    `;
    const activeSemesters = ['SEM_1', 'SEM_2', 'SEM_3', 'SEM_4', 'SEM_5', 'SEM_6', 'SEM_7', 'SEM_8'];
    const sectionLetters = ['A', 'B', 'C', 'D'];

    for (const dept of departments) {
      await tx.run(insertProgSql, [`BTECH-${dept.id}`, dept.id, `Bachelor of Technology in ${dept.name}`, 4]);
      for (const sem of activeSemesters) {
        for (const sec of sectionLetters) {
          await tx.run(insertSecSql, [`${dept.id}-${sem}-${sec}`, dept.id, sem, sec, 64, '2026-2027']);
        }
      }
    }

    // 5. Published Baseline Timetable Versions (empty schedules ready for real slot entry across all 9 departments)
    const upsertVersionSql = `
      INSERT INTO timetable_versions (version_id, department_id, academic_session, version_number, status, effective_from, created_by, published_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT(version_id) DO NOTHING
    `;

    // 6. Security Hashes & Demo Accounts ONLY (all 8 role personas)
    const salt = bcrypt.genSaltSync(10);
    const adminPasswordHash = bcrypt.hashSync('Admin@GMRIT2026', salt);
    const facultyPasswordHash = bcrypt.hashSync('Faculty@GMRIT2026', salt);
    const studentPasswordHash = bcrypt.hashSync('Bannu@2005', salt);

    // Preserve user-changed passwords on restart; only set password_hash on initial insert.
    const upsertUserSql = `
      INSERT INTO users (user_id, pnrno, email, password_hash, full_name, mobile_number, role, department_id, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT(pnrno) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        department_id = EXCLUDED.department_id,
        status = EXCLUDED.status
    `;

    // 6a. Super Admin, HOD, Timetable Coordinator (role-based baseline accounts; names editable via Users & Roles)
    await tx.run(upsertUserSql, ['USR-ADMIN-01', 'ADMIN001', 'admin@gmrit.edu.in', adminPasswordHash, 'Campus Super Admin', '', 'SUPER_ADMIN', 'CSE', 'ACTIVE']);
    await tx.run(upsertUserSql, ['USR-DEPT-CSE', 'COORD001', 'cse.admin@gmrit.edu.in', adminPasswordHash, 'Department Head (CSE)', '', 'DEPT_ADMIN', 'CSE', 'ACTIVE']);
    await tx.run(upsertUserSql, ['USR-COORD-CSE', 'COORD002', 'timetable.coord@gmrit.edu.in', adminPasswordHash, 'Timetable Coordinator', '', 'COORDINATOR', 'CSE', 'ACTIVE']);

    // 6b. School Deans
    const upsertDeanSchoolSql = `
      INSERT INTO dean_school_assignments (user_id, school_id)
      VALUES ($1, $2)
      ON CONFLICT(user_id) DO UPDATE SET school_id = EXCLUDED.school_id
    `;
    const deans = [
      { id: 'USR-DEAN-SOAC', pnr: 'DEAN001', email: 'dean.soac@gmritdu.edu.in', name: 'School Dean (Computing)', school: 'SOAC', dept: 'CSE' },
      { id: 'USR-DEAN-SOAE', pnr: 'DEAN002', email: 'dean.soae@gmritdu.edu.in', name: 'School Dean (Engineering)', school: 'SOAE', dept: 'ECE' }
    ];
    for (const d of deans) {
      await tx.run(upsertUserSql, [d.id, d.pnr, d.email, adminPasswordHash, d.name, '', 'DEAN', d.dept, 'ACTIVE']);
      await tx.run(upsertDeanSchoolSql, [d.id, d.school]);
    }

    // 6c. Demo Teaching & Non-Teaching Staff Accounts (linked to minimal staff rows so faculty/lab portals work immediately)
    await tx.run(upsertUserSql, ['USR-52171', '52171', 'sravani.m@gmritdu.edu.in', facultyPasswordHash, 'Faculty Instructor', '', 'TEACHING_STAFF', 'CSE', 'ACTIVE']);
    await tx.run(upsertUserSql, ['USR-50008', '50008', 'raghu.m@gmrit.edu.in', facultyPasswordHash, 'Technical Lab Staff', '', 'NON_TEACHING_STAFF', 'CSE', 'ACTIVE']);

    const upsertDemoStaffSql = `
      INSERT INTO staff (staff_id, user_id, department_id, full_name, category, designation, official_email, photo_url, lab_responsibility, display_approved)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT(staff_id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        department_id = EXCLUDED.department_id,
        full_name = EXCLUDED.full_name,
        category = EXCLUDED.category,
        designation = EXCLUDED.designation,
        official_email = EXCLUDED.official_email,
        photo_url = EXCLUDED.photo_url,
        lab_responsibility = EXCLUDED.lab_responsibility,
        display_approved = EXCLUDED.display_approved
    `;

    await tx.run(upsertDemoStaffSql, [
      '52171',
      'USR-52171',
      'CSE',
      'Faculty Instructor',
      'TEACHING',
      'Assistant Professor',
      'sravani.m@gmritdu.edu.in',
      null,
      null,
      1
    ]);

    await tx.run(upsertDemoStaffSql, [
      '50008',
      'USR-50008',
      'CSE',
      'Technical Lab Staff',
      'NON_TEACHING',
      'Technical Assistant',
      'raghu.m@gmrit.edu.in',
      null,
      null,
      1
    ]);

    // 6d. Demo Student Account
    await tx.run(upsertUserSql, [
      'USR-STU-24341A0502',
      '24341A0502',
      '24341a0502@gmrit.edu.in',
      studentPasswordHash,
      'Enrolled Student',
      '',
      'STUDENT',
      'CSE',
      'ACTIVE'
    ]);

    await tx.run(`
      INSERT INTO user_section_assignments (user_id, section_id)
      VALUES ($1, $2)
      ON CONFLICT(user_id) DO UPDATE SET section_id = EXCLUDED.section_id
    `, ['USR-STU-24341A0502', 'CSE-SEM_3-A']);

    // Create empty published timetable versions after USR-ADMIN-01 exists (FK safe)
    for (const dept of departments) {
      await tx.run(upsertVersionSql, [
        `VER-${dept.id}-2026-V1`,
        dept.id,
        '2026-2027',
        1,
        'PUBLISHED',
        '2026-06-15',
        'USR-ADMIN-01',
        '2026-06-10T10:00:00Z'
      ]);
    }
  });

  console.log('Clean institutional baseline synced: 2 schools, 9 departments, 8 demo accounts, 0 sample schedules/notices/events.');
}

if (require.main === module) {
  seedDatabase()
    .then(() => {
      process.exitCode = 0;
    })
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exitCode = 1;
    });
}

module.exports = { seedDatabase, MASTER_STAFF_ROSTER };
