/**
 * Agrega columnas de ticket / terminal Mercado Pago.
 * Ejecutar: npm run migrate-tickets
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
    const sql = fs.readFileSync(path.join(__dirname, 'sql', 'migration_tickets.sql'), 'utf-8');
    await pool.query(sql);
    console.log('✅ Columnas mp_terminal_id, ticket_pdf_path y ticket_impreso_at listas.');
    await pool.end();
  } catch (err) {
    console.error('❌ Error:', err.message);
    await pool.end().catch(() => {});
    process.exit(1);
  }
}

run();
