const { db } = require('../config/database');

// Sample laboratory schedules are intentionally disabled so laboratories and
// lab timetable allocations start empty and are populated exclusively with real data.
async function seedLabTimetables() {
  return { seeded: 0, message: 'Sample lab schedules disabled (demo-accounts baseline).' };
}

if (require.main === module) {
  seedLabTimetables()
    .then(() => {
      console.log('Lab seed skipped: clean baseline enabled.');
      process.exitCode = 0;
    })
    .catch((err) => {
      console.error('Lab seed error:', err);
      process.exitCode = 1;
    });
}

module.exports = { seedLabTimetables, OFFICIAL_LABS: [] };
