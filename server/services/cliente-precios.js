const pool = require('../config/db');

// El producto se identifica por categoría + nombre porque en `productos` hay una
// fila por sucursal y por variante de precio.
function clavePrecioCliente(categoria, nombre) {
  const cat = String(categoria || '').trim().toLowerCase();
  const nom = String(nombre || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return `${cat}|${nom}`;
}

async function obtenerMapaPreciosCliente(executor, clienteId) {
  const id = Number(clienteId);
  if (!Number.isFinite(id) || id <= 0) return new Map();
  const runner = executor || pool;
  const { rows } = await runner.query(
    'SELECT categoria, nombre, precio::float8 AS precio FROM cliente_precios WHERE cliente_id = $1',
    [id]
  );
  const mapa = new Map();
  for (const r of rows) {
    const precio = Number(r.precio);
    if (Number.isFinite(precio) && precio > 0) {
      mapa.set(clavePrecioCliente(r.categoria, r.nombre), precio);
    }
  }
  return mapa;
}

async function obtenerClienteVenta(executor, clienteId) {
  const id = Number(clienteId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const runner = executor || pool;
  const { rows } = await runner.query('SELECT id, nombre FROM clientes WHERE id = $1', [id]);
  if (!rows.length) throw new Error('Cliente no válido');
  return rows[0];
}

function precioEspecialParaProducto(mapa, producto) {
  if (!mapa || mapa.size === 0) return null;
  const precio = mapa.get(clavePrecioCliente(producto?.categoria, producto?.nombre));
  return Number.isFinite(precio) && precio > 0 ? precio : null;
}

module.exports = {
  clavePrecioCliente,
  obtenerMapaPreciosCliente,
  obtenerClienteVenta,
  precioEspecialParaProducto,
};
