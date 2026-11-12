/* eslint-disable no-console */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { db, initializeSchema, closePool } = require('../src/config/database');

// Parent-to-child foreign-key topological order across all 32 tables
const TABLE_TRANSFER_PLAN = [
  { name: 'schools', pk: ['school_id'], timestamps: ['created_at'] },
  { name: 'departments', pk: ['department_id'], timestamps: ['created_at'] },
  { name: 'users', pk: ['user_id'], timestamps: ['created_at', 'last_login'] },
  { name: 'staff', pk: ['staff_id'], timestamps: ['created_at'] },
  { name: 'academic_programmes', pk: ['programme_id'], timestamps: [] },
  { name: 'academic_years', pk: ['year_id'], timestamps: [] },
  { name: 'semesters', pk: ['semester_id'], timestamps: [] },
  { name: 'sections', pk: ['section_id'], timestamps: [] },
  { name: 'user_section_assignments', pk: ['user_id'], timestamps: ['assigned_at'] },
  { name: 'dean_school_assignments', pk: ['user_id'], timestamps: ['assigned_at'] },
  { name: 'rooms', pk: ['room_id'], timestamps: [] },
  { name: 'laboratories', pk: ['lab_id'], timestamps: [] },
  { name: 'subjects', pk: ['subject_id'], timestamps: [] },
  { name: 'timetable_versions', pk: ['version_id'], timestamps: ['published_at'] },
  { name: 'timetable_slots', pk: ['slot_id'], timestamps: [] },
  { name: 'class_substitutions', pk: ['substitution_id'], timestamps: ['created_at'] },
  { name: 'lab_bookings', pk: ['booking_id'], timestamps: ['created_at'] },
  { name: 'facility_bookings', pk: ['booking_id'], timestamps: ['created_at'] },
  { name: 'timetable_documents', pk: ['doc_id'], jsonb: ['parsed_data_json'], timestamps: ['created_at'] },
  { name: 'lab_incidents', pk: ['incident_id'], timestamps: ['created_at'] },
  { name: 'events', pk: ['event_id'], timestamps: ['created_at'] },
  { name: 'academic_events', pk: ['event_id'], timestamps: ['created_at'] },
  { name: 'notifications', pk: ['notification_id'], timestamps: ['created_at'] },
  { name: 'user_feedback', pk: ['feedback_id'], timestamps: ['created_at'] },
  { name: 'password_resets', pk: ['reset_id'], timestamps: ['expires_at', 'created_at'] },
  { name: 'audit_logs', pk: ['log_id'], timestamps: ['timestamp'] },
  { name: 'telemetry_requests', pk: ['id'], identity: 'id', timestamps: ['timestamp'] },
  { name: 'telemetry_security_events', pk: ['id'], identity: 'id', timestamps: ['timestamp'] },
  { name: 'blockchain_blocks', pk: ['block_index'], jsonb: ['transactions_json'], timestamps: ['timestamp'] },
  { name: 'blockchain_active_sessions', pk: ['user_id'], timestamps: ['created_at'] },
  { name: 'blockchain_restrictions_log', pk: ['restriction_id'], timestamps: ['timestamp'] }
];

function normalizeTimestampValue(val) {
  if (val === null || val === undefined || val === '') return null;
  const s = String(val).trim();
  // SQLite CURRENT_TIMESTAMP produces "YYYY-MM-DD HH:MM:SS" in UTC
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(s)) {
    return `${s.replace(' ', 'T')}Z`;
  }
  return s;
}

function normalizeJsonbValue(val) {
  if (val === null || val === undefined) return '[]';
  if (typeof val === 'string') {
    try {
      JSON.parse(val);
      return val;
    } catch (_) {
      return JSON.stringify({ raw: val });
    }
  }
  return JSON.stringify(val);
}

