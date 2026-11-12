const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

function parseCsv(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) return [];

  function parseLine(line) {
    const row = [];
    let inQuotes = false;
    let field = '';
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === ',' && !inQuotes) {
        row.push(field.trim());
        field = '';
      } else {
        field += c;
      }
    }
    row.push(field.trim());
    return row;
  }

  const header = parseLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    if (cols.length === header.length) {
      const obj = {};
      header.forEach((h, idx) => { obj[h] = cols[idx]; });
      rows.push(obj);
    }
  }
  return rows;
}

function mapSemester(semStr) {
  const s = String(semStr || '').toLowerCase();
  if (s.includes('first semester') || s.includes('semester i') || s.includes('semester 1') || s.includes('sem 1') || s.includes('sem-1') || s.includes('1st sem')) return 'SEM_1';
  if (s.includes('second semester') || s.includes('semester 2') || s.includes('sem 2') || s.includes('sem-2') || s.includes('2nd sem')) return 'SEM_2';
  if (s.includes('third semester') || s.includes('semester 3') || s.includes('sem 3') || s.includes('sem-3') || s.includes('3rd sem')) return 'SEM_3';
  if (s.includes('fourth semester') || s.includes('semester 4') || s.includes('sem 4') || s.includes('sem-4') || s.includes('4th sem')) return 'SEM_4';
  if (s.includes('fifth semester') || s.includes('semester 5') || s.includes('sem 5') || s.includes('sem-5') || s.includes('5th sem')) return 'SEM_5';
  if (s.includes('sixth semester') || s.includes('semester 6') || s.includes('sem 6') || s.includes('sem-6') || s.includes('6th sem')) return 'SEM_6';
  if (s.includes('seventh semester') || s.includes('semester 7') || s.includes('sem 7') || s.includes('sem-7') || s.includes('7th sem')) return 'SEM_7';
  if (s.includes('eighth semester') || s.includes('semester 8') || s.includes('sem 8') || s.includes('sem-8') || s.includes('8th sem')) return 'SEM_8';
  return 'SEM_1';
}

function mapCourseType(typeStr) {
  const t = String(typeStr || '').toLowerCase();
  if (t.includes('lab')) return 'LABORATORY';
  if (t.includes('integrated')) return 'INTEGRATED';
  if (t.includes('project') || t.includes('internship')) return 'PROJECT';
  if (t.includes('seminar')) return 'SEMINAR';
  return 'THEORY';
}

function parseDottedDate(dStr) {
  if (!dStr) return null;
  const m = String(dStr).trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function mapDepartment(deptStr) {
  if (!deptStr) return 'CSE';
  const d = String(deptStr).trim().toUpperCase();
  if (d.includes('CIVIL') || d === 'CE') return 'CIVIL';
  if (d.includes('MECH') || d.includes('MECHANICAL')) return 'MECH';
  if (d.includes('ECE')) return 'ECE';
  if (d.includes('EEE')) return 'EEE';
  if (d.includes('AIDS') || d.includes('AI&DS') || d.includes('AI & DS')) return 'AIDS';
  if (d.includes('AIML') || d.includes('AI&ML') || d.includes('AI & ML')) return 'AIML';
  if (d.includes('CYBER') || d.includes('CSE-CS')) return 'CYBER';
  if (d.includes('IT') || d.includes('INFORMATION')) return 'IT';
  if (d.includes('CSE') || d.includes('COMPUTER')) return 'CSE';
  if (d.includes('BSH') || d.includes('BS & H') || d.includes('BASIC SCIENCES') || d.includes('COMMERCE') || d.includes('MATHEMATICS') || d.includes('PHYSICS') || d.includes('CHEMISTRY')) return 'BSH';
  return 'CSE';
}

// Optimized multi-row chunked upsert to minimize round trips over remote connections
async function multiRowUpsert(dbRunner, tableName, columns, conflictTarget, updateColumns, rows, chunkSize = 25) {
  if (!rows || rows.length === 0) return;
  const colCount = columns.length;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const valueClauses = [];
    const flatParams = [];

    chunk.forEach((row, rowIdx) => {
      const placeholders = [];
      for (let c = 0; c < colCount; c++) {
        flatParams.push(row[c]);
        placeholders.push(`$${flatParams.length}`);
      }
      valueClauses.push(`(${placeholders.join(', ')})`);
    });

    let updateClause = 'DO NOTHING';
    if (updateColumns && updateColumns.length > 0) {
      updateClause = `DO UPDATE SET ${updateColumns.map(col => `${col} = EXCLUDED.${col}`).join(', ')}`;
    }

    const sql = `
      INSERT INTO ${tableName} (${columns.join(', ')})
      VALUES ${valueClauses.join(', ')}
      ON CONFLICT (${conflictTarget}) ${updateClause}
    `;

    await dbRunner.run(sql, flatParams);
  }
}

