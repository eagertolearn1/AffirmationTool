/**
 * Run schema.sql against the configured database.
 * Usage: node src/db/migrate.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const fs   = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function migrate() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
  const schemaPath = path.resolve(__dirname, '../../schema.sql'); // schema.sql sits in backend/
  const sql = fs.readFileSync(schemaPath, 'utf8');

  console.log('Running migration from', schemaPath);

  // Split on statement boundaries and run each one individually
  // so a single "already exists" doesn't abort the whole migration
  const statements = sql
    .split(/;\s*$/m)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  let applied = 0, skipped = 0, failed = 0;
  for (const stmt of statements) {
    try {
      await pool.query(stmt);
      applied++;
    } catch (err) {
      if (err.code === '42710' || err.code === '42P07') {
        // 42710 = duplicate_object (type/index), 42P07 = duplicate_table
        skipped++;
      } else {
        console.error('❌ Statement failed:', err.message);
        console.error('   Statement:', stmt.substring(0, 120));
        failed++;
      }
    }
  }

  await pool.end();
  console.log(`✅ Migration done — applied: ${applied}, already existed (skipped): ${skipped}, errors: ${failed}`);
  if (failed > 0) process.exit(1);
}

migrate();
