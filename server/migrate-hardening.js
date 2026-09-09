/**
 * Endurecimiento de la base: permisos de anon/authenticated, FK en RESTRICT,
 * CHECK de no negatividad y de valores válidos, índices de FK y created_at
 * con zona. Ejecutar: npm run migrate-hardening
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

if (!process.env.DATABASE_URL) {
  console.error('❌ No hay DATABASE_URL en server/.env');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('supabase') ? { rejectUnauthorized: false } : false,
});

async function run() {
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'sql', 'migration_hardening.sql'), 'utf-8');
    await pool.query(sql);
    console.log('✅ Endurecimiento aplicado (permisos, FK, CHECK, índices y created_at).');
    await pool.end();
  } catch (err) {
    console.error('❌ Error:', err.message);
    await pool.end().catch(() => {});
    process.exit(1);
  }
}

run();
