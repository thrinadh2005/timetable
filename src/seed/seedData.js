const { db, initializeSchema } = require('../config/database');
const { seedInstitutionalData } = require('./seedInstitutionalData');

const MASTER_STAFF_ROSTER = [];

async function seedDatabase() {
  await initializeSchema();
  console.log('Synchronizing GMRITDU institutional database with official verified data...');
  await seedInstitutionalData(db);
  console.log('Institutional synchronization complete: schools, departments, faculty, rooms, labs, subjects, and students active.');
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
