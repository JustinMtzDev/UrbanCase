/**
 * Inicializa las tablas en Supabase (usuarios, sucursales, clientes, proveedores).
 * Ejecutar: node init-supabase.js
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

async function init() {
  try {
    console.log('🔌 Conectando a Supabase...');
    const schema = fs.readFileSync(path.join(__dirname, 'sql', 'schema.sql'), 'utf-8');
    await pool.query(schema);
    console.log('✅ Tablas creadas/actualizadas (usuarios, sucursales, clientes, proveedores).');

    const { rows } = await pool.query('SELECT COUNT(*) FROM usuarios');
    console.log('   Usuarios en Supabase:', rows[0].count);

    await pool.end();
    console.log('\n✅ Listo. Usuario soporte / soporte123 disponible.');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

init();
