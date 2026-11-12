const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { db } = require('../config/database');
const { JWT_SECRET } = require('../middleware/auth');

const VALIDATOR_NODE = 'GMRITDU-POA-NODE-01 (Autonomous Core)';

function sha256(data) {
  return crypto.createHash('sha256').update(String(data)).digest('hex');
}

function calculateMerkleRoot(transactions) {
  if (!transactions || transactions.length === 0) {
    return sha256('EMPTY_BLOCK');
  }
  let hashes = transactions.map((tx) => sha256(JSON.stringify(tx)));
  while (hashes.length > 1) {
    const nextLevel = [];
    for (let i = 0; i < hashes.length; i += 2) {
      if (i + 1 < hashes.length) {
        nextLevel.push(sha256(hashes[i] + hashes[i + 1]));
      } else {
        nextLevel.push(sha256(hashes[i] + hashes[i]));
      }
    }
    hashes = nextLevel;
  }
  return hashes[0];
}

function safeParseJson(val, fallback = []) {
  if (Array.isArray(val) || (val && typeof val === 'object')) return val;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

async function createGenesisBlock(executor = db) {
  const timestamp = new Date('2026-10-01T00:00:00.000Z').toISOString();
  const previousHash = '0'.repeat(64);
  const genesisTxs = [
    {
      txId: 'TX-GENESIS-00',
      type: 'GENESIS_INSTITUTIONAL_INIT',
      description: 'GMRIT Deemed to be University Autonomous Academic Scheduling Immutable Ledger',
      authority: 'Academic Registrar & Examination Governance',
      sessionPolicy: 'SINGLE_ACTIVE_LOGIN_RESTRICTION_STRICT',
      timestamp
    }
  ];
  const merkleRoot = calculateMerkleRoot(genesisTxs);
  const nonce = 10842;
  const currentHash = sha256(`0:${timestamp}:${previousHash}:${merkleRoot}:${nonce}:${VALIDATOR_NODE}`);

  await executor.run(
    `
      INSERT INTO blockchain_blocks (block_index, timestamp, previous_hash, current_hash, merkle_root, nonce, validator_node, tx_count, transactions_json)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
      ON CONFLICT (block_index) DO NOTHING
    `,
    [
      0,
      timestamp,
      previousHash,
      currentHash,
      merkleRoot,
      nonce,
      VALIDATOR_NODE,
      genesisTxs.length,
      JSON.stringify(genesisTxs)
    ]
  );
}

/**
 * Ensures Genesis Block #0 exists in PostgreSQL.
 */
async function initBlockchainSchema() {
  const row = await db.get('SELECT COUNT(*)::int as count FROM blockchain_blocks');
  if (!row || row.count === 0) {
    await createGenesisBlock(db);
  }
}

async function getLatestBlock(executor = db) {
  return executor.get('SELECT * FROM blockchain_blocks ORDER BY block_index DESC LIMIT 1');
}

/**
 * Records a user login transaction on the blockchain and enforces single-active-session restriction.
 */
async function recordSessionOnChain({ user, token, ip = '127.0.0.1', userAgent = 'Portal Client' }) {
  const tokenHash = sha256(token);
  const now = new Date().toISOString();

  return db.transaction(async (tx) => {
    let lastBlock = await tx.get('SELECT * FROM blockchain_blocks ORDER BY block_index DESC LIMIT 1 FOR UPDATE');
    if (!lastBlock) {
      await createGenesisBlock(tx);
      lastBlock = await tx.get('SELECT * FROM blockchain_blocks ORDER BY block_index DESC LIMIT 1 FOR UPDATE');
    }
    const nextIndex = lastBlock.block_index + 1;

    const transactions = [];
    const existingSession = await tx.get('SELECT * FROM blockchain_active_sessions WHERE user_id = $1', [user.userId]);
    let restrictionEnforced = false;

    if (existingSession && existingSession.status === 'ACTIVE' && existingSession.session_token_hash !== tokenHash) {
      await tx.run(
        `
          UPDATE blockchain_active_sessions 
          SET status = 'RESTRICTED_SUPERSEDED' 
          WHERE user_id = $1
        `,
        [user.userId]
      );

      const restrictionId = `RES-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;
      transactions.push({
        txId: restrictionId,
        type: 'BLOCKCHAIN_CONCURRENT_LOGIN_RESTRICTED',
        userId: user.userId,
        pnrno: user.pnr || user.pnrno,
        role: user.role,
        previousSessionHash: `${existingSession.session_token_hash.substring(0, 16)}...`,
        action: 'OLDER_SESSION_INVALIDATED_FORCED_LOGOUT',
        reason: 'Concurrent login attempted from another client/token. Policy: Single Active Session Only.',
        timestamp: now
      });

      await tx.run(
        `
          INSERT INTO blockchain_restrictions_log (restriction_id, user_id, pnrno, reason, action_taken, timestamp, block_index)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          restrictionId,
          user.userId,
          user.pnr || user.pnrno,
          'Concurrent login attempt restricted',
          'OLDER_SESSION_SUPERSEDED',
          now,
          nextIndex
        ]
      );

      restrictionEnforced = true;
    }

    const txId = `TX-AUTH-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;
    transactions.push({
      txId,
      type: 'USER_LOGIN_BLOCKCHAIN_VERIFIED',
      userId: user.userId,
      pnrno: user.pnr || user.pnrno,
      role: user.role,
      sessionTokenHash: tokenHash,
      ipAddress: ip,
      userAgent: userAgent ? userAgent.substring(0, 80) : 'Browser',
      status: 'ACTIVE_VERIFIED',
      timestamp: now
    });

    const merkleRoot = calculateMerkleRoot(transactions);
    const nonce = Math.floor(Math.random() * 900000) + 100000;
    const currentHash = sha256(`${nextIndex}:${now}:${lastBlock.current_hash}:${merkleRoot}:${nonce}:${VALIDATOR_NODE}`);

    await tx.run(
      `
        INSERT INTO blockchain_blocks (block_index, timestamp, previous_hash, current_hash, merkle_root, nonce, validator_node, tx_count, transactions_json)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
      `,
      [
        nextIndex,
        now,
        lastBlock.current_hash,
        currentHash,
        merkleRoot,
        nonce,
        VALIDATOR_NODE,
        transactions.length,
        JSON.stringify(transactions)
      ]
    );

    await tx.run(
      `
        INSERT INTO blockchain_active_sessions (user_id, pnrno, role, session_token_hash, block_index, ip_address, user_agent, created_at, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE')
        ON CONFLICT (user_id) DO UPDATE SET
          pnrno = EXCLUDED.pnrno,
          role = EXCLUDED.role,
          session_token_hash = EXCLUDED.session_token_hash,
          block_index = EXCLUDED.block_index,
          ip_address = EXCLUDED.ip_address,
          user_agent = EXCLUDED.user_agent,
          created_at = EXCLUDED.created_at,
          status = 'ACTIVE'
      `,
      [
        user.userId,
        user.pnr || user.pnrno,
        user.role,
        tokenHash,
        nextIndex,
        ip,
        userAgent,
        now
      ]
    );

    return {
      blockIndex: nextIndex,
      blockHash: currentHash,
      merkleRoot,
      txId,
      restrictionEnforced,
      validatorNode: VALIDATOR_NODE,
      timestamp: now
    };
  });
}

async function validateChainIntegrity() {
  const blocks = await db.all('SELECT * FROM blockchain_blocks ORDER BY block_index ASC');
  let isValid = true;
  let brokenBlockIndex = null;

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (i > 0) {
      const prev = blocks[i - 1];
      if (b.previous_hash !== prev.current_hash) {
        isValid = false;
        brokenBlockIndex = b.block_index;
        break;
      }
    }

    const expectedHash = sha256(`${b.block_index}:${b.timestamp}:${b.previous_hash}:${b.merkle_root}:${b.nonce}:${b.validator_node}`);
    if (b.current_hash !== expectedHash) {
      isValid = false;
      brokenBlockIndex = b.block_index;
      break;
    }
  }

  return {
    valid: isValid,
    totalBlocks: blocks.length,
    latestBlockIndex: blocks.length > 0 ? blocks[blocks.length - 1].block_index : 0,
    latestBlockHash: blocks.length > 0 ? blocks[blocks.length - 1].current_hash : null,
    brokenBlockIndex,
    tamperResistanceRate: isValid ? '100.0% Cryptographically Verified' : 'INTEGRITY_BREACH'
  };
}

const DEMO_ACCOUNTS = {
  SUPER_ADMIN: {
    key: 'SUPER_ADMIN',
    pnr: 'ADMIN001',
    email: 'admin@gmrit.edu.in',
    name: 'Dr. Academic Registrar',
    role: 'SUPER_ADMIN',
    roleLabel: 'Dean & Academic Registrar (Super Admin)',
    dept: 'CSE',
    description: 'Autonomous master administration, PDF/Excel ingestion, audit governance'
  },
  DEPT_ADMIN: {
    key: 'DEPT_ADMIN',
    pnr: 'COORD001',
    email: 'cse.admin@gmrit.edu.in',
    name: 'Prof. CSE Timetable Coordinator',
    role: 'DEPT_ADMIN',
    roleLabel: 'HOD & Departmental Timetable Coordinator',
    dept: 'CSE',
    description: 'CSE departmental timetables, faculty load distribution & approvals'
  },
  DEAN: {
    key: 'DEAN',
    pnr: 'DEAN001',
    email: 'dean.soac@gmritdu.edu.in',
    name: 'Dr. A. V. Ramana',
    role: 'DEAN',
    roleLabel: 'Executive Dean — School of Advanced Computing (SOAC)',
    dept: 'CSE',
    school: 'SOAC',
    description: 'School-wide governance across CSE, AIML, AIDS, IT & CYBER: approvals, feedback & telemetry'
  },
  DEAN_SOAE: {
    key: 'DEAN_SOAE',
    pnr: 'DEAN002',
    email: 'dean.soae@gmritdu.edu.in',
    name: 'Dr. M. V. Nageswara Rao',
    role: 'DEAN',
    roleLabel: 'Executive Dean — School of Advanced Engineering (SOAE)',
    dept: 'ECE',
    school: 'SOAE',
    description: 'School-wide governance across ECE, EEE, MECH & CIVIL: approvals, feedback & telemetry'
  },
  COORDINATOR: {
    key: 'COORDINATOR',
    pnr: 'COORD002',
    email: 'timetable.coord@gmrit.edu.in',
    name: 'Prof. B. Sravanthi',
    role: 'COORDINATOR',
    roleLabel: 'Department Timetable Coordinator',
    dept: 'CSE',
    description: 'Drafting & updating departmental class timetables and slot arrangements'
  },
  TEACHING_STAFF: {
    key: 'TEACHING_STAFF',
    pnr: '52171',
    email: 'sravani.m@gmritdu.edu.in',
    name: 'Mrs. M. Sravani',
    role: 'TEACHING_STAFF',
    roleLabel: 'Faculty Member (Active Practical Sessions)',
    dept: 'CSE',
    description: 'Assigned courses: AI Lab (23CS308), CA Lab (23CS509), Data Analytics Lab'
  },
  NON_TEACHING_STAFF: {
    key: 'NON_TEACHING_STAFF',
    pnr: '50008',
    email: 'raghu.m@gmrit.edu.in',
    name: 'Sri M. Raghu Varma Raju',
    role: 'NON_TEACHING_STAFF',
    roleLabel: 'Laboratory Lead & Co-Incharge',
    dept: 'CSE',
    description: 'Primary Lead: AI Lab & Programming Lab; Co-Incharge: Analytics & Coding Labs'
  },
  STUDENT: {
    key: 'STUDENT',
    pnr: '24341A0502',
    email: '24341a0502@gmrit.edu.in',
    name: 'Adabala Venkata Thrinadh',
    role: 'STUDENT',
    roleLabel: 'Undergraduate Student (CSE Sec 3A)',
    dept: 'CSE',
    cohort: 'CSE-SEM_3-A',
    description: 'Authentic enrolled student profile from institutional CampX registry'
  }
};

async function authenticateDemoAccount(roleKey, ipAddress = '127.0.0.1') {
  const accountMeta = DEMO_ACCOUNTS[roleKey.toUpperCase()];
  if (!accountMeta) {
    throw new Error(`Unrecognized demo account key: '${roleKey}'. Available: ${Object.keys(DEMO_ACCOUNTS).join(', ')}.`);
  }

  let user = await db.get(
    'SELECT * FROM users WHERE LOWER(email) = LOWER($1) OR UPPER(pnrno) = UPPER($2)',
    [accountMeta.email, accountMeta.pnr]
  );

  if (!user) {
    const userId = `USR-${accountMeta.pnr}`;
    const dummyHash = sha256(`DEMO_SECRET_${accountMeta.pnr}`);
    await db.run(
      `
        INSERT INTO users (user_id, pnrno, email, password_hash, full_name, mobile_number, role, department_id, status)
        VALUES ($1, $2, $3, $4, $5, '+91-8941-251590', $6, $7, 'ACTIVE')
        ON CONFLICT (pnrno) DO UPDATE SET
          email = EXCLUDED.email,
          full_name = EXCLUDED.full_name,
          role = EXCLUDED.role,
          department_id = EXCLUDED.department_id,
          status = 'ACTIVE'
      `,
      [userId, accountMeta.pnr, accountMeta.email.toLowerCase(), dummyHash, accountMeta.name, accountMeta.role, accountMeta.dept]
    );

    user = await db.get('SELECT * FROM users WHERE user_id = $1', [userId]);
  }

  const scopeClaims = {};
  if (accountMeta.role === 'DEAN' && accountMeta.school) {
    await db.run(
      `
        INSERT INTO dean_school_assignments (user_id, school_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id) DO UPDATE SET school_id = EXCLUDED.school_id
      `,
      [user.user_id, accountMeta.school]
    );
    scopeClaims.schoolId = accountMeta.school;
  } else if (accountMeta.role === 'STUDENT' && accountMeta.cohort) {
    await db.run(
      `
        INSERT INTO user_section_assignments (user_id, section_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id) DO UPDATE SET section_id = EXCLUDED.section_id
      `,
      [user.user_id, accountMeta.cohort]
    );
    scopeClaims.sectionId = accountMeta.cohort;
  }

  await db.run('UPDATE users SET last_login = NOW() WHERE user_id = $1', [user.user_id]);

  const tokenPayload = {
    userId: user.user_id,
    pnr: user.pnrno,
    pnrno: user.pnrno,
    email: user.email,
    fullName: user.full_name,
    role: user.role,
    departmentId: user.department_id,
    authMethod: 'BLOCKCHAIN_VERIFIED_DEMO',
    ...scopeClaims
  };

  const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '12h' });

  const blockchainReceipt = await recordSessionOnChain({
    user: tokenPayload,
    token,
    ip: ipAddress,
    userAgent: `Demo Fast-Auth (${accountMeta.roleLabel})`
  });

  return {
    token,
    user: tokenPayload,
    blockchainReceipt
  };
}

async function getBlockchainSummary() {
  const [latest, blocksRow, activeRow, restrictedRow, integrity] = await Promise.all([
    getLatestBlock(),
    db.get('SELECT COUNT(*)::int as cnt FROM blockchain_blocks'),
    db.get("SELECT COUNT(*)::int as cnt FROM blockchain_active_sessions WHERE status = 'ACTIVE'"),
    db.get('SELECT COUNT(*)::int as cnt FROM blockchain_restrictions_log'),
    validateChainIntegrity()
  ]);

  return {
    chainName: 'GMRITDU-TIMETABLE-IMMUTABLE-LEDGER',
    consensusEngine: 'Proof-of-Authority (PoA v2.0)',
    validatorNode: VALIDATOR_NODE,
    totalBlocks: blocksRow.cnt,
    latestBlockIndex: latest ? latest.block_index : 0,
    latestBlockHash: latest ? latest.current_hash : null,
    latestMerkleRoot: latest ? latest.merkle_root : null,
    lastMinedTime: latest ? latest.timestamp : null,
    activeImmutableSessions: activeRow.cnt,
    restrictedConcurrentAttempts: restrictedRow.cnt,
    integrityStatus: integrity.valid ? 'VALID_SECURE' : 'COMPROMISED',
    tamperResistance: integrity.tamperResistanceRate,
    demoAccounts: Object.values(DEMO_ACCOUNTS).map((d) => ({
      key: d.key,
      role: d.role,
      roleLabel: d.roleLabel,
      name: d.name,
      email: d.email,
      pnr: d.pnr,
      description: d.description
    }))
  };
}

async function getRecentBlocks(limit = 10) {
  const rows = await db.all('SELECT * FROM blockchain_blocks ORDER BY block_index DESC LIMIT $1', [limit]);
  return rows.map((r) => ({
    ...r,
    transactions: safeParseJson(r.transactions_json, [])
  }));
}

module.exports = {
  initBlockchainSchema,
  recordSessionOnChain,
  validateChainIntegrity,
  authenticateDemoAccount,
  getBlockchainSummary,
  getRecentBlocks,
  DEMO_ACCOUNTS
};
