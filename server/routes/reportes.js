const { Router } = require('express');
const pool = require('../config/db');

const router = Router();

router.get('/movimientos-inventario', async (req, res) => {
  const limitRaw = Number(req.query.limit);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 1000) : 300;
  const q = String(req.query.q || '').trim();
  const filtros = [
    `(
      im.movimiento = 'devolucion'
      OR im.movimiento = 'restock_rapido'
      OR (im.movimiento = 'entrada_mercancia' AND COALESCE(im.detalle->>'motivo', '') = 'restock_rapido')
    )`,
  ];
  const vals = [];
  let idx = 1;

  if (q) {
    filtros.push(`(
      im.producto_nombre ILIKE $${idx}
      OR im.movimiento ILIKE $${idx}
      OR COALESCE(im.detalle::text, '') ILIKE $${idx}
      OR COALESCE(u.nombre, '') ILIKE $${idx}
      OR COALESCE(s.nombre, '') ILIKE $${idx}
    )`);
    vals.push(`%${q}%`);
    idx++;
  }

  vals.push(limit);
  const where = `WHERE ${filtros.join(' AND ')}`;

  try {
    const { rows } = await pool.query(
      `SELECT
         im.id,
         im.created_at,
         im.producto_id,
         im.producto_nombre,
         im.movimiento,
         im.cantidad,
         im.detalle,
         im.usuario_id,
         COALESCE(u.nombre, 'Sistema') AS usuario_nombre,
         im.sucursal_id,
         COALESCE(s.nombre, 'Sin sucursal') AS sucursal_nombre
       FROM inventario_movimientos im
       LEFT JOIN usuarios u ON u.id = im.usuario_id
       LEFT JOIN sucursales s ON s.id = im.sucursal_id
       ${where}
       ORDER BY im.created_at DESC, im.id DESC
       LIMIT $${idx}`,
      vals
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/transferencias-sucursales', async (req, res) => {
  const limitRaw = Number(req.query.limit);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 1000) : 300;
  const q = String(req.query.q || '').trim();
  const filtros = [];
  const vals = [];
  let idx = 1;

  if (q) {
    filtros.push(`(
      COALESCE(po.nombre, pd.nombre, '') ILIKE $${idx}
      OR COALESCE(u.nombre, '') ILIKE $${idx}
      OR COALESCE(so.nombre, '') ILIKE $${idx}
      OR COALESCE(sd.nombre, '') ILIKE $${idx}
    )`);
    vals.push(`%${q}%`);
    idx++;
  }

  vals.push(limit);
  const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';

  try {
    const { rows } = await pool.query(
      `SELECT
         t.id,
         t.created_at,
         t.cantidad,
         t.producto_origen_id,
         t.producto_destino_id,
         COALESCE(po.nombre, pd.nombre, 'Sin nombre') AS producto_nombre,
         t.sucursal_origen_id,
         COALESCE(so.nombre, 'Sin sucursal') AS sucursal_origen_nombre,
         t.sucursal_destino_id,
         COALESCE(sd.nombre, 'Sin sucursal') AS sucursal_destino_nombre,
         t.usuario_id,
         COALESCE(u.nombre, 'Sistema') AS usuario_nombre
       FROM inventario_traslados t
       LEFT JOIN productos po ON po.id = t.producto_origen_id
       LEFT JOIN productos pd ON pd.id = t.producto_destino_id
       LEFT JOIN sucursales so ON so.id = t.sucursal_origen_id
       LEFT JOIN sucursales sd ON sd.id = t.sucursal_destino_id
       LEFT JOIN usuarios u ON u.id = t.usuario_id
       ${where}
       ORDER BY t.created_at DESC, t.id DESC
       LIMIT $${idx}`,
      vals
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/historial-productos', async (req, res) => {
  const limitRaw = Number(req.query.limit);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 1000) : 300;
  const q = String(req.query.q || '').trim();
  const filtros = [];
  const vals = [];
  let idx = 1;

  if (q) {
    filtros.push(`(
      ph.producto_nombre ILIKE $${idx}
      OR ph.accion ILIKE $${idx}
      OR COALESCE(ph.campo, '') ILIKE $${idx}
      OR COALESCE(ph.valor_anterior, '') ILIKE $${idx}
      OR COALESCE(ph.valor_nuevo, '') ILIKE $${idx}
      OR COALESCE(ph.detalle::text, '') ILIKE $${idx}
      OR COALESCE(u.nombre, '') ILIKE $${idx}
      OR COALESCE(s.nombre, '') ILIKE $${idx}
    )`);
    vals.push(`%${q}%`);
    idx++;
  }

  const accionFiltro = String(req.query.accion || '').trim().toLowerCase();
  const accionesValidas = new Set(['alta', 'edicion', 'eliminacion']);
  if (accionFiltro && accionesValidas.has(accionFiltro)) {
    filtros.push(`ph.accion = $${idx}`);
    vals.push(accionFiltro);
    idx++;
  }

  vals.push(limit);
  const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';

  try {
    const { rows } = await pool.query(
      `SELECT
         ph.id,
         ph.created_at,
         ph.producto_id,
         ph.producto_nombre,
         ph.accion,
         ph.campo,
         ph.valor_anterior,
         ph.valor_nuevo,
         ph.detalle,
         ph.usuario_id,
         COALESCE(u.nombre, 'Sistema') AS usuario_nombre,
         ph.sucursal_id,
         COALESCE(s.nombre, 'Sin sucursal') AS sucursal_nombre,
         p.costo_compra::float8 AS producto_costo_compra,
         p.precio::float8 AS producto_precio,
         p.precio_max::float8 AS producto_precio_max,
         p.stock AS producto_stock
       FROM productos_historial ph
       LEFT JOIN usuarios u ON u.id = ph.usuario_id
       LEFT JOIN sucursales s ON s.id = ph.sucursal_id
       LEFT JOIN productos p ON p.id = ph.producto_id
       ${where}
       ORDER BY ph.created_at DESC, ph.id DESC
       LIMIT $${idx}`,
      vals
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/corte-caja', async (req, res) => {
  const limitRaw = Number(req.query.limit);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 1000) : 300;
  const q = String(req.query.q || '').trim();
  const periodoRaw = String(req.query.periodo || 'diario').trim().toLowerCase();
  const periodosValidos = new Set(['diario', 'semanal', 'mensual', 'anual']);
  const periodo = periodosValidos.has(periodoRaw) ? periodoRaw : 'diario';
  const fechaRaw = String(req.query.fecha || '').trim();
  const filtros = [];
  const vals = [];
  let idx = 1;

  if (q) {
    filtros.push(`(
      CAST(v.id AS TEXT) ILIKE $${idx}
      OR COALESCE(v.metodo_pago, '') ILIKE $${idx}
      OR COALESCE(u.nombre, '') ILIKE $${idx}
      OR COALESCE(s.nombre, '') ILIKE $${idx}
    )`);
    vals.push(`%${q}%`);
    idx++;
  }

  let fechaExpr = `((NOW() AT TIME ZONE 'America/Mexico_City')::date)`;
  if (fechaRaw) {
    const fechaValida = /^\d{4}-\d{2}-\d{2}$/.test(fechaRaw);
    if (!fechaValida) {
      return res.status(400).json({ error: 'fecha debe tener formato YYYY-MM-DD' });
    }
    fechaExpr = `$${idx}::date`;
    vals.push(fechaRaw);
    idx++;
  }

  const tsVenta = `(v.created_at AT TIME ZONE 'America/Mexico_City')`;
  if (periodo === 'semanal') {
    filtros.push(`
      ${tsVenta} >= date_trunc('week', ${fechaExpr}::timestamp)
      AND ${tsVenta} < (date_trunc('week', ${fechaExpr}::timestamp) + INTERVAL '1 week')
    `);
  } else if (periodo === 'mensual') {
    filtros.push(`
      ${tsVenta} >= date_trunc('month', ${fechaExpr}::timestamp)
      AND ${tsVenta} < (date_trunc('month', ${fechaExpr}::timestamp) + INTERVAL '1 month')
    `);
  } else if (periodo === 'anual') {
    filtros.push(`
      ${tsVenta} >= date_trunc('year', ${fechaExpr}::timestamp)
      AND ${tsVenta} < (date_trunc('year', ${fechaExpr}::timestamp) + INTERVAL '1 year')
    `);
  } else {
    filtros.push(`
      ${tsVenta} >= ${fechaExpr}::timestamp
      AND ${tsVenta} < (${fechaExpr}::timestamp + INTERVAL '1 day')
    `);
  }

  vals.push(limit);
  const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';

  try {
    const { rows } = await pool.query(
      `SELECT
         v.id,
         v.created_at,
         v.subtotal::float8 AS subtotal,
         v.total::float8 AS total,
         COALESCE(v.metodo_pago, 'efectivo') AS metodo_pago,
         v.usuario_id,
         COALESCE(u.nombre, 'Sistema') AS usuario_nombre,
         v.sucursal_id,
         COALESCE(s.nombre, 'Sin sucursal') AS sucursal_nombre
       FROM ventas v
       LEFT JOIN usuarios u ON u.id = v.usuario_id
       LEFT JOIN sucursales s ON s.id = v.sucursal_id
       ${where}
       ORDER BY v.created_at DESC, v.id DESC
       LIMIT $${idx}`,
      vals
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
