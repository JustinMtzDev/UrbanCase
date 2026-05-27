/**
 * Copia productos de una sucursal origen a una destino.
 * Uso: node copiar-productos-sucursal.js "MATRIZ" "LOCAL 6"
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const origenNombre = process.argv[2] || 'MATRIZ';
const destinoNombre = process.argv[3] || 'LOCAL 6';

if (!process.env.DATABASE_URL) {
  console.error('❌ No hay DATABASE_URL en server/.env');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('supabase') ? { rejectUnauthorized: false } : false,
});

async function buscarSucursal(nombre) {
  const { rows } = await pool.query(
    `SELECT id, nombre FROM sucursales
     WHERE TRIM(LOWER(nombre)) = TRIM(LOWER($1))
     LIMIT 1`,
    [nombre]
  );
  return rows[0] || null;
}

async function run() {
  const client = await pool.connect();
  try {
    const origen = await buscarSucursal(origenNombre);
    const destino = await buscarSucursal(destinoNombre);
    if (!origen) {
      console.error(`❌ No se encontró la sucursal origen: "${origenNombre}"`);
      process.exit(1);
    }
    if (!destino) {
      console.error(`❌ No se encontró la sucursal destino: "${destinoNombre}"`);
      process.exit(1);
    }
    if (origen.id === destino.id) {
      console.error('❌ Origen y destino son la misma sucursal');
      process.exit(1);
    }

    const { rows: productosOrigen } = await client.query(
      `SELECT nombre, precio, precio_max, costo_compra, stock, categoria, imagen
       FROM productos
       WHERE sucursal_id = $1
       ORDER BY id`,
      [origen.id]
    );

    if (productosOrigen.length === 0) {
      console.log(`ℹ️ No hay productos en "${origen.nombre}" (id ${origen.id})`);
      return;
    }

    await client.query('BEGIN');

    let insertados = 0;
    let actualizados = 0;

    for (const p of productosOrigen) {
      const { rows: existentes } = await client.query(
        `SELECT id, stock FROM productos
         WHERE sucursal_id = $1
           AND nombre = $2
           AND COALESCE(categoria, '') = COALESCE($3, '')
           AND precio = $4
           AND precio_max IS NOT DISTINCT FROM $5
           AND costo_compra IS NOT DISTINCT FROM $6
         ORDER BY id
         LIMIT 1`,
        [destino.id, p.nombre, p.categoria, p.precio, p.precio_max, p.costo_compra]
      );

      if (existentes.length > 0) {
        await client.query(
          `UPDATE productos SET stock = stock + $1 WHERE id = $2`,
          [p.stock, existentes[0].id]
        );
        actualizados += 1;
      } else {
        await client.query(
          `INSERT INTO productos (sucursal_id, nombre, precio, precio_max, costo_compra, stock, categoria, imagen)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [destino.id, p.nombre, p.precio, p.precio_max, p.costo_compra, p.stock, p.categoria, p.imagen]
        );
        insertados += 1;
      }
    }

    await client.query('COMMIT');

    console.log(`✅ Copiados productos de "${origen.nombre}" (id ${origen.id}) → "${destino.nombre}" (id ${destino.id})`);
    console.log(`   Origen: ${productosOrigen.length} producto(s)`);
    console.log(`   Destino: ${insertados} nuevo(s), ${actualizados} actualizado(s) (stock sumado si ya existían)`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
