const { Router } = require('express');
const pool = require('../config/db');

const router = Router();

router.get('/movimientos-inventario', async (req, res) => {
  const limitRaw = Number(req.query.limit);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 1000) : 300;
  const q = String(req.query.q || '').trim();
  const filtros = [];
  const vals = [];
  let idx = 1;

  if (q) {
    filtros.push(`(
      im.producto_nombre ILIKE $${idx}
      OR im.movimiento ILIKE $${idx}
      OR COALESCE(u.nombre, '') ILIKE $${idx}
      OR COALESCE(s.nombre, '') ILIKE $${idx}
    )`);
    vals.push(`%${q}%`);
    idx++;
  }

  vals.push(limit);
  const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';

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
         COALESCE(s.nombre, 'Sin sucursal') AS sucursal_nombre
       FROM productos_historial ph
       LEFT JOIN usuarios u ON u.id = ph.usuario_id
       LEFT JOIN sucursales s ON s.id = ph.sucursal_id
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

module.exports = router;