async function seedInstitutionalData(tx) {
  const dataDir = path.resolve(__dirname, '../../institutional-data');
  if (!fs.existsSync(dataDir)) {
    console.warn('[Institutional Seed] institutional-data directory not found, skipping comprehensive import.');
    return;
  }

  console.log('[Institutional Seed] Loading official verified GMRIT Deemed to be University datasets...');

  // 1. Password Hashes (generalized initial passwords that can be changed later)
  const salt = bcrypt.genSaltSync(10);
  const adminPasswordHash = bcrypt.hashSync('Admin@GMRIT2026', salt);
  const facultyPasswordHash = bcrypt.hashSync('Faculty@GMRIT2026', salt);
  const studentPasswordHash = bcrypt.hashSync('Student@GMRIT2026', salt);

  // 2. Schools Registry (4 verified Schools)
  const schools = [
    { id: 'SOAC', name: 'School of Advanced Computing', dean: 'Dr. A.V. Ramana', email: 'dean_soac@gmritdu.edu.in' },
    { id: 'SOAE', name: 'School of Applied Engineering', dean: 'Dr. P. Ramana', email: 'dean.soae@gmritdu.edu.in' },
    { id: 'SOPS', name: 'School of Physical Sciences', dean: 'Dr. R.L. Naidu', email: 'lakshumnaidu.r@gmritdu.edu.in' },
    { id: 'SOCO', name: 'School of Commerce', dean: 'Dr. KVS Prasad', email: 'prasad.kvs@gmritdu.edu.in' }
  ];
  console.log('[Institutional Seed] Seeding schools...');
  await multiRowUpsert(
    tx,
    'schools',
    ['school_id', 'name', 'dean_name', 'dean_email'],
    'school_id',
    ['name', 'dean_name', 'dean_email'],
    schools.map(s => [s.id, s.name, s.dean, s.email])
  );

  console.log('[Institutional Seed] Seeding departments (including BSH)...');
  const departments = [
    { id: 'CSE', school: 'SOAC', name: 'Computer Science & Engineering', desc: 'Department of Computer Science & Engineering.', hod: 'Dr. K. Lakshmana Rao', email: 'hod_cse@gmritdu.edu.in', phone: '+91-8941-252944' },
    { id: 'AIML', school: 'SOAC', name: 'Artificial Intelligence & Machine Learning', desc: 'Department of CSE - Artificial Intelligence & Machine Learning.', hod: 'Dr. K. Srividya', email: 'srividya.k@gmritdu.edu.in', phone: '+91-8941-252944' },
    { id: 'AIDS', school: 'SOAC', name: 'Artificial Intelligence & Data Science', desc: 'Department of CSE - Artificial Intelligence & Data Science.', hod: 'Dr. K. Jayasri', email: 'hod_aids@gmritdu.edu.in', phone: '+91-8941-252944' },
    { id: 'IT', school: 'SOAC', name: 'Information Technology', desc: 'Department of Information Technology.', hod: 'Dr. Ajit Kumar Rout', email: 'hod_it@gmritdu.edu.in', phone: '+91-8941-252944' },
    { id: 'CYBER', school: 'SOAC', name: 'Cyber Security', desc: 'Department of CSE - Cyber Security.', hod: 'Dr. Ajit Kumar Rout', email: 'hod_cyber@gmritdu.edu.in', phone: '+91-8941-252944' },
    { id: 'MECH', school: 'SOAE', name: 'Mechanical Engineering', desc: 'Department of Mechanical Engineering.', hod: 'Dr. M. Srinivasa Rao', email: 'srinivasarao.m@gmritdu.edu.in', phone: '+91-8941-252944' },
    { id: 'CIVIL', school: 'SOAE', name: 'Civil Engineering', desc: 'Department of Civil Engineering.', hod: 'Dr. J. Sridhar', email: 'sridhar.j@gmritdu.edu.in', phone: '+91-8941-252944' },
    { id: 'ECE', school: 'SOAE', name: 'Electronics & Communication Engineering', desc: 'Department of Electronics & Communication Engineering.', hod: 'Dr. V. Jagan Naveen', email: 'hod_ece@gmritdu.edu.in', phone: '+91-8941-252944' },
    { id: 'EEE', school: 'SOAE', name: 'Electrical & Electronics Engineering', desc: 'Department of Electrical & Electronics Engineering.', hod: 'Dr. T. Srinivasa Kishore', email: 'kishore.ts@gmritdu.edu.in', phone: '+91-8941-252944' },
    { id: 'BSH', school: 'SOPS', name: 'Basic Sciences & Humanities', desc: 'Department of Basic Sciences & Humanities (Mathematics, Physics, Chemistry, English).', hod: 'Dr. R.L. Naidu', email: 'lakshumnaidu.r@gmritdu.edu.in', phone: '+91-8941-252944' }
  ];
  await multiRowUpsert(
    tx,
    'departments',
    ['department_id', 'school_id', 'name', 'description', 'hod_name', 'contact_email', 'contact_phone'],
    'department_id',
    ['school_id', 'name', 'description', 'hod_name', 'contact_email', 'contact_phone'],
    departments.map(d => [d.id, d.school, d.name, d.desc, d.hod, d.email, d.phone])
  );

  // 4. Academic Years & Semesters
  const years = [
    ['YEAR_1', 'First Year'],
    ['YEAR_2', 'Second Year'],
    ['YEAR_3', 'Third Year'],
    ['YEAR_4', 'Fourth Year']
  ];
  await multiRowUpsert(tx, 'academic_years', ['year_id', 'year_label'], 'year_id', null, years);

  const semesters = [
    ['SEM_1', 1, 'YEAR_1'],
    ['SEM_2', 2, 'YEAR_1'],
    ['SEM_3', 3, 'YEAR_2'],
    ['SEM_4', 4, 'YEAR_2'],
    ['SEM_5', 5, 'YEAR_3'],
    ['SEM_6', 6, 'YEAR_3'],
    ['SEM_7', 7, 'YEAR_4'],
    ['SEM_8', 8, 'YEAR_4']
  ];
  await multiRowUpsert(tx, 'semesters', ['semester_id', 'semester_number', 'year_id'], 'semester_id', null, semesters);

  // 5. Academic Programmes & Sections
  const activeSemesters = ['SEM_1', 'SEM_2', 'SEM_3', 'SEM_4', 'SEM_5', 'SEM_6', 'SEM_7', 'SEM_8'];
  const sectionLetters = ['A', 'B', 'C', 'D'];
  const programmes = departments.map(d => [`BTECH-${d.id}`, d.id, `Bachelor of Technology in ${d.name}`, 4]);
  await multiRowUpsert(tx, 'academic_programmes', ['programme_id', 'department_id', 'programme_name', 'duration_years'], 'programme_id', null, programmes);

  const sections = [];
  for (const dept of departments) {
    for (const sem of activeSemesters) {
      for (const sec of sectionLetters) {
        sections.push([`${dept.id}-${sem}-${sec}`, dept.id, sem, sec, 66, '2026-2027']);
      }
    }
  }
  await multiRowUpsert(tx, 'sections', ['section_id', 'department_id', 'semester_id', 'section_name', 'student_count', 'academic_session'], 'section_id', null, sections, 50);

  // 6. DB-Aware Email Deduplication & User Accounts
  const existingUsers = await tx.all('SELECT pnrno, email FROM users');
  const usedEmails = new Map();
  existingUsers.forEach(u => {
    if (u.email) usedEmails.set(u.email.toLowerCase(), String(u.pnrno));
  });

  function allocateEmail(preferredEmail, pnrno) {
    const pnr = String(pnrno).trim();
    let base = (preferredEmail || '').trim().toLowerCase();
    if (!base || base === 'not_published' || base === 'null' || !base.includes('@')) {
      base = `${pnr.toLowerCase()}@gmritdu.edu.in`;
    }
    let candidate = base;
    let counter = 1;
    while (usedEmails.has(candidate) && usedEmails.get(candidate) !== pnr) {
      const parts = base.split('@');
      candidate = `${parts[0]}.${pnr.toLowerCase()}${counter > 1 ? counter : ''}@${parts[1]}`;
      counter++;
    }
    usedEmails.set(candidate, pnr);
    return candidate;
  }

  const userColumns = ['user_id', 'pnrno', 'email', 'password_hash', 'full_name', 'mobile_number', 'role', 'department_id', 'status'];
  const userUpdateColumns = ['email', 'password_hash', 'full_name', 'role', 'department_id', 'status'];

  const leadershipUserRows = [];

  // Super Admin
  const adminEmail = allocateEmail('admin@gmrit.edu.in', 'ADMIN001');
  leadershipUserRows.push(['USR-ADMIN001', 'ADMIN001', adminEmail, adminPasswordHash, 'Campus Super Admin', '', 'SUPER_ADMIN', 'CSE', 'ACTIVE']);

  // University Administration
  const leadersCsv = parseCsv(path.join(dataDir, '01_leadership_and_hod_roster.csv'));
  for (const l of leadersCsv) {
    const empId = l.employee_id.trim();
    if (!empId) continue;
    let role = 'DEPT_ADMIN';
    const cats = l.role_categories || '';
    if (cats.includes('University Administration')) {
      role = (l.name.includes('Dean') || l.designations.includes('Dean')) ? 'DEAN' : 'SUPER_ADMIN';
    }
    const rawEmail = (l.official_email || '').split(/[\s/|]+/)[0].trim();
    const prefEmail = (empId === '50110') ? 'dean.soae@gmritdu.edu.in' : rawEmail;
    const email = allocateEmail(prefEmail, empId);
    const dept = mapDepartment(l.academic_department);
    leadershipUserRows.push([
      `USR-${empId}`,
      empId,
      email,
      adminPasswordHash,
      l.name.trim(),
      l.campus_phone_extension || '',
      role,
      dept,
      'ACTIVE'
    ]);
  }

  // Branch HODs & Coordinators
  for (const dept of departments) {
    const hodPnr = `HOD-${dept.id}`;
    const hodEmail = allocateEmail(dept.email, hodPnr);
    leadershipUserRows.push([
      `USR-${hodPnr}`,
      hodPnr,
      hodEmail,
      adminPasswordHash,
      `${dept.hod} (HOD ${dept.id})`,
      dept.phone || '',
      'DEPT_ADMIN',
      dept.id,
      'ACTIVE'
    ]);

    const coordPnr = `COORD-${dept.id}`;
    const coordEmail = allocateEmail(`coord.${dept.id.toLowerCase()}@gmrit.edu.in`, coordPnr);
    leadershipUserRows.push([
      `USR-${coordPnr}`,
      coordPnr,
      coordEmail,
      adminPasswordHash,
      `Timetable Coordinator (${dept.id})`,
      dept.phone || '',
      'COORDINATOR',
      dept.id,
      'ACTIVE'
    ]);
  }

  // QA demo accounts
  const demoHodEmail = allocateEmail('cse.admin@gmrit.edu.in', 'COORD001');
  leadershipUserRows.push(['USR-COORD001', 'COORD001', demoHodEmail, adminPasswordHash, 'Dr. K. Lakshmana Rao (HOD CSE)', '', 'DEPT_ADMIN', 'CSE', 'ACTIVE']);
  const demoCoordEmail = allocateEmail('timetable.coord@gmrit.edu.in', 'COORD002');
  leadershipUserRows.push(['USR-COORD002', 'COORD002', demoCoordEmail, adminPasswordHash, 'Timetable Coordinator (CSE)', '', 'COORDINATOR', 'CSE', 'ACTIVE']);

  // Deans
  const deans = [
    { pnr: 'DEAN001', email: 'dean_soac@gmritdu.edu.in', name: 'Dr. A.V. Ramana (Dean SOAC)', school: 'SOAC', dept: 'CSE' },
    { pnr: 'DEAN002', email: 'dean.soae@gmritdu.edu.in', name: 'Dr. P. Ramana (Dean SOAE)', school: 'SOAE', dept: 'ECE' },
    { pnr: 'DEAN003', email: 'lakshumnaidu.r@gmritdu.edu.in', name: 'Dr. R.L. Naidu (Dean SOPS)', school: 'SOPS', dept: 'BSH' },
    { pnr: 'DEAN004', email: 'prasad.kvs@gmritdu.edu.in', name: 'Dr. KVS Prasad (Dean SOCO)', school: 'SOCO', dept: 'BSH' }
  ];
  for (const d of deans) {
    const deanUserId = `USR-${d.pnr}`;
    const deanEmail = allocateEmail(d.email, d.pnr);
    leadershipUserRows.push([deanUserId, d.pnr, deanEmail, adminPasswordHash, d.name, '', 'DEAN', d.dept, 'ACTIVE']);
  }

  await multiRowUpsert(tx, 'users', userColumns, 'pnrno', userUpdateColumns, leadershipUserRows, 25);

  const deanAssignments = deans.map(d => [`USR-${d.pnr}`, d.school]);
  await multiRowUpsert(tx, 'dean_school_assignments', ['user_id', 'school_id'], 'user_id', ['school_id'], deanAssignments);

  // 7. Full Faculty Directory (232 Verified Records)
  const facultyCsv = parseCsv(path.join(dataDir, '02_faculty_directory.csv'));
  const facultyUserRows = [];
  const staffRows = [];

  for (const f of facultyCsv) {
    const empId = f.employee_id.trim();
    if (!empId) continue;
    const dept = mapDepartment(f.primary_department);
    const email = allocateEmail(f.official_email, empId);
    const userId = `USR-${empId}`;

    facultyUserRows.push([
      userId,
      empId,
      email,
      facultyPasswordHash,
      f.name.trim(),
      '',
      'TEACHING_STAFF',
      dept,
      'ACTIVE'
    ]);

    staffRows.push([
      empId,
      userId,
      dept,
      f.name.trim(),
      'TEACHING',
      f.designations || 'Faculty Member',
      email,
      null,
      null,
      1
    ]);
  }

  // Demo staff
  const demoFacEmail = allocateEmail('sravani.m@gmritdu.edu.in', '52171');
  facultyUserRows.push(['USR-52171', '52171', demoFacEmail, facultyPasswordHash, 'M. Sravani (Faculty Instructor)', '', 'TEACHING_STAFF', 'CSE', 'ACTIVE']);
  staffRows.push(['52171', 'USR-52171', 'CSE', 'M. Sravani', 'TEACHING', 'Assistant Professor', demoFacEmail, null, null, 1]);

  const demoLabEmail = allocateEmail('raghu.m@gmrit.edu.in', '50008');
  facultyUserRows.push(['USR-50008', '50008', demoLabEmail, facultyPasswordHash, 'M. Raghu (Technical Lab Staff)', '', 'NON_TEACHING_STAFF', 'CSE', 'ACTIVE']);
  staffRows.push(['50008', 'USR-50008', 'CSE', 'M. Raghu', 'NON_TEACHING', 'Technical Assistant', demoLabEmail, null, null, 1]);

  await multiRowUpsert(tx, 'users', userColumns, 'pnrno', userUpdateColumns, facultyUserRows, 25);
  await multiRowUpsert(
    tx,
    'staff',
    ['staff_id', 'user_id', 'department_id', 'full_name', 'category', 'designation', 'official_email', 'photo_url', 'lab_responsibility', 'display_approved'],
    'staff_id',
    ['user_id', 'department_id', 'full_name', 'category', 'designation', 'official_email', 'display_approved'],
    staffRows,
    25
  );

  // 8. Classrooms & Laboratories Inventory (168 items)
  const roomsCsv = parseCsv(path.join(dataDir, '06_classrooms_and_labs_inventory.csv'));
  const roomRows = [];
  const labRows = [];
  const seenRoomIds = new Set();
  let roomIdx = 0;

  for (const r of roomsCsv) {
    roomIdx++;
    const cat = String(r.room_category || '').toLowerCase();
    let roomType = 'CLASSROOM';
    if (cat.includes('lab') || cat.includes('workshop')) roomType = 'LABORATORY';
    else if (cat.includes('seminar') || cat.includes('auditorium') || cat.includes('board')) roomType = 'SEMINAR_HALL';

    let rNum = (r.room_number || r.room_number_short || '').trim();
    if (!rNum) {
      const blockCode = (r.block || 'B').replace(/Block\s*/i, 'B');
      const floorCode = (r.floor || 'G').startsWith('First') ? 'F' : (r.floor || 'G').startsWith('Second') ? 'S' : 'G';
      rNum = `${blockCode}-${floorCode}-${String(r.ref_no || roomIdx).padStart(2, '0')}`;
    }

    let roomId = `RM-${rNum.replace(/[^A-Za-z0-9_-]/g, '_')}`;
    if (seenRoomIds.has(roomId)) {
      roomId = `${roomId}_${roomIdx}`;
    }
    seenRoomIds.add(roomId);

    const dept = mapDepartment(r.owning_department);
    let cap = 66;
    if (r.area_sqm && !isNaN(Number(r.area_sqm))) {
      const area = Number(r.area_sqm);
      if (roomType === 'SEMINAR_HALL') cap = Math.max(60, Math.round(area * 1.0));
      else if (roomType === 'LABORATORY') cap = Math.max(30, Math.round(area * 0.5));
      else cap = Math.max(40, Math.min(120, Math.round(area * 0.8)));
    }
    if (r.room_or_lab_name && r.room_or_lab_name.toLowerCase().includes('auditorium')) {
      cap = 264;
    }

    const desc = `${r.room_or_lab_name || r.room_category || 'Academic Room'} (${r.block || ''}, ${r.floor || ''}) ${r.equipment_or_notes || ''}`.trim();
    roomRows.push([roomId, dept, rNum, roomType, cap, desc]);

    if (roomType === 'LABORATORY') {
      const labId = `LAB-${roomId.replace(/^RM-/, '')}`;
      const labName = r.room_or_lab_name || `${dept} Laboratory (${rNum})`;
      labRows.push([labId, dept, labName, roomId, null, null, r.equipment_or_notes || 'GMRIT Departmental Practical Laboratory', cap]);
    }
  }

  await multiRowUpsert(
    tx,
    'rooms',
    ['room_id', 'department_id', 'room_number', 'room_type', 'capacity', 'facilities_description'],
    'room_id',
    ['department_id', 'room_number', 'room_type', 'capacity', 'facilities_description'],
    roomRows,
    25
  );

  await multiRowUpsert(
    tx,
    'laboratories',
    ['lab_id', 'department_id', 'name', 'room_id', 'staff_incharge_id', 'assistant_incharge_id', 'equipment_details', 'capacity'],
    'lab_id',
    ['department_id', 'name', 'room_id', 'equipment_details', 'capacity'],
    labRows,
    25
  );

  // 9. Curriculum Subjects (1,681 Verified Course Records)
  const subjectsCsv = parseCsv(path.join(dataDir, '05_curriculum_subjects_ar26_ar23.csv'));
  const subjectRows = [];
  const seenSubjIds = new Set();

  for (const s of subjectsCsv) {
    const code = (s.course_code || '').trim();
    if (!code || code === 'N/A') continue;
    const sem = mapSemester(s.semester_or_group);
    const dept = mapDepartment(s.branch);
    const courseType = mapCourseType(s.course_type);
    let credits = parseFloat(s.credits);
    if (isNaN(credits) || credits < 0) credits = 3.0;

    const subjId = `${code}-${dept}-${sem}`.replace(/[^A-Za-z0-9_-]/g, '_');
    if (seenSubjIds.has(subjId)) continue;
    seenSubjIds.add(subjId);

    subjectRows.push([
      subjId,
      dept,
      sem,
      code,
      s.course_title ? s.course_title.trim() : `${code} Course`,
      courseType,
      credits
    ]);
  }

  await multiRowUpsert(
    tx,
    'subjects',
    ['subject_id', 'department_id', 'semester_id', 'subject_code', 'subject_name', 'course_type', 'credits'],
    'subject_id',
    ['department_id', 'semester_id', 'subject_code', 'subject_name', 'course_type', 'credits'],
    subjectRows,
    25
  );

  // 10. Admitted 1st-Year Students (1,273 Verified Records)
  const studentsCsv = parseCsv(path.join(dataDir, '04_btech_1st_year_admitted_list_2026.csv'));
  const studentUserRows = [];
  const studentAssignRows = [];
  const branchSectionCounters = {};

  for (const st of studentsCsv) {
    const adminNo = (st.admin_no || '').trim();
    if (!adminNo) continue;
    const dept = mapDepartment(st.branch);
    const email = allocateEmail(`${adminNo}@gmrit.edu.in`, adminNo);
    const userId = `USR-${adminNo}`;

    const count = branchSectionCounters[dept] || 0;
    branchSectionCounters[dept] = count + 1;
    const secLetter = count < 66 ? 'A' : count < 132 ? 'B' : count < 198 ? 'C' : 'D';
    const sectionId = `${dept}-SEM_1-${secLetter}`;

    studentUserRows.push([
      userId,
      adminNo,
      email,
      studentPasswordHash,
      (st.student_and_father_name || `Student ${adminNo}`).trim(),
      '',
      'STUDENT',
      dept,
      'ACTIVE'
    ]);

    studentAssignRows.push([userId, sectionId]);
  }

  // Demo student
  const demoStudentEmail = allocateEmail('24341a0502@gmrit.edu.in', '24341A0502');
  studentUserRows.push(['USR-24341A0502', '24341A0502', demoStudentEmail, studentPasswordHash, 'Bannu (Enrolled Student)', '', 'STUDENT', 'CSE', 'ACTIVE']);
  studentAssignRows.push(['USR-24341A0502', 'CSE-SEM_3-A']);

  await multiRowUpsert(tx, 'users', userColumns, 'pnrno', userUpdateColumns, studentUserRows, 25);
  await multiRowUpsert(tx, 'user_section_assignments', ['user_id', 'section_id'], 'user_id', ['section_id'], studentAssignRows, 25);

  // 11. Official 2026 Holidays & Academic Calendar Events
  const holidaysCsv = parseCsv(path.join(dataDir, '08_holidays_2026.csv'));
  const eventRows = [];

  for (const h of holidaysCsv) {
    const isoDate = parseDottedDate(h.date);
    if (!isoDate) continue;
    const evtId = `EVT-HOL-2026-${String(h.sno).padStart(2, '0')}`;
    eventRows.push([
      evtId,
      h.occasion_festival || 'Public Holiday',
      `Official Institutional Holiday: ${h.occasion_festival} (${h.category || 'General Holiday'})`,
      'HOLIDAY',
      isoDate,
      isoDate,
      'Entire Campus',
      null,
      1,
      'ALL',
      'UPCOMING',
      'Registrar Office',
      'USR-ADMIN001'
    ]);
  }

  const calCsv = parseCsv(path.join(dataDir, '07_academic_calendar_2026_27.csv'));
  let calIdx = 0;
  for (const c of calCsv) {
    calIdx++;
    const comDate = parseDottedDate(c.commencement_of_class_work);
    if (comDate) {
      eventRows.push([
        `EVT-ACAD-COM-${calIdx}`,
        `Commencement of Class Work (${c.program} Sem ${c.semester})`,
        `Academic session commencement for ${c.program}. Working Saturdays/Notes: ${c.working_saturdays_and_vacations || 'Standard Schedule'}.`,
        'GENERAL',
        comDate,
        comDate,
        'Academic Blocks',
        null,
        0,
        'ALL',
        'UPCOMING',
        'Dean Academics',
        'USR-ADMIN001'
      ]);
    }
  }

  await multiRowUpsert(
    tx,
    'academic_events',
    ['event_id', 'title', 'description', 'event_type', 'event_date', 'end_date', 'venue', 'department_id', 'affects_schedule', 'target_semester', 'status', 'coordinator', 'created_by'],
    'event_id',
    ['title', 'description', 'event_type', 'event_date', 'end_date', 'venue', 'affects_schedule', 'status'],
    eventRows,
    25
  );

  // 12. Published Timetable Versions for all 10 departments
  const versionRows = departments.map(d => [
    `VER-${d.id}-2026-V1`,
    d.id,
    '2026-2027',
    1,
    'PUBLISHED',
    '2026-06-15',
    'USR-ADMIN001',
    '2026-06-10T10:00:00Z'
  ]);
  await multiRowUpsert(tx, 'timetable_versions', ['version_id', 'department_id', 'academic_session', 'version_number', 'status', 'effective_from', 'created_by', 'published_at'], 'version_id', null, versionRows);

  console.log('[Institutional Seed] Successfully imported complete GMRIT Deemed to be University datasets:');
  console.log('  - 4 Schools & 10 Departments (including BSH)');
  console.log(`  - ${facultyCsv.length} Real Faculty Directory Profiles`);
  console.log(`  - ${roomsCsv.length} Campus Rooms, Lecture Halls & Laboratories`);
  console.log(`  - ${subjectsCsv.length} Curriculum Subjects (AR26 & AR23)`);
  console.log(`  - ${studentsCsv.length} Admitted 1st-Year Students with Section Assignments`);
  console.log(`  - ${holidaysCsv.length} Official Holidays & Academic Calendar Milestones`);
}

module.exports = { seedInstitutionalData };
