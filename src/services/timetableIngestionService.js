const crypto = require('crypto');
const path = require('path');
const XLSX = require('xlsx');
const { db } = require('../config/database');
const { logSecurityEvent } = require('../middleware/telemetry');
const { broadcast } = require('./notificationStream');

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

async function resolveSubject(rawCode, rawName = '', courseTypeHint = '') {
  const codeClean = (rawCode || 'GEN101').trim().toUpperCase();
  const sub = await db.get(
    `
      SELECT * FROM subjects 
      WHERE UPPER(subject_code) = $1 OR UPPER(subject_name) LIKE $2
      LIMIT 1
    `,
    [codeClean, `%${codeClean}%`]
  );

  const isLabHint = (courseTypeHint && courseTypeHint.toUpperCase().includes('LAB')) ||
                    codeClean.includes('LAB') ||
                    (rawName && rawName.toUpperCase().includes('LAB'));

  if (sub) {
    return {
      id: sub.subject_id,
      code: sub.subject_code,
      name: rawName && rawName.trim() ? rawName.trim() : sub.subject_name,
      type: courseTypeHint ? (isLabHint ? 'LABORATORY' : 'THEORY') : sub.course_type,
      isLab: courseTypeHint ? isLabHint : sub.course_type === 'LABORATORY'
    };
  }

  const nameVal = rawName && rawName.trim() ? rawName.trim() : codeClean.replace(/[^A-Z0-9]/g, ' ').trim() || codeClean;
  const isLab = isLabHint || codeClean.endsWith('07') || codeClean.endsWith('08');
  return {
    id: codeClean,
    code: codeClean,
    name: nameVal,
    type: courseTypeHint ? (isLabHint ? 'LABORATORY' : 'THEORY') : (isLab ? 'LABORATORY' : 'THEORY'),
    isLab: courseTypeHint ? isLabHint : isLab
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

  if (!text || !text.trim()) {
    throw new Error('PDF document appears to be empty or contains scanned images without extractable text.');
  }

  const deptMatch = text.match(/Department\s*:\s*([A-Za-z& ]+)/i) || text.match(/: (CSE|ECE|MECH|CIVIL|IT|AIML|AIDS)/i);
  const deptId = deptMatch ? deptMatch[1].trim().toUpperCase() : deptHint;

  const yearMatch = text.match(/Academic Year:\s*:\s*([0-9-]+)/i) || text.match(/202[0-9]-[0-9]+/);
  const academicYear = yearMatch ? yearMatch[0].replace(/[^0-9-]/g, '') : '2026-27';

  const semMatch = text.match(/Semester\s*:\s*([0-9a-zA-Z]+)/i) || originalFilename.match(/(1st|2nd|3rd|4th|5th|6th|7th|8th)/i);
  let semNumber = 3;
  if (semMatch) {
    const semDigit = semMatch[0].match(/\d+/);
    if (semDigit) semNumber = parseInt(semDigit[0], 10);
  }
  const semesterId = `SEM_${semNumber}`;

  // Parse lines to extract structured slots strictly from the document content
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const extractedSlots = [];

  let currentSection = 'A';
  let currentRoom = semNumber === 5 ? '5-S-09' : '5-S-10';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect section header in text e.g. "Section: B" or "Section - C"
    const secHeaderMatch = line.match(/Section\s*[:\-]\s*([A-D])/i);
    if (secHeaderMatch) {
      currentSection = secHeaderMatch[1].toUpperCase();
    }

    const roomMatch = line.match(/Room\s*(?:No\.?)?\s*[:\-]?\s*([0-9A-Za-z\-]+)/i);
    if (roomMatch) {
      currentRoom = roomMatch[1].trim();
    }

    // Check if line starts with a day of week
    const upperLine = line.toUpperCase();
    const dayFound = days.find((d) => upperLine.startsWith(d) || upperLine.includes(` ${d} `));
    if (dayFound) {
      // Split tokens on the line
      const tokens = line.split(/\s{2,}|\t/).map((t) => t.trim()).filter(Boolean);
      // If tokens look like a schedule row (Day followed by period entries)
      if (tokens.length >= 2) {
        let periodCounter = 1;
        for (let tIdx = 1; tIdx < tokens.length && periodCounter <= 7; tIdx++) {
          const val = tokens[tIdx];
          if (val === 'BREAK' || val === 'TEA' || val === 'LUNCH' || val === '-') {
            continue;
          }
          const isLab = val.toUpperCase().includes('LAB') || val.toUpperCase().includes('PRACTICAL');
          const timing = PERIOD_TIMINGS[periodCounter] || { start: '09:00', end: '10:00' };
          const subInfo = await resolveSubject(val, val, isLab ? 'LABORATORY' : 'THEORY');
          const facInfo = await resolveFaculty('');
          const roomInfo = await resolveRoom(currentRoom, isLab, currentRoom);
          const secId = `${deptId}-${semesterId}-${currentSection}`;

          extractedSlots.push({
            slot_id: `PDF-${secId}-${dayFound}-P${periodCounter}-${Date.now().toString(36).slice(-4)}`,
            section_id: secId,
            day_of_week: dayFound,
            period_index: periodCounter,
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
          periodCounter++;
        }
      }
    }
  }

  if (extractedSlots.length === 0) {
    throw new Error(
      'Could not detect timetable matrix in this PDF file. Please ensure the PDF includes clear Day and Period headers, or upload the schedule as an Excel (.xlsx) / CSV file.'
    );
  }

  // Group slots by section
  const sectionMap = {};
  for (const slot of extractedSlots) {
    const sId = slot.section_id;
    if (!sectionMap[sId]) {
      const parts = sId.split('-');
      sectionMap[sId] = {
        sectionId: sId,
        departmentId: deptId,
        semesterNumber: semNumber,
        sectionName: parts[2] || 'A',
        roomNumber: currentRoom,
        totalSlots: 0,
        slots: []
      };
    }
    sectionMap[sId].slots.push(slot);
    sectionMap[sId].totalSlots++;
  }

  const sections = Object.values(sectionMap);

  return {
    originalFilename,
    fileType: 'PDF',
    departmentId: deptId,
    academicYear,
    semesterNumber: semNumber,
    semesterLabel: `${semNumber}th Semester`,
    sections,
    allSlots: extractedSlots
  };
}

async function parseExcelTimetable(buffer, originalFilename, deptHint = 'CSE') {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetNames = workbook.SheetNames;
  if (!sheetNames || sheetNames.length === 0) {
    throw new Error('Spreadsheet does not contain any readable worksheets.');
  }

  const allSlots = [];
  const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  let detectedSemNumber = 3;

  for (const sheetName of sheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    if (!rows || rows.length < 2) continue;

    let defaultSecLetter = 'A';
    const cleanSheet = sheetName.toUpperCase();
    if (cleanSheet.includes('SEC B') || cleanSheet.endsWith('B')) defaultSecLetter = 'B';
    else if (cleanSheet.includes('SEC C') || cleanSheet.endsWith('C')) defaultSecLetter = 'C';
    else if (cleanSheet.includes('SEC D') || cleanSheet.endsWith('D')) defaultSecLetter = 'D';

    let sheetSemNumber = 3;
    if (cleanSheet.includes('5') || cleanSheet.includes('V')) sheetSemNumber = 5;
    else if (cleanSheet.includes('7') || cleanSheet.includes('VII')) sheetSemNumber = 7;
    else if (cleanSheet.includes('1') || cleanSheet.includes('I')) sheetSemNumber = 1;
    detectedSemNumber = sheetSemNumber;

    // Scan the first 15 rows to find the actual table header
    let headerRowIdx = -1;
    let dayColIdx = -1;
    let periodColIdx = -1;
    let codeColIdx = -1;
    let nameColIdx = -1;
    let subjectColIdx = -1;
    let facultyColIdx = -1;
    let roomColIdx = -1;
    let labColIdx = -1;
    let secColIdx = -1;
    let semColIdx = -1;
    let typeColIdx = -1;

    for (let r = 0; r < Math.min(15, rows.length); r++) {
      const row = (rows[r] || []).map((c) => String(c || '').toUpperCase().trim());
      const dIdx = row.findIndex((h) => h === 'DAY' || h.includes('DAY_OF_WEEK') || h.includes('DAY'));
      const pIdx = row.findIndex((h) => h === 'PERIOD' || h.includes('PERIOD_INDEX') || h.includes('HOUR'));
      const sIdx = row.findIndex((h) => h.includes('SUBJECT') || h.includes('COURSE') || h.includes('CODE'));

      if (dIdx !== -1 && (pIdx !== -1 || sIdx !== -1)) {
        headerRowIdx = r;
        dayColIdx = dIdx;
        periodColIdx = pIdx;

        codeColIdx = row.findIndex((h) => h === 'SUBJECT CODE' || h === 'COURSE CODE' || h === 'CODE' || h.includes('SUBJECT_CODE'));
        nameColIdx = row.findIndex((h) => h === 'SUBJECT NAME' || h === 'COURSE NAME' || h === 'TITLE' || h === 'NAME' || h.includes('SUBJECT_NAME'));
        subjectColIdx = codeColIdx !== -1 ? codeColIdx : row.findIndex((h) => h.includes('SUBJECT') || h.includes('COURSE'));

        facultyColIdx = row.findIndex((h) => h.includes('FACULTY') || h.includes('STAFF') || h.includes('TEACHER') || h.includes('INSTRUCTOR'));
        roomColIdx = row.findIndex((h) => h === 'ROOM' || h === 'VENUE' || h.includes('ROOM_ID') || h.includes('ROOM_NUMBER'));
        labColIdx = row.findIndex((h) => h.includes('LAB') || h.includes('LABORATORY'));
        secColIdx = row.findIndex((h) => h === 'SECTION' || h === 'SEC' || h.includes('SECTION_ID'));
        semColIdx = row.findIndex((h) => h === 'SEMESTER' || h === 'SEM' || h.includes('SEMESTER_ID'));
        typeColIdx = row.findIndex((h) => h === 'TYPE' || h.includes('COURSE_TYPE') || h.includes('TYPE'));
        break;
      }
    }

    if (headerRowIdx !== -1 && dayColIdx !== -1 && periodColIdx !== -1 && (subjectColIdx !== -1 || codeColIdx !== -1)) {
      // Columnar format (e.g. Day, Period, Section, Semester, Subject Code, Subject Name, Faculty, Room, Type)
      for (let i = headerRowIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const dayRaw = String(row[dayColIdx] || '').toUpperCase().trim();
        const periodStr = String(row[periodColIdx] || '').replace(/[^0-9]/g, '');
        const periodRaw = parseInt(periodStr, 10);

        const subCodeRaw = codeColIdx !== -1 ? String(row[codeColIdx] || '').trim() : (subjectColIdx !== -1 ? String(row[subjectColIdx] || '').trim() : '');
        const subNameRaw = nameColIdx !== -1 ? String(row[nameColIdx] || '').trim() : '';
        const facRaw = facultyColIdx !== -1 ? String(row[facultyColIdx] || '').trim() : '';
        const roomRaw = roomColIdx !== -1 ? String(row[roomColIdx] || '').trim() : (labColIdx !== -1 ? String(row[labColIdx] || '').trim() : '');
        const typeRaw = typeColIdx !== -1 ? String(row[typeColIdx] || '').toUpperCase().trim() : '';

        // Row-specific section and semester
        let rowSec = defaultSecLetter;
        if (secColIdx !== -1 && row[secColIdx]) {
          const rawSecVal = String(row[secColIdx]).trim().toUpperCase();
          const matchSec = rawSecVal.match(/[A-D]/);
          if (matchSec) rowSec = matchSec[0];
        }

        let rowSem = sheetSemNumber;
        if (semColIdx !== -1 && row[semColIdx]) {
          const rawSemVal = String(row[semColIdx]).replace(/[^0-9]/g, '');
          if (rawSemVal) rowSem = parseInt(rawSemVal, 10);
        }

        const secId = `${deptHint}-SEM_${rowSem}-${rowSec}`;
        const defaultRoom = `5-S-0${rowSec === 'A' ? '9' : rowSec === 'B' ? '2' : rowSec === 'C' ? '3' : '4'}`;
        const effectiveRoom = roomRaw || defaultRoom;

        if (days.includes(dayRaw) && periodRaw >= 1 && periodRaw <= 7 && (subCodeRaw || subNameRaw)) {
          const isLab = typeRaw === 'LABORATORY' || subCodeRaw.toUpperCase().includes('LAB') || subNameRaw.toUpperCase().includes('LAB') || effectiveRoom.toUpperCase().includes('LAB');
          const subInfo = await resolveSubject(subCodeRaw, subNameRaw, typeRaw || (isLab ? 'LABORATORY' : 'THEORY'));
          const facInfo = await resolveFaculty(facRaw);
          const roomInfo = await resolveRoom(effectiveRoom, isLab, defaultRoom);
          const timing = PERIOD_TIMINGS[periodRaw] || { start: '09:00', end: '10:00' };

          allSlots.push({
            slot_id: `XLS-${secId}-${dayRaw}-P${periodRaw}-${Date.now().toString(36).slice(-4)}`,
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
      // Grid format (Day as col 0, periods 1..7 as subsequent columns)
      const secId = `${deptHint}-SEM_${sheetSemNumber}-${defaultSecLetter}`;
      const defaultRoom = `5-S-0${defaultSecLetter === 'A' ? '9' : defaultSecLetter === 'B' ? '2' : defaultSecLetter === 'C' ? '3' : '4'}`;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;
        const dayCand = String(row[0] || '').toUpperCase().trim();
        if (days.includes(dayCand)) {
          for (let period = 1; period <= 7; period++) {
            const cellVal = String(row[period] || '').trim();
            if (cellVal && cellVal !== '-' && cellVal !== 'BREAK' && cellVal !== 'LUNCH') {
              const isLab = cellVal.toUpperCase().includes('LAB') || cellVal.toUpperCase().includes('PRACTICAL');
              const subInfo = await resolveSubject(cellVal, cellVal, isLab ? 'LABORATORY' : 'THEORY');
              const facInfo = await resolveFaculty('');
              const roomInfo = await resolveRoom(defaultRoom, isLab, defaultRoom);
              const timing = PERIOD_TIMINGS[period] || { start: '09:00', end: '10:00' };

              allSlots.push({
                slot_id: `XLS-${secId}-${dayCand}-P${period}-${Date.now().toString(36).slice(-4)}`,
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
  }

  if (allSlots.length === 0) {
    throw new Error('Spreadsheet does not contain any valid timetable slots matching Day, Period, and Subject columns.');
  }

  // Group slots by section
  const sectionMap = {};
  for (const slot of allSlots) {
    const sId = slot.section_id;
    if (!sectionMap[sId]) {
      const parts = sId.split('-');
      sectionMap[sId] = {
        sectionId: sId,
        departmentId: deptHint,
        semesterNumber: detectedSemNumber,
        sectionName: parts[2] || 'A',
        roomNumber: slot.room_id || '5-S-10',
        totalSlots: 0,
        slots: []
      };
    }
    sectionMap[sId].slots.push(slot);
    sectionMap[sId].totalSlots++;
  }

  const sections = Object.values(sectionMap);

  return {
    originalFilename,
    fileType: 'EXCEL',
    departmentId: deptHint,
    academicYear: '2026-27',
    semesterNumber: sections[0]?.semesterNumber || detectedSemNumber,
    semesterLabel: `${sections[0]?.semesterNumber || detectedSemNumber}th Semester`,
    sections,
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

  // Re-sync sections grouping
  const sectionMap = {};
  for (const s of updatedSlots) {
    const sId = s.section_id || `${row.department_id}-SEM_1-A`;
    if (!sectionMap[sId]) {
      const parts = String(sId).split('-');
      sectionMap[sId] = {
        sectionId: sId,
        departmentId: parts[0] || row.department_id,
        semesterNumber: parseInt((parts[1] || '').replace(/\D/g, ''), 10) || 1,
        sectionName: parts[2] || 'A',
        roomNumber: s.room_id || '5-S-10',
        totalSlots: 0,
        slots: []
      };
    }
    sectionMap[sId].slots.push(s);
    sectionMap[sId].totalSlots++;
  }
  parsed.sections = Object.values(sectionMap);

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
    slots: updatedSlots,
    sections: parsed.sections
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

      const effSubjectCode = (slot.subject_code || slot.subject_id || 'GEN101').trim().toUpperCase();
      const effSubjectId = slot.subject_id || effSubjectCode;
      const effSubjectName = slot.subject_name || effSubjectCode;
      const effCourseType = slot.course_type || (slot.is_laboratory ? 'LABORATORY' : 'THEORY');

      const effFacultyName = slot.faculty_name || 'Faculty Instructor';
      const effFacultyId = slot.faculty_id || (slot.faculty_name ? `FAC-${slot.faculty_name.replace(/[^A-Za-z0-9]/g, '-').slice(0, 20)}` : 'FAC-TBD');

      const effRoomId = slot.room_id || '5-S-10';
      const isLab = Boolean(slot.is_laboratory || effCourseType === 'LABORATORY');
      const effLabId = isLab ? (slot.lab_id || `LAB-${effRoomId.replace(/[^A-Za-z0-9]/g, '-')}`) : null;
      const effLabName = isLab ? (slot.lab_name || `${effSubjectName} Lab`) : null;

      // Ensure subject exists
      await tx.run(
        `
          INSERT INTO subjects (subject_id, department_id, semester_id, subject_code, subject_name, course_type, credits)
          VALUES ($1, $2, $3, $4, $5, $6, 3)
          ON CONFLICT(subject_id) DO NOTHING
        `,
        [effSubjectId, deptId, slotSem, effSubjectCode, effSubjectName, effCourseType]
      );

      // Ensure faculty exists
      await tx.run(
        `
          INSERT INTO staff (staff_id, department_id, full_name, category, designation, display_approved)
          VALUES ($1, $2, $3, 'TEACHING', 'Faculty Member', 1)
          ON CONFLICT(staff_id) DO NOTHING
        `,
        [effFacultyId, deptId, effFacultyName]
      );

      // Ensure room exists
      await tx.run(
        `
          INSERT INTO rooms (room_id, department_id, room_number, room_type, capacity)
          VALUES ($1, $2, $3, $4, 64)
          ON CONFLICT(room_id) DO NOTHING
        `,
        [effRoomId, deptId, effRoomId, isLab ? 'LABORATORY' : 'CLASSROOM']
      );

      // Ensure laboratory exists if lab slot
      if (isLab && effLabId) {
        await tx.run(
          `
            INSERT INTO laboratories (lab_id, department_id, name, room_id, capacity)
            VALUES ($1, $2, $3, $4, 30)
            ON CONFLICT(lab_id) DO NOTHING
          `,
          [effLabId, deptId, effLabName, effRoomId]
        );
      }

      // Attach resolved values back to slot
      slot._effSubjectId = effSubjectId;
      slot._effFacultyId = effFacultyId;
      slot._effRoomId = effRoomId;
      slot._effLabId = effLabId;
      slot._effIsLab = isLab ? 1 : 0;
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
        slot.start_time || '09:00',
        slot.end_time || '10:00',
        slot.period_index,
        slot._effSubjectId || slot.subject_id,
        slot._effFacultyId || slot.faculty_id,
        slot._effRoomId || slot.room_id,
        slot._effIsLab ?? (slot.is_laboratory ? 1 : 0),
        slot._effLabId || slot.lab_id || null
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

  try {
    broadcast('data_change', {
      entity: 'TIMETABLE',
      docId,
      versionId,
      departmentId: deptId,
      sections: sectionIds
    });
  } catch (bErr) {
    console.warn('[Broadcast Error]', bErr.message);
  }

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
