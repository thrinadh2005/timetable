const fs = require('fs');
const path = require('path');
const { Pool, types } = require('pg');

// Preserve ISO-8601 string timestamps & numeric int8 values for existing JS contracts
types.setTypeParser(20, (val) => (val === null ? null : parseInt(val, 10))); // int8 / BIGINT / COUNT(*)
types.setTypeParser(1184, (val) => (val === null ? null : new Date(val).toISOString())); // timestamptz
types.setTypeParser(1114, (val) => (val === null ? null : new Date(`${val}Z`).toISOString())); // timestamp

const MIGRATION_FILE = path.resolve(__dirname, '../../supabase/migrations/20261112000000_initial_schema.sql');

let pool = null;
let pgliteInstance = null;
let initialized = false;

function getConnectionString() {
  return process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || '';
}

function isPgliteMode() {
  const conn = getConnectionString();
  if (conn && !conn.startsWith('pglite://')) {
    return process.env.PG_ENGINE === 'pglite';
  }
  return process.env.PG_ENGINE === 'pglite' || conn.startsWith('pglite://') || !conn;
}

function normalizeSqlTimestampFields(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map((row) => {
    if (!row || typeof row !== 'object') return row;
    const out = {};
    for (const [k, v] of Object.entries(row)) {
      if (v instanceof Date) {
        out[k] = v.toISOString();
      } else if (typeof v === 'bigint') {
        out[k] = Number(v);
      } else {
        out[k] = v;
      }
    }
    return out;
  });
}

function createQueryRunner(executor) {
  async function query(sql, params = []) {
    const res = await executor.query(sql, params);
    const rows = normalizeSqlTimestampFields(res.rows || []);
    const rowCount = typeof res.rowCount === 'number'
      ? res.rowCount
      : (typeof res.affectedRows === 'number' ? res.affectedRows : rows.length);
    return { rows, rowCount };
  }

  async function get(sql, params = []) {
    const res = await query(sql, params);
    return res.rows[0] || null;
  }

  async function all(sql, params = []) {
    const res = await query(sql, params);
    return res.rows;
  }

  async function run(sql, params = []) {
    const res = await query(sql, params);
    return {
      rowCount: res.rowCount,
      changes: res.rowCount,
      rows: res.rows
    };
  }

  async function exec(sql) {
    if (typeof executor.exec === 'function') {
      return executor.exec(sql);
    }
    return executor.query(sql);
  }

  return { query, get, all, run, exec };
}

