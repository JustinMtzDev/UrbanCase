const { Router } = require('express');
const pool = require('../config/db');

const router = Router();

const SQL_LISTAR_TODAS_SUCURSALES = `
  SELECT pc.id, pc.nombre, pc.costo_consignacion::float8 AS costo_consignacion,
         pc.precio_venta::float8 AS precio_venta, pc.categoria,
         pc.sucursal_id, pc.created_at,
         COALESCE(s.nombre, 'Sin sucursal') AS sucursal_nombre
  FROM productos_consignados pc
  LEFT JOIN sucursales s ON s.id = pc.sucursal_id
  ORDER BY COALESCE(s.nombre, '') ASC, pc.id ASC
`;

async function obtenerConsignadosTodasLasSucursales() {
  const { rows } = await pool.query(SQL_LISTAR_TODAS_SUCURSALES);
  return rows.map((row) => ({ ...row, id_sucursal: row.sucursal_id }));
}

router.get('/inventario-todas-sucursales', async (req, res) => {
  try {
    res.json(await obtenerConsignadosTodasLasSucursales());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  let sid = req.query.sucursal_id ?? req.query.sucursalId;
  if (Array.isArray(sid)) sid = sid[0];
  const sidStr = sid != null && sid !== '' ? String(sid).trim() : '';
  const sidLower = sidStr.toLowerCase();
  if (sidLower === 'all' || sidLower === 'todas') {
    try {
      res.json(await obtenerConsignadosTodasLasSucursales());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }
  if (sidStr === '' || Number.isNaN(Number(sidStr))) {
    return res.status(400).json({
      error: 'sucursal_id es requerido (o GET /api/productos-consignados/inventario-todas-sucursales)',
    });
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, nombre, costo_consignacion::float8 AS costo_consignacion,
              precio_venta::float8 AS precio_venta, categoria,
              sucursal_id, created_at
       FROM productos_consignados
       WHERE sucursal_id = $1
       ORDER BY id`,
      [Number(sidStr)]
    );
    res.json(rows.map((row) => ({ ...row, id_sucursal: row.sucursal_id })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  let {
    nombre,
    costo_consignacion,
    costoConsignacion,
    precio_venta,
    precioVenta,
    categoria,
    sucursal_id,
    id_sucursal,
  } = req.body || {};
  const sid = sucursal_id != null ? sucursal_id : id_sucursal;
  const costo = Number(costo_consignacion != null ? costo_consignacion : costoConsignacion);
  const venta = Number(precio_venta != null ? precio_venta : precioVenta);

  if (!nombre || typeof nombre !== 'string' || nombre.trim().length === 0) {
    return res.status(400).json({ error: 'El nombre del producto es requerido' });
  }
  if (sid == null || sid === '' || Number.isNaN(Number(sid))) {
    return res.status(400).json({ error: 'sucursal_id es requerido' });
  }
  if (!Number.isFinite(costo) || costo <= 0) {
    return res.status(400).json({ error: 'costo de consignación inválido' });
  }
  if (!Number.isFinite(venta) || venta <= 0) {
    return res.status(400).json({ error: 'precio de venta inválido' });
  }
  if (Math.round(costo * 100) > Math.round(venta * 100)) {
    return res.status(400).json({ error: 'El costo de consignación no puede ser mayor al precio de venta' });
  }

  const catNorm = categoria ? String(categoria).trim().slice(0, 80) : null;
  try {
    const check = await pool.query('SELECT 1 FROM sucursales WHERE id = $1', [Number(sid)]);
    if (check.rows.length === 0) return res.status(400).json({ error: 'Sucursal no válida' });
    const { rows } = await pool.query(
      `INSERT INTO productos_consignados
         (sucursal_id, nombre, costo_consignacion, precio_venta, categoria)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, nombre, costo_consignacion::float8 AS costo_consignacion,
                 precio_venta::float8 AS precio_venta, categoria,
                 sucursal_id, created_at`,
      [Number(sid), nombre.trim(), costo, venta, catNorm]
    );
    const row = rows[0];
    res.status(201).json({ ...row, id_sucursal: row.sucursal_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });
  let {
    nombre,
    costo_consignacion,
    costoConsignacion,
    precio_venta,
    precioVenta,
    categoria,
  } = req.body || {};

  try {
    const set = [];
    const vals = [];
    let idx = 1;

    if (nombre != null) {
      const n = String(nombre).trim();
      if (!n) return res.status(400).json({ error: 'nombre inválido' });
      set.push(`nombre = $${idx++}`);
      vals.push(n);
    }
    if (costo_consignacion != null || costoConsignacion != null) {
      const costo = Number(costo_consignacion != null ? costo_consignacion : costoConsignacion);
      if (!Number.isFinite(costo) || costo <= 0) {
        return res.status(400).json({ error: 'costo de consignación inválido' });
      }
      set.push(`costo_consignacion = $${idx++}`);
      vals.push(costo);
    }
    if (precio_venta != null || precioVenta != null) {
      const venta = Number(precio_venta != null ? precio_venta : precioVenta);
      if (!Number.isFinite(venta) || venta <= 0) {
        return res.status(400).json({ error: 'precio de venta inválido' });
      }
      set.push(`precio_venta = $${idx++}`);
      vals.push(venta);
    }
    if (categoria !== undefined) {
      set.push(`categoria = $${idx++}`);
      vals.push(categoria ? String(categoria).trim().slice(0, 80) : null);
    }
    if (set.length === 0) return res.status(400).json({ error: 'Sin campos para actualizar' });

    const { rows: existentes } = await pool.query(
      'SELECT costo_consignacion, precio_venta FROM productos_consignados WHERE id = $1',
      [id]
    );
    if (existentes.length === 0) return res.status(404).json({ error: 'Producto consignado no encontrado' });

    const costoFinal = (costo_consignacion != null || costoConsignacion != null)
      ? Number(costo_consignacion != null ? costo_consignacion : costoConsignacion)
      : Number(existentes[0].costo_consignacion);
    const ventaFinal = (precio_venta != null || precioVenta != null)
      ? Number(precio_venta != null ? precio_venta : precioVenta)
      : Number(existentes[0].precio_venta);
    if (Math.round(costoFinal * 100) > Math.round(ventaFinal * 100)) {
      return res.status(400).json({ error: 'El costo de consignación no puede ser mayor al precio de venta' });
    }

    vals.push(id);
    const { rows } = await pool.query(
      `UPDATE productos_consignados SET ${set.join(', ')} WHERE id = $${idx}
       RETURNING id, nombre, costo_consignacion::float8 AS costo_consignacion,
                 precio_venta::float8 AS precio_venta, categoria,
                 sucursal_id, created_at`,
      vals
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Producto consignado no encontrado' });

    const row = rows[0];
    res.json({ ...row, id_sucursal: row.sucursal_id });
  } catch (err) {
    if (err.code === '23514') {
      return res.status(400).json({ error: 'El costo de consignación no puede ser mayor al precio de venta' });
    }
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });
  try {
    const { rows } = await pool.query(
      'DELETE FROM productos_consignados WHERE id = $1 RETURNING id',
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Producto consignado no encontrado' });
    res.json({ ok: true, id: rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
