/**
 * Comisiones diarias admin/vendedor.
 * Ejecutar desde server: npm run migrate-usuario-comisiones
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const {
  recalcularComisionesGlobales,
} = require('./services/comisiones');

if (!process.env.DATABASE_URL) {
  console.error('❌ No hay DATABASE_URL en server/.env');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('supabase') ? { rejectUnauthorized: false } : false,
});

async function backfillUltimos7Dias(client) {
  await recalcularComisionesGlobales(client);
}

async function run() {
  const client = await pool.connect();
  try {
    const sql = fs.readFileSync(
      path.join(__dirname, 'sql', 'migration_usuario_comisiones.sql'),
      'utf-8'
    );
    await client.query('BEGIN');
    await client.query(sql);
    await backfillUltimos7Dias(client);
    await client.query('COMMIT');
    console.log('✅ Comisiones recalculadas (desde $1,000 · $50 por cada $500).');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Error:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end().catch(() => {});
  }
}

run();