async function getPgTableColumns(tx, tableName) {
  const rows = await tx.all(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  return new Set(rows.map((r) => r.column_name));
}

async function transferSqliteToPostgres() {
  const sqlitePath = path.resolve(
    process.cwd(),
    process.env.SQLITE_PATH || process.env.DATABASE_PATH || './data/gmritdu_timetable.db'
  );

  if (!fs.existsSync(sqlitePath)) {
    throw new Error(`SQLite source database not found at: ${sqlitePath}`);
  }

  let BetterSqlite3;
  try {
    BetterSqlite3 = require('better-sqlite3');
  } catch (err) {
    throw new Error(`better-sqlite3 is required for one-time migration transfer: ${err.message}`);
  }

  console.log(`Source SQLite database : ${sqlitePath}`);
  console.log('Ensuring target Supabase / PostgreSQL schema is initialized...');
  await initializeSchema();

  const sqlite = new BetterSqlite3(sqlitePath, { readonly: true });
  const sqliteTables = new Set(
    sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name)
  );

  const summary = [];

  try {
    await db.transaction(async (tx) => {
      for (const spec of TABLE_TRANSFER_PLAN) {
        if (!sqliteTables.has(spec.name)) {
          summary.push({ table: spec.name, sqliteRows: 0, pgRows: 0, status: 'SKIPPED_NOT_IN_SQLITE' });
          continue;
        }

        const pgCols = await getPgTableColumns(tx, spec.name);
        const sqliteRows = sqlite.prepare(`SELECT * FROM "${spec.name}"`).all();

        if (sqliteRows.length === 0) {
          const countRow = await tx.get(`SELECT COUNT(*)::int AS c FROM "${spec.name}"`);
          summary.push({ table: spec.name, sqliteRows: 0, pgRows: countRow.c, status: 'OK_EMPTY' });
          continue;
        }

        const sqliteCols = Object.keys(sqliteRows[0]).filter((c) => pgCols.has(c));
        const tsSet = new Set(spec.timestamps || []);
        const jsonbSet = new Set(spec.jsonb || []);

        const colListSql = sqliteCols.map((c) => `"${c}"`).join(', ');
        const placeholdersSql = sqliteCols.map((c, idx) => (jsonbSet.has(c) ? `$${idx + 1}::jsonb` : `$${idx + 1}`)).join(', ');
        const nonPkCols = sqliteCols.filter((c) => !spec.pk.includes(c));
        const conflictTarget = spec.pk.map((c) => `"${c}"`).join(', ');

        let conflictAction;
        if (nonPkCols.length > 0) {
          const updateSetSql = nonPkCols.map((c) => `"${c}" = EXCLUDED."${c}"`).join(', ');
          conflictAction = `ON CONFLICT (${conflictTarget}) DO UPDATE SET ${updateSetSql}`;
        } else {
          conflictAction = `ON CONFLICT (${conflictTarget}) DO NOTHING`;
        }

        const overridingSql = spec.identity ? 'OVERRIDING SYSTEM VALUE ' : '';
        const upsertSql = `INSERT INTO "${spec.name}" (${colListSql}) ${overridingSql}VALUES (${placeholdersSql}) ${conflictAction}`;

        for (const row of sqliteRows) {
          const params = sqliteCols.map((c) => {
            let v = row[c];
            if (tsSet.has(c)) v = normalizeTimestampValue(v);
            else if (jsonbSet.has(c)) v = normalizeJsonbValue(v);
            return v === undefined ? null : v;
          });
          await tx.run(upsertSql, params);
        }

        if (spec.identity) {
          await tx.run(
            `SELECT setval(pg_get_serial_sequence('public.${spec.name}', '${spec.identity}'), COALESCE((SELECT MAX("${spec.identity}") FROM public."${spec.name}"), 1), (SELECT COUNT(*) > 0 FROM public."${spec.name}"))`
          );
        }

        const afterRow = await tx.get(`SELECT COUNT(*)::int AS c FROM "${spec.name}"`);
        if (afterRow.c < sqliteRows.length) {
          throw new Error(
            `Row verification mismatch for table ${spec.name}: sqlite=${sqliteRows.length}, pg=${afterRow.c}`
          );
        }

        summary.push({ table: spec.name, sqliteRows: sqliteRows.length, pgRows: afterRow.c, status: 'TRANSFERRED' });
      }
    });
  } finally {
    sqlite.close();
  }

  console.log('\n=== SQLite -> PostgreSQL Transfer Summary ===');
  for (const item of summary) {
    console.log(
      `${item.table.padEnd(30)} sqlite=${String(item.sqliteRows).padStart(4)}  pg=${String(item.pgRows).padStart(4)}  [${item.status}]`
    );
  }
  console.log('Transfer completed and verified successfully.');
  return summary;
}

if (require.main === module) {
  transferSqliteToPostgres()
    .then(() => closePool())
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error('Migration transfer failed:', err);
      await closePool().catch(() => {});
      process.exit(1);
    });
}

module.exports = { transferSqliteToPostgres, TABLE_TRANSFER_PLAN };

