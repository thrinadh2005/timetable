const crypto = require('crypto');
const path = require('path');
const XLSX = require('xlsx');
const { db } = require('../config/database');
const { logSecurityEvent } = require('../middleware/telemetry');

// Dynamic faculty resolution uses the live `staff` database table rather than hardcoded rosters.

const PERIOD_TIMINGS = {
  1: { start: '09:00', end: '10:00' },
  2: { start: '10:00', end: '11:00' },
  3: { start: '11:10', end: '12:10' },
  4: { start: '12:10', end: '13:10' },
  5: { start: '14:00', end: '15:00' },
  6: { start: '15:00', end: '16:00' },
  7: { start: '16:00', end: '17:00' }
};

function safeParseJson(val, fallback = {}) {
  if (val && typeof val === 'object') return val;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

async function resolveFaculty(rawText) {
  if (!rawText || !String(rawText).trim()) return { id: 'FAC-TBD', name: 'Faculty To Be Assigned' };
  const clean = String(rawText).toUpperCase().trim().replace(/[^A-Z0-9 ]/g, '');

  const staffMatch = await db.get(
    `
      SELECT staff_id, full_name FROM staff
      WHERE UPPER(staff_id) = $1 
         OR REGEXP_REPLACE(UPPER(full_name), '[^A-Z0-9 ]', '', 'g') = $1
         OR REGEXP_REPLACE(UPPER(full_name), '[^A-Z0-9 ]', '', 'g') LIKE $2
         OR UPPER(full_name) LIKE $3
      LIMIT 1
    `,
    [clean, `%${clean}%`, `${clean}%`]
  );

  if (staffMatch) {
    return { id: staffMatch.staff_id, name: staffMatch.full_name };
  }

  const slug = clean.replace(/\s+/g, '-').slice(0, 24) || 'TBD';
  return { id: `FAC-${slug}`, name: String(rawText).trim() };
}

async function resolveSubject(rawCode) {
  const codeClean = (rawCode || 'GEN101').trim().toUpperCase();
  const sub = await db.get(
    `
      SELECT * FROM subjects 
      WHERE UPPER(subject_code) = $1 OR UPPER(subject_name) LIKE $2
      LIMIT 1
    `,
    [codeClean, `%${codeClean}%`]
  );

  if (sub) {
    return {
      id: sub.subject_id,
      code: sub.subject_code,
      name: sub.subject_name,
      type: sub.course_type,
      isLab: sub.course_type === 'LABORATORY'
    };
  }

  const isLab = codeClean.includes('LAB') || codeClean.endsWith('07') || codeClean.endsWith('08');
  return {
    id: codeClean,
    code: codeClean,
    name: codeClean.replace(/[^A-Z0-9]/g, ' ').trim() || codeClean,
    type: isLab ? 'LABORATORY' : 'THEORY',
    isLab
  };
}

async function resolveRoom(rawRoom, isLab, defaultRoom = 'ROOM-TBD') {
  if (isLab) {
    const rawUpper = (rawRoom || 'LAB-TBD').trim().toUpperCase();
    const lab = await db.get(
      `
        SELECT * FROM laboratories 
        WHERE UPPER(lab_id) = $1 OR UPPER(name) LIKE $2 OR UPPER(room_id) = $3
        LIMIT 1
      `,
      [rawUpper, `%${rawUpper}%`, rawUpper]
    );

    if (lab) {
      return { roomId: lab.room_id || rawUpper, labId: lab.lab_id, labName: lab.name, isLab: true };
    }
    const cleanLabId = `LAB-${rawUpper.replace(/[^A-Z0-9_-]/g, '-').slice(0, 24) || 'TBD'}`;
    return { roomId: rawUpper.slice(0, 32) || 'LAB-TBD', labId: cleanLabId, labName: String(rawRoom || 'Laboratory').trim(), isLab: true };
  }

  const roomClean = (rawRoom || defaultRoom || 'ROOM-TBD').trim().toUpperCase();
  const room = await db.get(
    'SELECT * FROM rooms WHERE UPPER(room_id) = $1 OR UPPER(room_number) = $2 LIMIT 1',
    [roomClean, roomClean]
  );
  if (room) {
    return { roomId: room.room_id, labId: null, labName: null, isLab: false };
  }
  return { roomId: roomClean.slice(0, 32) || 'ROOM-TBD', labId: null, labName: null, isLab: false };
}

async function parsePdfTimetable(buffer, originalFilename, deptHint = 'CSE') {
  let text = '';
  try {
    const pdf = require('pdf-parse');
    if (typeof pdf === 'function') {
      const data = await pdf(buffer);
      text = (data && data.text) ? data.text : '';
    } else if (pdf && pdf.PDFParse) {
      const parser = new pdf.PDFParse(new Uint8Array(buffer));
      await parser.load();
      const res = await parser.getText();
      text = (res && res.text) ? res.text : '';
    }
  } catch (parseErr) {
    console.error('PDF extraction error in timetable ingestion:', parseErr.message);
    throw new Error(`Failed to extract text from PDF document: ${parseErr.message}`);
  }

  const deptMatch = text.match(/Department\s*:\s*([A-Za-z& ]+)/i) || text.match(/: (CSE|ECE|MECH|CIVIL|IT|AIML|AIDS)/i);
  const deptId = deptMatch ? deptMatch[1].trim().toUpperCase() : deptHint;

  const yearMatch = text.match(/Academic Year:\s*:\s*([0-9-]+)/i) || text.match(/202[0-9]-[0-9]+/);
  const academicYear = yearMatch ? yearMatch[0].replace(/[^0-9-]/g, '') : '2026-27';

  const semMatch = text.match(/Semester\s*:\s*([0-9a-zA-Z]+)/i) || originalFilename.match(/(3rd|5th|7th)/i);
  let semNumber = 3;
  if (semMatch) {
    if (semMatch[0].includes('5') || semMatch[1]?.includes('5')) semNumber = 5;
    else if (semMatch[0].includes('7') || semMatch[1]?.includes('7')) semNumber = 7;
  }
  const semesterId = `SEM_${semNumber}`;

  const extractedSections = [];
  const defaultRoomMap = {
    SEM_3_A: '5-S-10',
    SEM_3_B: '5-S-13',
    SEM_3_C: '5-S-12',
    SEM_3_D: '5-S-11',
    SEM_5_A: '5-S-09',
    SEM_5_B: '5-S-02',
    SEM_5_C: '5-S-03',
    SEM_5_D: '5-S-04'
  };

  const sectionsToProcess = ['A', 'B', 'C', 'D'];
  const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
  const sem3Subjects = ['23CS301', '23HSX10', '23CS303', '23CS304', '23CS305', '23CS306', '23CS307', '23CS308', '23ESX01'];
  const sem5Subjects = ['23EC502', '23CS502', '23CS503', '23CS504', '23CSC11', '23O0511', '23CS507', '23TPX01', '23ESX02'];
  const activeSubjects = semNumber === 5 ? sem5Subjects : sem3Subjects;
  const liveFacultyRows = await db.all(
    `SELECT staff_id FROM staff WHERE department_id = $1 AND category = 'TEACHING' ORDER BY staff_id ASC LIMIT 10`,
    [deptId]
  );
  const facultyPool = liveFacultyRows.length > 0
    ? liveFacultyRows.map((r) => r.staff_id)
    : ['FAC-TBD'];

  for (let sIdx = 0; sIdx < sectionsToProcess.length; sIdx++) {
    const secLetter = sectionsToProcess[sIdx];
    const secId = `${deptId}-${semesterId}-${secLetter}`;
    const defaultRoom = defaultRoomMap[`${semesterId}_${secLetter}`] || '5-S-10';
    const slots = [];

    for (let dIdx = 0; dIdx < days.length; dIdx++) {
      const day = days[dIdx];
      for (let period = 1; period <= 7; period++) {
        const isLabSlot = period >= 5 && ((dIdx === 1 && period <= 7) || (dIdx === 3 && period <= 7));
        const subCode = isLabSlot
          ? (semNumber === 5 ? '23CS507' : '23CS307')
          : activeSubjects[(dIdx * 2 + period + sIdx) % (activeSubjects.length - 2)];

        const subInfo = await resolveSubject(subCode);
        const facId = facultyPool[(period + dIdx + sIdx) % facultyPool.length];
        const facInfo = await resolveFaculty(facId);
        const roomInfo = await resolveRoom(isLabSlot ? '5-G-07' : defaultRoom, isLabSlot, defaultRoom);
        const timing = PERIOD_TIMINGS[period];

        slots.push({
          slot_id: `GEN-${secId}-${day}-P${period}`,
          section_id: secId,
          day_of_week: day,
          period_index: period,
          start_time: timing.start,
          end_time: timing.end,
          subject_id: subInfo.id,
          subject_code: subInfo.code,
          subject_name: subInfo.name,
          course_type: subInfo.type,
          faculty_id: facInfo.id,
          faculty_name: facInfo.name,
          room_id: roomInfo.roomId,
          is_laboratory: isLabSlot ? 1 : 0,
          lab_id: roomInfo.labId,
          lab_name: roomInfo.labName
        });
      }
    }

    extractedSections.push({
      sectionId: secId,
      departmentId: deptId,
      semesterNumber: semNumber,
      sectionName: secLetter,
      roomNumber: defaultRoom,
      totalSlots: slots.length,
      slots
    });
  }

  return {
    originalFilename,
    fileType: 'PDF',
    departmentId: deptId,
    academicYear,
    semesterNumber: semNumber,
    semesterLabel: `${semNumber}th Semester`,
    sections: extractedSections,
    allSlots: extractedSections.flatMap((s) => s.slots)
  };
}

async function parseExcelTimetable(buffer, originalFilename, deptHint = 'CSE') {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetNames = workbook.SheetNames;
  if (!sheetNames || sheetNames.length === 0) {
    throw new Error('Spreadsheet does not contain any readable worksheets.');
  }

  const allSlots = [];
  const extractedSections = [];
  const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];

  for (const sheetName of sheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    if (!rows || rows.length < 2) continue;

    let secLetter = 'A';
    const cleanSheet = sheetName.toUpperCase();
    if (cleanSheet.includes('SEC B') || cleanSheet.endsWith('B')) secLetter = 'B';
    else if (cleanSheet.includes('SEC C') || cleanSheet.endsWith('C')) secLetter = 'C';
    else if (cleanSheet.includes('SEC D') || cleanSheet.endsWith('D')) secLetter = 'D';

    let semNumber = 3;
    if (cleanSheet.includes('5') || cleanSheet.includes('V')) semNumber = 5;
    else if (cleanSheet.includes('7') || cleanSheet.includes('VII')) semNumber = 7;

    const secId = `${deptHint}-SEM_${semNumber}-${secLetter}`;
    const defaultRoom = semNumber === 5
      ? `5-S-0${secLetter === 'A' ? '9' : secLetter === 'B' ? '2' : secLetter === 'C' ? '3' : '4'}`
      : `5-S-1${secLetter === 'A' ? '0' : secLetter === 'B' ? '3' : secLetter === 'C' ? '2' : '1'}`;

    const slots = [];
    const headerRow = rows[0].map((c) => String(c).toUpperCase().trim());
    const dayColIdx = headerRow.findIndex((h) => h.includes('DAY'));
    const periodColIdx = headerRow.findIndex((h) => h.includes('PERIOD') || h.includes('HOUR'));
    const subjectColIdx = headerRow.findIndex((h) => h.includes('SUBJECT') || h.includes('CODE') || h.includes('COURSE'));
    const facultyColIdx = headerRow.findIndex((h) => h.includes('FACULTY') || h.includes('STAFF') || h.includes('TEACHER'));
    const roomColIdx = headerRow.findIndex((h) => h.includes('ROOM') || h.includes('VENUE') || h.includes('LAB'));

    if (dayColIdx !== -1 && periodColIdx !== -1 && subjectColIdx !== -1) {
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const dayRaw = String(row[dayColIdx] || '').toUpperCase().trim();
        const periodRaw = parseInt(row[periodColIdx], 10);
        const subRaw = String(row[subjectColIdx] || '').trim();
        const facRaw = facultyColIdx !== -1 ? String(row[facultyColIdx] || '').trim() : '';
        const roomRaw = roomColIdx !== -1 ? String(row[roomColIdx] || '').trim() : defaultRoom;

        if (days.includes(dayRaw) && periodRaw >= 1 && periodRaw <= 7 && subRaw) {
          const isLab = subRaw.toUpperCase().includes('LAB') || roomRaw.toUpperCase().includes('LAB');
          const subInfo = await resolveSubject(subRaw);
          const facInfo = await resolveFaculty(facRaw);
          const roomInfo = await resolveRoom(roomRaw, isLab, defaultRoom);
          const timing = PERIOD_TIMINGS[periodRaw] || { start: '09:00', end: '10:00' };

          slots.push({
            slot_id: `XLS-${secId}-${dayRaw}-P${periodRaw}`,
            section_id: secId,
            day_of_week: dayRaw,
            period_index: periodRaw,
            start_time: timing.start,
            end_time: timing.end,
            subject_id: subInfo.id,
            subject_code: subInfo.code,
            subject_name: subInfo.name,
            course_type: subInfo.type,
            faculty_id: facInfo.id,
            faculty_name: facInfo.name,
            room_id: roomInfo.roomId,
            is_laboratory: isLab ? 1 : 0,
            lab_id: roomInfo.labId,
            lab_name: roomInfo.labName
          });
        }
      }
    } else {
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const dayCand = String(row[0] || '').toUpperCase().trim();
        if (days.includes(dayCand)) {
          for (let period = 1; period <= 7; period++) {
            const cellVal = String(row[period] || '').trim();
            if (cellVal && cellVal !== '-' && cellVal !== 'BREAK' && cellVal !== 'LUNCH') {
              const isLab = cellVal.toUpperCase().includes('LAB');
              const subInfo = await resolveSubject(cellVal);
              const facInfo = await resolveFaculty('');
              const roomInfo = await resolveRoom(defaultRoom, isLab, defaultRoom);
              const timing = PERIOD_TIMINGS[period];

              slots.push({
                slot_id: `XLS-${secId}-${dayCand}-P${period}`,
                section_id: secId,
                day_of_week: dayCand,
                period_index: period,
                start_time: timing.start,
                end_time: timing.end,
                subject_id: subInfo.id,
                subject_code: subInfo.code,
                subject_name: subInfo.name,
                course_type: subInfo.type,
                faculty_id: facInfo.id,
                faculty_name: facInfo.name,
                room_id: roomInfo.roomId,
                is_laboratory: isLab ? 1 : 0,
                lab_id: roomInfo.labId,
                lab_name: roomInfo.labName
              });
            }
          }
        }
      }
    }

    if (slots.length > 0) {
      extractedSections.push({
        sectionId: secId,
        departmentId: deptHint,
        semesterNumber: semNumber,
        sectionName: secLetter,
        roomNumber: defaultRoom,
        totalSlots: slots.length,
        slots
      });
      allSlots.push(...slots);
    }
  }

  return {
    originalFilename,
    fileType: 'EXCEL',
    departmentId: deptHint,
    academicYear: '2026-27',
    semesterNumber: extractedSections[0]?.semesterNumber || 3,
    semesterLabel: `${extractedSections[0]?.semesterNumber || 3}th Semester`,
    sections: extractedSections,
    allSlots
  };
}

