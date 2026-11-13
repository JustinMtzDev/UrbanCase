/**
 * Agrega la columna productos.imagen_thumb (miniatura para la cuadricula).
 * Ejecutar desde la carpeta server: npm run migrate-productos-imagen-thumb
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
    const sql = fs.readFileSync(path.join(__dirname, 'sql', 'migration_productos_imagen_thumb.sql'), 'utf-8');
    await pool.query(sql);
    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'productos' AND column_name = 'imagen_thumb'`
    );
    if (rows.length === 0) {
      console.error('❌ La columna imagen_thumb no aparece en information_schema.');
      process.exit(1);
    }
    console.log('✅ Columna productos.imagen_thumb lista.');
    await pool.end();
  } catch (err) {
    console.error('❌ Error:', err.message);
    await pool.end().catch(() => {});
    process.exit(1);
  }
}

run();
