// Reinicio de datos para la puesta en produccion.
//
// Vacia lo transaccional y deja el catalogo de productos con stock 0 y costo de
// compra 0. Conserva productos, sucursales, usuarios, clientes, proveedores y
// los precios especiales de cliente.
//
// Uso:
//   node server/reset-produccion.js            -> solo muestra que se borraria
//   node server/reset-produccion.js --aplicar  -> ejecuta el borrado
//
// Detén el servidor antes de aplicarlo: TRUNCATE toma un lock exclusivo.
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const fs = require('fs');
const path = require('path');
const pool = require('./config/db');

const APLICAR = process.argv.includes('--aplicar');

// Un solo TRUNCATE para las ocho: Postgres resuelve las dependencias porque
// todas las tablas que apuntan a ventas estan en la lista. Sin CASCADE a
// proposito, para que falle y avise si alguien agrega una tabla nueva con FK.
const TABLAS_A_VACIAR = [
  'devoluciones',
  'venta_detalle',
  'ventas',
  'usuario_comision_diaria',
  'inventario_movimientos',
  'inventario_traslados',
  'productos_historial',
  'productos_consignados',
];

const TABLAS_CONSERVADAS = [
  'productos',
  'sucursales',
  'usuarios',
  'clientes',
  'proveedores',
  'cliente_precios',
];

async function contar(client, tablas) {
  const conteos = [];
  for (const tabla of tablas) {
    const { rows } = await client.query(`SELECT count(*)::int AS n FROM public.${tabla}`);
    conteos.push({ tabla, filas: rows[0].n });
  }
  return conteos;
}

function imprimir(titulo, conteos) {
  console.log(`\n${titulo}`);
  conteos.forEach(({ tabla, filas }) => console.log(`  ${tabla.padEnd(26)} ${filas}`));
}

function borrarTicketsEnDisco() {
  const dir = path.join(__dirname, 'tickets');
  if (!fs.existsSync(dir)) return 0;
  const pdfs = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.pdf'));
  // Los folios vuelven a 1 y los PDF viejos se llamarian igual que los nuevos.
  pdfs.forEach((f) => fs.unlinkSync(path.join(dir, f)));
  return pdfs.length;
}

async function main() {
  const client = await pool.connect();
  try {
    imprimir('Se van a VACIAR:', await contar(client, TABLAS_A_VACIAR));
    imprimir('Se CONSERVAN:', await contar(client, TABLAS_CONSERVADAS));

    if (!APLICAR) {
      console.log('\nModo revision. Nada se borro.');
      console.log('Para ejecutarlo: node server/reset-produccion.js --aplicar');
      return;
    }

    await client.query('BEGIN');
    await client.query(`TRUNCATE TABLE ${TABLAS_A_VACIAR.map((t) => `public.${t}`).join(', ')} RESTART IDENTITY`);
    const prods = await client.query('UPDATE public.productos SET stock = 0, costo_compra = 0');
    const usrs = await client.query(
      'UPDATE public.usuarios SET comision_total_acumulada = 0 WHERE comision_total_acumulada <> 0'
    );
    await client.query('COMMIT');

    console.log(`\nProductos puestos en stock 0 y costo 0: ${prods.rowCount}`);
    console.log(`Usuarios con comision acumulada reiniciada: ${usrs.rowCount}`);
    console.log(`Tickets PDF borrados del disco: ${borrarTicketsEnDisco()}`);

    imprimir('Verificacion (debe ser 0):', await contar(client, TABLAS_A_VACIAR));
    imprimir('Conservado:', await contar(client, TABLAS_CONSERVADAS));

    const { rows: seq } = await client.query(
      "SELECT last_value FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'ventas_id_seq'"
    );
    console.log(`\nProximo folio de venta: ${(Number(seq[0]?.last_value) || 0) + 1}`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('\nFallo el reinicio:', err.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
