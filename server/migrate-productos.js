/**
 * Crea solo la tabla productos (útil si init-supabase no la aplicó o para Supabase manual).
 * Ejecutar desde la carpeta server: npm run migrate-productos
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
    const sql = fs.readFileSync(path.join(__dirname, 'sql', 'migration_productos.sql'), 'utf-8');
    await pool.query(sql);
    const { rows } = await pool.query(
      `SELECT table_schema, table_name
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'productos'`
    );
    if (rows.length === 0) {
      console.error('❌ La tabla productos no aparece en information_schema; revisa permisos y errores.');
      process.exit(1);
    }
    console.log('✅ Tabla public.productos lista.');
    await pool.end();
  } catch (err) {
    console.error('❌ Error:', err.message);
    await pool.end().catch(() => {});
    process.exit(1);
  }
}

run();
