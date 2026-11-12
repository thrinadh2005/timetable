const { db } = require('../config/database');
const { getTelemetrySnapshot } = require('../middleware/telemetry');

async function getTelemetryData() {
  const snapshot = getTelemetrySnapshot();

  const [
    recentRequests,
    securityEvents,
    auditLogs,
    departmentsRow,
    usersRow,
    staffRow,
    sectionsRow,
    slotsRow,
    eventsRow,
    auditRow,
    telemetryRow
  ] = await Promise.all([
    db.all(`
      SELECT id, trace_id, method, path, status_code, duration_ms, ip_address, user_id, user_agent, timestamp
      FROM telemetry_requests
      ORDER BY id DESC
      LIMIT 30
    `),
    db.all(`
      SELECT id, event_type, severity, details, ip_address, user_identifier, timestamp
      FROM telemetry_security_events
      ORDER BY id DESC
      LIMIT 30
    `),
    db.all(`
      SELECT log_id, admin_id, admin_name, action, entity_name, entity_id, old_value, new_value, ip_address, timestamp
      FROM audit_logs
      ORDER BY timestamp DESC
      LIMIT 30
    `),
    db.get('SELECT COUNT(*)::int as count FROM departments'),
    db.get('SELECT COUNT(*)::int as count FROM users'),
    db.get('SELECT COUNT(*)::int as count FROM staff'),
    db.get('SELECT COUNT(*)::int as count FROM sections'),
    db.get('SELECT COUNT(*)::int as count FROM timetable_slots'),
    db.get('SELECT COUNT(*)::int as count FROM events'),
    db.get('SELECT COUNT(*)::int as count FROM audit_logs'),
    db.get('SELECT COUNT(*)::int as count FROM telemetry_requests')
  ]);

  const dbStats = {
    departmentsCount: departmentsRow.count,
    usersCount: usersRow.count,
    staffCount: staffRow.count,
    sectionsCount: sectionsRow.count,
    timetableSlotsCount: slotsRow.count,
    eventsCount: eventsRow.count,
    totalAuditLogs: auditRow.count,
    totalTelemetryLogged: telemetryRow.count
  };

  return {
    systemSnapshot: snapshot,
    dbStats,
    recentRequests,
    securityEvents,
    auditLogs
  };
}

module.exports = {
  getTelemetryData
};