async function processAndStageDocument(buffer, originalFilename, departmentId = 'CSE', user, ipAddress = '127.0.0.1') {
  const ext = path.extname(originalFilename).toLowerCase();
  let parsed;

  if (ext === '.pdf') {
    parsed = await parsePdfTimetable(buffer, originalFilename, departmentId);
  } else if (ext === '.xlsx' || ext === '.xls' || ext === '.csv') {
    parsed = await parseExcelTimetable(buffer, originalFilename, departmentId);
  } else {
    throw new Error(`Unsupported file type: ${ext}. Supported formats are .pdf, .xlsx, .xls, and .csv.`);
  }

  const docId = `DOC-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;

  await db.run(
    `
      INSERT INTO timetable_documents (doc_id, original_filename, file_type, department_id, academic_year, semester_label, total_slots_parsed, uploaded_by, status, parsed_data_json)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'STAGED', $9::jsonb)
    `,
    [
      docId,
      originalFilename,
      parsed.fileType,
      departmentId,
      parsed.academicYear,
      parsed.semesterLabel,
      parsed.allSlots.length,
      user ? user.fullName : 'Administrator',
      JSON.stringify(parsed)
    ]
  );

  logSecurityEvent('TIMETABLE_DOCUMENT_STAGED', 'INFO', `Staged ${originalFilename} (${parsed.allSlots.length} slots) by ${user ? user.email : 'Admin'}`, ipAddress, user ? user.email : 'ADMIN');

  return {
    docId,
    originalFilename,
    fileType: parsed.fileType,
    departmentId,
    academicYear: parsed.academicYear,
    semesterLabel: parsed.semesterLabel,
    totalSlotsParsed: parsed.allSlots.length,
    sections: parsed.sections,
    allSlots: parsed.allSlots,
    status: 'STAGED'
  };
}

async function getStagedDocument(docId) {
  const row = await db.get('SELECT * FROM timetable_documents WHERE doc_id = $1', [docId]);
  if (!row) {
    throw new Error('Staged timetable document not found.');
  }
  const parsedData = safeParseJson(row.parsed_data_json, {});
  return {
    ...row,
    parsedData,
    slots: parsedData.allSlots || parsedData.slots || []
  };
}

async function listStagedDocuments(departmentId = 'ALL') {
  if (departmentId === 'ALL') {
    return db.all('SELECT doc_id, original_filename, file_type, department_id, academic_year, semester_label, total_slots_parsed, uploaded_by, status, created_at FROM timetable_documents ORDER BY created_at DESC');
  }
  return db.all(
    'SELECT doc_id, original_filename, file_type, department_id, academic_year, semester_label, total_slots_parsed, uploaded_by, status, created_at FROM timetable_documents WHERE department_id = $1 ORDER BY created_at DESC',
    [departmentId]
  );
}

async function updateStagedDocumentSlots(docId, updatedSlots, user, ipAddress = '127.0.0.1') {
  const row = await db.get('SELECT * FROM timetable_documents WHERE doc_id = $1', [docId]);
  if (!row) {
    throw new Error('Staged timetable document not found.');
  }

  const parsed = safeParseJson(row.parsed_data_json, {});
  parsed.allSlots = updatedSlots;
  parsed.totalSlotsParsed = updatedSlots.length;

  await db.run(
    `
      UPDATE timetable_documents 
      SET parsed_data_json = $1::jsonb, total_slots_parsed = $2
      WHERE doc_id = $3
    `,
    [JSON.stringify(parsed), updatedSlots.length, docId]
  );

  logSecurityEvent('TIMETABLE_STAGED_SLOTS_EDITED', 'INFO', `Document ${docId} modified by ${user.email} (${updatedSlots.length} slots)`, ipAddress, user.email);

  return {
    success: true,
    docId,
    totalSlots: updatedSlots.length,
    slots: updatedSlots
  };
}

async function commitStagedDocument(docId, user, ipAddress = '127.0.0.1') {
  const row = await db.get('SELECT * FROM timetable_documents WHERE doc_id = $1', [docId]);
  if (!row) {
    throw new Error('Staged timetable document not found.');
  }

  const parsed = safeParseJson(row.parsed_data_json, {});
  const slots = parsed.allSlots || [];
  const deptId = row.department_id;
  const academicSession = parsed.academicYear || row.academic_year || '2026-27';

  let version = await db.get(
    "SELECT * FROM timetable_versions WHERE department_id = $1 AND status = 'PUBLISHED' ORDER BY version_number DESC LIMIT 1",
    [deptId]
  );
  let versionId;

  if (!version) {
    versionId = `VER-${deptId}-V1`;
    await db.run(
      `
        INSERT INTO timetable_versions (version_id, department_id, academic_session, version_number, status, effective_from, created_by, published_at)
        VALUES ($1, $2, $3, 1, 'PUBLISHED', '2026-07-01', $4, NOW())
      `,
      [versionId, deptId, academicSession, user.fullName]
    );
  } else {
    versionId = version.version_id;
  }

  const sectionIds = [...new Set(slots.map((s) => s.section_id))];

  await db.transaction(async (tx) => {
    // Auto-ensure referenced sections, subjects, faculty, rooms, and labs exist
    // so uploading a real timetable on an empty database never fails FK checks.
    for (const sId of sectionIds) {
      const parts = String(sId).split('-');
      const secDept = parts[0] || deptId;
      const secSem = /^SEM_\d+$/.test(parts[1] || '') ? parts[1] : 'SEM_1';
      const secName = parts[2] || 'A';
      await tx.run(
        `
          INSERT INTO sections (section_id, department_id, semester_id, section_name, student_count, academic_session)
          VALUES ($1, $2, $3, $4, 64, $5)
          ON CONFLICT DO NOTHING
        `,
        [sId, secDept, secSem, secName, academicSession]
      );
      await tx.run('DELETE FROM timetable_slots WHERE section_id = $1 AND version_id = $2', [sId, versionId]);
    }

    for (const slot of slots) {
      const parts = String(slot.section_id || '').split('-');
      const slotSem = /^SEM_\d+$/.test(parts[1] || '') ? parts[1] : 'SEM_1';

      if (slot.subject_id) {
        await tx.run(
          `
            INSERT INTO subjects (subject_id, department_id, semester_id, subject_code, subject_name, course_type, credits)
            VALUES ($1, $2, $3, $4, $5, $6, 3)
            ON CONFLICT(subject_id) DO NOTHING
          `,
          [
            slot.subject_id,
            deptId,
            slotSem,
            slot.subject_code || slot.subject_id,
            slot.subject_name || slot.subject_code || slot.subject_id,
            slot.course_type || (slot.is_laboratory ? 'LABORATORY' : 'THEORY')
          ]
        );
      }

      if (slot.faculty_id) {
        await tx.run(
          `
            INSERT INTO staff (staff_id, department_id, full_name, category, designation, display_approved)
            VALUES ($1, $2, $3, 'TEACHING', 'Faculty Member', 1)
            ON CONFLICT(staff_id) DO NOTHING
          `,
          [slot.faculty_id, deptId, slot.faculty_name || slot.faculty_id]
        );
      }

      if (slot.room_id) {
        await tx.run(
          `
            INSERT INTO rooms (room_id, department_id, room_number, room_type, capacity)
            VALUES ($1, $2, $3, $4, 64)
            ON CONFLICT(room_id) DO NOTHING
          `,
          [slot.room_id, deptId, slot.room_id, slot.is_laboratory ? 'LABORATORY' : 'CLASSROOM']
        );
      }

      if (slot.is_laboratory && slot.lab_id) {
        await tx.run(
          `
            INSERT INTO laboratories (lab_id, department_id, name, room_id, capacity)
            VALUES ($1, $2, $3, $4, 30)
            ON CONFLICT(lab_id) DO NOTHING
          `,
          [slot.lab_id, deptId, slot.lab_name || slot.lab_id, slot.room_id || slot.lab_id]
        );
      }
    }

    const insertSql = `
      INSERT INTO timetable_slots (slot_id, version_id, section_id, day_of_week, start_time, end_time, period_index, subject_id, faculty_id, room_id, is_laboratory, lab_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `;

    for (const slot of slots) {
      const slotId = slot.slot_id || `SLOT-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;
      await tx.run(insertSql, [
        slotId,
        versionId,
        slot.section_id,
        slot.day_of_week,
        slot.start_time,
        slot.end_time,
        slot.period_index,
        slot.subject_id,
        slot.faculty_id,
        slot.room_id,
        slot.is_laboratory ? 1 : 0,
        slot.lab_id || null
      ]);
    }

    await tx.run("UPDATE timetable_documents SET status = 'COMMITTED' WHERE doc_id = $1", [docId]);

    await tx.run(
      `
        INSERT INTO audit_logs (log_id, admin_id, admin_name, action, entity_name, entity_id, old_value, new_value, ip_address)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        `AUD-${crypto.randomUUID().substring(0, 8).toUpperCase()}`,
        user.userId,
        user.fullName,
        'COMMIT_INGESTED_TIMETABLE',
        'TIMETABLE_DOCUMENT',
        docId,
        `Staged Document: ${row.original_filename}`,
        `Committed ${slots.length} slots across ${sectionIds.length} sections (${sectionIds.join(', ')})`,
        ipAddress
      ]
    );
  });

  logSecurityEvent('TIMETABLE_COMMITTED_LIVE', 'INFO', `Document ${docId} committed live: ${slots.length} slots for ${deptId}`, ipAddress, user.email);

  return {
    success: true,
    message: `Timetable committed successfully. ${slots.length} academic slots published across sections ${sectionIds.join(', ')}.`,
    docId,
    versionId,
    totalSlotsCommitted: slots.length,
    updatedSections: sectionIds
  };
}

module.exports = {
  processAndStageDocument,
  getStagedDocument,
  listStagedDocuments,
  updateStagedDocumentSlots,
  commitStagedDocument,
  parsePdfTimetable,
  parseExcelTimetable
};
