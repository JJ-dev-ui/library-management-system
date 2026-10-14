// Run: npm run reset
// Deletes the WHOLE app database (users, books, loans) from the database in your .env.
// Your Atlas login, cluster and database user are NOT touched, only the data.
// After this, run "npm run seed" to fill it again.
require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const name = mongoose.connection.db.databaseName;
  await mongoose.connection.dropDatabase();
  console.log(`Database "${name}" deleted. Run "npm run seed" to fill it again.`);
  process.exit(0);
})().catch((err) => {
  console.error('Reset failed:', err.message);
  process.exit(1);
});