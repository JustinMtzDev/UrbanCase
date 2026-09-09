/**
 * Inicializa la base en Supabase desde cero: schema.sql más todas las
 * migraciones en orden de dependencias. Todas son idempotentes.
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

// El orden importa: cada archivo referencia tablas de los anteriores.
const ARCHIVOS_SQL = [
  'schema.sql',
  'migration_productos.sql',
  'migration_productos_precio_max.sql',
  'migration_productos_costo_compra.sql',
  'migration_productos_consignados.sql',
  'migration_productos_consignados_drop_cantidad.sql',
  'migration_inventario_favoritos.sql',
  'migration_inventario_movimientos.sql',
  'migration_inventario_movimientos_restock_rapido.sql',
  'migration_inventario_traslados.sql',
  'migration_productos_historial.sql',
  'migration_productos_historial_detalle.sql',
  'migration_ventas.sql',
  'migration_ventas_metodo_pago.sql',
  'migration_ventas_mp.sql',
  'migration_tickets.sql',
  'migration_devoluciones.sql',
  'migration_cliente_precios.sql',
  'migration_usuario_comisiones.sql',
  'migration_hardening.sql',
];

// Sin estas dos una base nueva no puede registrar ventas ni devoluciones.
const OBJETOS_REQUERIDOS = [
  'public.productos',
  'public.productos_consignados',
  'public.ventas',
  'public.devoluciones',
  'public.cliente_precios',
  'public.usuario_comision_diaria',
];

async function init() {
  try {
    console.log('🔌 Conectando a Supabase...');

    for (const archivo of ARCHIVOS_SQL) {
      const sql = fs.readFileSync(path.join(__dirname, 'sql', archivo), 'utf-8');
      await pool.query(sql);
      console.log('   ✔', archivo);
    }

    let faltantes = 0;
    for (const objeto of OBJETOS_REQUERIDOS) {
      const { rows } = await pool.query('SELECT to_regclass($1) AS ref', [objeto]);
      if (!rows[0]?.ref) {
        faltantes += 1;
        console.warn('⚠️  No se detectó', objeto, '— revisá el SQL en Supabase → SQL Editor');
      } else {
        console.log('✅ Tabla', objeto);
      }
    }

    const { rows: colComision } = await pool.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'usuarios'
         AND column_name = 'comision_total_acumulada'`
    );
    if (!colComision.length) {
      faltantes += 1;
      console.warn('⚠️  Falta usuarios.comision_total_acumulada');
    }

    if (faltantes === 0) {
      console.log('✅ Esquema completo aplicado (inventario, ventas, tickets, devoluciones, comisiones y precios por cliente).');
    }

    const { rows } = await pool.query('SELECT COUNT(*)::text AS c FROM usuarios');
    console.log('   Usuarios en Supabase:', rows[0].c);

    await pool.end();
    console.log('\n✅ Listo. Si la base estaba vacía, entrá con soporte / soporte123 y cambiá esa contraseña.');
  } catch (err) {
    console.error('❌ Error:', err.message);
    if (err.detail) console.error('   Detalle:', err.detail);
    process.exit(1);
  }
}

init();
