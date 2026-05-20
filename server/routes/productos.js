const { Router } = require('express');
const pool = require('../config/db');

const router = Router();

const SQL_LISTAR_TODAS_SUCURSALES = `
  SELECT p.id, p.nombre, p.precio::float8 AS precio, p.stock, p.categoria, p.imagen, p.sucursal_id,
         p.created_at, COALESCE(s.nombre, 'Sin sucursal') AS sucursal_nombre
  FROM productos p
  LEFT JOIN sucursales s ON s.id = p.sucursal_id
  ORDER BY COALESCE(s.nombre, '') ASC, p.id ASC
`;

async function obtenerProductosTodasLasSucursales() {
  const { rows } = await pool.query(SQL_LISTAR_TODAS_SUCURSALES);
  return rows.map((row) => ({ ...row, id_sucursal: row.sucursal_id }));
}

/** Sin query string: evita que proxies o clientes pierdan sucursal_id=all */
router.get('/inventario-todas-sucursales', async (req, res) => {
  try {
    res.json(await obtenerProductosTodasLasSucursales());
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
      res.json(await obtenerProductosTodasLasSucursales());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }
  if (sidStr === '' || Number.isNaN(Number(sidStr))) {
    return res.status(400).json({
      error: 'sucursal_id es requerido para listar productos (o GET /api/productos/inventario-todas-sucursales)',
    });
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, nombre, precio::float8 AS precio, stock, categoria, imagen, sucursal_id,
              created_at
       FROM productos
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
  let { nombre, precio, stock, categoria, imagen, sucursal_id, id_sucursal } = req.body || {};
  const sid = sucursal_id != null ? sucursal_id : id_sucursal;
  if (!nombre || typeof nombre !== 'string' || nombre.trim().length === 0) {
    return res.status(400).json({ error: 'El nombre del producto es requerido' });
  }
  if (sid == null || sid === '' || Number.isNaN(Number(sid))) {
    return res.status(400).json({ error: 'sucursal_id es requerido' });
  }
  const precioNum = Number(precio);
  const stockNum = parseInt(stock, 10);
  if (!Number.isFinite(precioNum) || precioNum <= 0) {
    return res.status(400).json({ error: 'precio inválido' });
  }
  if (!Number.isFinite(stockNum) || stockNum < 0) {
    return res.status(400).json({ error: 'stock inválido' });
  }
  const catNorm = categoria ? String(categoria).trim().slice(0, 80) : null;
  try {
    const check = await pool.query('SELECT 1 FROM sucursales WHERE id = $1', [Number(sid)]);
    if (check.rows.length === 0) return res.status(400).json({ error: 'Sucursal no válida' });
    const img = typeof imagen === 'string' && imagen.length > 500000 ? null : imagen || null;
    const { rows } = await pool.query(
      `INSERT INTO productos (sucursal_id, nombre, precio, stock, categoria, imagen)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, nombre, precio::float8 AS precio, stock, categoria, imagen, sucursal_id, created_at`,
      [Number(sid), nombre.trim(), precioNum, stockNum, catNorm, img]
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
  const { nombre, precio, stock, categoria, imagen } = req.body || {};
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
    if (precio != null) {
      const precioNum = Number(precio);
      if (!Number.isFinite(precioNum) || precioNum <= 0) return res.status(400).json({ error: 'precio inválido' });
      set.push(`precio = $${idx++}`);
      vals.push(precioNum);
    }
    if (stock != null) {
      const stockNum = parseInt(stock, 10);
      if (!Number.isFinite(stockNum) || stockNum < 0) return res.status(400).json({ error: 'stock inválido' });
      set.push(`stock = $${idx++}`);
      vals.push(stockNum);
    }
    if (categoria !== undefined) {
      set.push(`categoria = $${idx++}`);
      vals.push(categoria ? String(categoria).slice(0, 80) : null);
    }
    if (imagen !== undefined) {
      const img = typeof imagen === 'string' && imagen.length > 500000 ? null : imagen || null;
      set.push(`imagen = $${idx++}`);
      vals.push(img);
    }
    if (set.length === 0) return res.status(400).json({ error: 'Sin campos para actualizar' });
    vals.push(id);
    const { rows } = await pool.query(
      `UPDATE productos SET ${set.join(', ')} WHERE id = $${idx}
       RETURNING id, nombre, precio::float8 AS precio, stock, categoria, imagen, sucursal_id, created_at`,
      vals
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Producto no encontrado' });
    const row = rows[0];
    res.json({ ...row, id_sucursal: row.sucursal_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });
  try {
    const { rows } = await pool.query('DELETE FROM productos WHERE id = $1 RETURNING id', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
