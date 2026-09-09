// Respaldo de los datos a un archivo JSON, para cuando no hay pg_dump a mano.
// Uso: node server/respaldo-datos.js
// El archivo queda en respaldos/urbancase-<fecha>.json (carpeta ignorada por git).
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const fs = require('fs');
const path = require('path');
const pool = require('./config/db');

// Orden pensado para poder reinsertar respetando llaves foraneas.
const TABLAS = [
  'sucursales',
  'usuarios',
  'clientes',
  'proveedores',
  'productos',
  'productos_consignados',
  'inventario_favoritos',
  'inventario_traslados',
  'inventario_movimientos',
  'productos_historial',
  'ventas',
  'venta_detalle',
  'devoluciones',
  'cliente_precios',
  'usuario_comision_diaria',
];

async function main() {
  const respaldo = { generado_en: new Date().toISOString(), tablas: {} };
  const resumen = [];

  for (const tabla of TABLAS) {
    try {
      const { rows } = await pool.query(`SELECT * FROM public.${tabla}`);
      respaldo.tablas[tabla] = rows;
      resumen.push(`${tabla}: ${rows.length}`);
    } catch (err) {
      respaldo.tablas[tabla] = { error: err.message };
      resumen.push(`${tabla}: ERROR (${err.message})`);
    }
  }

  const dir = path.join(__dirname, '..', 'respaldos');
  fs.mkdirSync(dir, { recursive: true });
  const sello = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const archivo = path.join(dir, `urbancase-${sello}.json`);
  fs.writeFileSync(archivo, JSON.stringify(respaldo, null, 2), 'utf8');

  console.log('Respaldo escrito en:', archivo);
  console.log('Filas por tabla:');
  resumen.forEach((linea) => console.log('  ' + linea));
  const kb = Math.round(fs.statSync(archivo).size / 1024);
  console.log(`Tamano: ${kb} KB`);
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('Fallo el respaldo:', err.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
