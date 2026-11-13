require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
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
    const sql = fs.readFileSync(path.join(__dirname, '..', 'sql', 'migration_productos_idx_nombre.sql'), 'utf-8');
    await pool.query(sql);
    const { rows } = await pool.query(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'productos' AND indexname = 'idx_productos_nombre_lower_btrim'`
    );
    if (rows.length === 0) {
      console.error('❌ El indice no aparece en pg_indexes.');
      process.exit(1);
    }
    console.log('✅ Indice idx_productos_nombre_lower_btrim listo.');
    await pool.end();
  } catch (err) {
    console.error('❌ Error:', err.message);
    await pool.end().catch(() => {});
    process.exit(1);
  }
}

run();