async function getPgClientOrPglite() {
  if (isPgliteMode()) {
    if (!pgliteInstance) {
      const { PGlite } = require('@electric-sql/pglite');
      const conn = getConnectionString();
      let dataDir;
      if (conn === 'pglite://memory') {
        dataDir = undefined;
      } else if (conn.startsWith('pglite://')) {
        dataDir = conn.slice('pglite://'.length);
      } else {
        dataDir = path.resolve(__dirname, '../../data/gmritdu-pg');
        if (!conn) {
          console.warn('[Database] DATABASE_URL not set; falling back to embedded PostgreSQL (PGlite) at ./data/gmritdu-pg.');
        }
      }
      if (dataDir) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      pgliteInstance = dataDir ? new PGlite(dataDir) : new PGlite();
      await pgliteInstance.waitReady;
    }
    return { mode: 'pglite', client: pgliteInstance };
  }

  if (!pool) {
    const connectionString = getConnectionString();
    if (!connectionString) {
      throw new Error(
        'DATABASE_URL (or SUPABASE_DB_URL) is not configured. Set it in .env to connect to Supabase / PostgreSQL (or set PG_ENGINE=pglite for embedded verification).'
      );
    }
    const isLocal = /(localhost|127\.0\.0\.1)/i.test(connectionString);
    const useSsl = process.env.DATABASE_SSL === 'false' ? false : (!isLocal || /sslmode=require/i.test(connectionString));

    pool = new Pool({
      connectionString,
      ssl: useSsl ? { rejectUnauthorized: false } : false,
      max: Number(process.env.PG_POOL_MAX || 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    });

    pool.on('error', (err) => {
      console.error('[PostgreSQL Pool Error]', err.message);
    });
  }

  return { mode: 'pg', client: pool };
}

const db = {
  async query(sql, params = []) {
    const { client } = await getPgClientOrPglite();
    return createQueryRunner(client).query(sql, params);
  },

  async get(sql, params = []) {
    const { client } = await getPgClientOrPglite();
    return createQueryRunner(client).get(sql, params);
  },

  async all(sql, params = []) {
    const { client } = await getPgClientOrPglite();
    return createQueryRunner(client).all(sql, params);
  },

  async run(sql, params = []) {
    const { client } = await getPgClientOrPglite();
    return createQueryRunner(client).run(sql, params);
  },

  async exec(sql) {
    const { mode, client } = await getPgClientOrPglite();
    if (mode === 'pglite') {
      return client.exec(sql);
    }
    const pgClient = await client.connect();
    try {
      return await pgClient.query(sql);
    } finally {
      pgClient.release();
    }
  },

  async transaction(fn) {
    const { mode, client } = await getPgClientOrPglite();
    if (mode === 'pglite') {
      return client.transaction(async (txClient) => {
        const tx = createQueryRunner(txClient);
        return fn(tx);
      });
    }

    const pgClient = await client.connect();
    try {
      await pgClient.query('BEGIN');
      const tx = createQueryRunner(pgClient);
      const result = await fn(tx);
      await pgClient.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await pgClient.query('ROLLBACK');
      } catch (rollbackErr) {
        console.error('[PostgreSQL Rollback Error]', rollbackErr.message);
      }
      throw err;
    } finally {
      pgClient.release();
    }
  }
};

async function initializeSchema() {
  if (initialized) return;
  if (!fs.existsSync(MIGRATION_FILE)) {
    throw new Error(`PostgreSQL schema migration file missing at ${MIGRATION_FILE}`);
  }
  try {
    const check = await db.get("SELECT COUNT(*)::int as cnt FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users'");
    if (check && check.cnt > 0) {
      try {
        await db.run('ALTER TABLE public.facility_bookings DROP CONSTRAINT IF EXISTS facility_bookings_facility_type_check');
        await db.run(`
          ALTER TABLE public.facility_bookings ADD CONSTRAINT facility_bookings_facility_type_check 
            CHECK (facility_type IN ('CLASSROOM', 'LABORATORY', 'SEMINAR_HALL', 'AUDITORIUM', 'WORKSHOP', 'DRAWING_HALL', 'CONFERENCE_HALL', 'FACILITY'))
        `);
      } catch (patchErr1) {
        console.warn('[DB Schema Patch] facility_type constraint warning:', patchErr1.message);
      }
      try {
        await db.run('ALTER TABLE public.facility_bookings DROP CONSTRAINT IF EXISTS facility_bookings_status_check');
        await db.run(`
          ALTER TABLE public.facility_bookings ADD CONSTRAINT facility_bookings_status_check 
            CHECK (status IN ('CONFIRMED', 'PENDING', 'CANCELLED', 'REJECTED', 'COMPLETED'))
        `);
      } catch (patchErr2) {
        console.warn('[DB Schema Patch] status constraint warning:', patchErr2.message);
      }
      initialized = true;
      return;
    }
  } catch (e) {
    // If check fails on clean DB, proceed with full schema execution
  }
  const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
  await db.exec(sql);
  initialized = true;
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
  if (pgliteInstance) {
    await pgliteInstance.close();
    pgliteInstance = null;
  }
  initialized = false;
}

function getDatabaseInfo() {
  const conn = getConnectionString();
  return {
    engine: isPgliteMode() ? 'PostgreSQL (PGlite Embedded)' : 'PostgreSQL / Supabase Pool',
    initialized,
    sslEnabled: !isPgliteMode() && !(process.env.DATABASE_SSL === 'false') && !/(localhost|127\.0\.0\.1)/i.test(conn),
    configured: Boolean(conn) || isPgliteMode()
  };
}

module.exports = {
  db,
  initializeSchema,
  closePool,
  getDatabaseInfo
};
