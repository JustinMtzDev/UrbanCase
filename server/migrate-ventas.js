/**
 * Crea las tablas ventas y venta_detalle.
 * Ejecutar desde la carpeta server: npm run migrate-ventas
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
    const sql = fs.readFileSync(path.join(__dirname, 'sql', 'migration_ventas.sql'), 'utf-8');
    await pool.query(sql);
    const { rows } = await pool.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name IN ('ventas', 'venta_detalle')`
    );
    if (rows.length < 2) {
      console.error('❌ Faltan tablas ventas/venta_detalle; revisa permisos y errores.');
      process.exit(1);
    }
    console.log('✅ Tablas public.ventas y public.venta_detalle listas.');
    await pool.end();
  } catch (err) {
    console.error('❌ Error:', err.message);
    await pool.end().catch(() => {});
    process.exit(1);
  }
}

run();
