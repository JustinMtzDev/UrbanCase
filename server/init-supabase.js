/**
 * Inicializa las tablas en Supabase (usuarios, sucursales, clientes, proveedores, productos).
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

    const migracionProductos = fs.readFileSync(path.join(__dirname, 'sql', 'migration_productos.sql'), 'utf-8');
    await pool.query(migracionProductos);

    const { rows: tbl } = await pool.query(
      `SELECT to_regclass('public.productos') AS ref`
    );
    if (!tbl[0]?.ref) {
      console.warn('⚠️  No se detectó public.productos tras aplicar SQL. Prueba en Supabase → SQL Editor el archivo migration_productos.sql');
    } else {
      console.log('✅ Tabla public.productos:', tbl[0].ref);
    }

    console.log('✅ Esquema aplicado (sucursales, usuarios, clientes, proveedores, productos).');

    const { rows } = await pool.query('SELECT COUNT(*)::text AS c FROM usuarios');
    console.log('   Usuarios en Supabase:', rows[0].c);

    await pool.end();
    console.log('\n✅ Listo. Usuario soporte / soporte123 disponible.');
  } catch (err) {
    console.error('❌ Error:', err.message);
    if (err.detail) console.error('   Detalle:', err.detail);
    process.exit(1);
  }
}

init();
