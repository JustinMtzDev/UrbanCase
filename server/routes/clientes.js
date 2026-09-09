const { Router } = require('express');
const pool = require('../config/db');
const { requireAdmin } = require('../middleware/rbac');
const { responderError } = require('../middleware/errors');

const router = Router();

// Límites de las columnas: clientes.nombre VARCHAR(200), telefono VARCHAR(50),
// correo VARCHAR(254); cliente_precios.categoria VARCHAR(40), nombre VARCHAR(200).
const CLIENTE_NOMBRE_MAX = 200;
const CLIENTE_TELEFONO_MAX = 50;
const CLIENTE_CORREO_MAX = 254;
const PRECIO_CATEGORIA_MAX = 40;
const PRECIO_NOMBRE_MAX = 200;
// NUMERIC(12,2) desborda (22003) a partir de 10^10.
const PRECIO_MAXIMO = 9999999999.99;

function parseIdParam(raw) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function recortar(valor, max) {
  if (valor == null) return valor;
  return String(valor).slice(0, max);
}

function errorCliente(req, res, err) {
  console.error('Clientes', req.originalUrl, err);
  return responderError(res, err);
}

function validarPrecioEspecial(body) {
  const categoria = String(body?.categoria || '').trim().slice(0, PRECIO_CATEGORIA_MAX);
  const nombre = String(body?.nombre || '').trim().replace(/\s+/g, ' ').slice(0, PRECIO_NOMBRE_MAX);
  const precio = Number(body?.precio);
  if (!categoria) return { error: 'La categoría del producto es requerida' };
  if (!nombre) return { error: 'El nombre del producto es requerido' };
  if (!Number.isFinite(precio) || precio <= 0) return { error: 'El precio debe ser mayor a 0' };
  if (precio > PRECIO_MAXIMO) return { error: 'El precio es demasiado alto' };
  return { datos: { categoria, nombre, precio: Math.round(precio * 100) / 100 } };
}

function validarCliente(body) {
  if (!body.nombre) return 'El nombre es requerido';
  if (body.telefono && !/^\d{10}$/.test(body.telefono)) return 'El teléfono debe tener exactamente 10 dígitos (sin letras)';
  if (body.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.correo)) return 'Ingresa un correo electrónico válido';
  return null;
}

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM clientes ORDER BY id');
    res.json(rows);
  } catch (err) {
    return errorCliente(req, res, err);
  }
});

router.post('/', async (req, res) => {
  const { nombre, telefono, correo, direccion } = req.body;
  const err = validarCliente(req.body);
  if (err) return res.status(400).json({ error: err });
  try {
    const { rows } = await pool.query(
      `INSERT INTO clientes (nombre, telefono, correo, direccion)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [
        recortar(nombre, CLIENTE_NOMBRE_MAX),
        recortar(telefono, CLIENTE_TELEFONO_MAX) || null,
        recortar(correo, CLIENTE_CORREO_MAX) || null,
        direccion || null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    return errorCliente(req, res, err);
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  const clienteId = parseIdParam(req.params.id);
  if (clienteId == null) return res.status(400).json({ error: 'id de cliente inválido' });
  const { nombre, telefono, correo, direccion } = req.body;
  const err = validarCliente(req.body);
  if (err) return res.status(400).json({ error: err });
  try {
    const { rows } = await pool.query(
      `UPDATE clientes SET
        nombre = COALESCE($1, nombre),
        telefono = COALESCE($2, telefono),
        correo = COALESCE($3, correo),
        direccion = COALESCE($4, direccion)
       WHERE id = $5 RETURNING *`,
      [
        recortar(nombre, CLIENTE_NOMBRE_MAX),
        recortar(telefono, CLIENTE_TELEFONO_MAX),
        recortar(correo, CLIENTE_CORREO_MAX),
        direccion,
        clienteId,
      ]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    return errorCliente(req, res, err);
  }
});

// ---------- Precios especiales por cliente ----------

router.get('/:id/precios', async (req, res) => {
  const clienteId = parseIdParam(req.params.id);
  if (clienteId == null) return res.status(400).json({ error: 'id de cliente inválido' });
  try {
    const { rows } = await pool.query(
      `SELECT id, cliente_id, categoria, nombre, precio::float8 AS precio
       FROM cliente_precios WHERE cliente_id = $1
       ORDER BY categoria, nombre`,
      [clienteId]
    );
    res.json(rows);
  } catch (err) {
    return errorCliente(req, res, err);
  }
});

router.post('/:id/precios', requireAdmin, async (req, res) => {
  const clienteId = parseIdParam(req.params.id);
  if (clienteId == null) return res.status(400).json({ error: 'id de cliente inválido' });
  const { error, datos } = validarPrecioEspecial(req.body);
  if (error) return res.status(400).json({ error });
  try {
    const cliente = await pool.query('SELECT id FROM clientes WHERE id = $1', [clienteId]);
    if (!cliente.rows.length) return res.status(404).json({ error: 'Cliente no encontrado' });
    const { rows } = await pool.query(
      `INSERT INTO cliente_precios (cliente_id, categoria, nombre, precio)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (cliente_id, lower(btrim(categoria)), lower(btrim(nombre)))
       DO UPDATE SET precio = EXCLUDED.precio, nombre = EXCLUDED.nombre, updated_at = NOW()
       RETURNING id, cliente_id, categoria, nombre, precio::float8 AS precio`,
      [clienteId, datos.categoria, datos.nombre, datos.precio]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    return errorCliente(req, res, err);
  }
});

router.delete('/:id/precios/:precioId', requireAdmin, async (req, res) => {
  const clienteId = parseIdParam(req.params.id);
  const precioId = parseIdParam(req.params.precioId);
  if (clienteId == null) return res.status(400).json({ error: 'id de cliente inválido' });
  if (precioId == null) return res.status(400).json({ error: 'id de precio inválido' });
  try {
    const { rows } = await pool.query(
      'DELETE FROM cliente_precios WHERE id = $1 AND cliente_id = $2 RETURNING id',
      [precioId, clienteId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Precio especial no encontrado' });
    res.json({ ok: true });
  } catch (err) {
    return errorCliente(req, res, err);
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const clienteId = parseIdParam(req.params.id);
  if (clienteId == null) return res.status(400).json({ error: 'id de cliente inválido' });
  try {
    const { rows } = await pool.query('DELETE FROM clientes WHERE id = $1 RETURNING id', [clienteId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json({ ok: true });
  } catch (err) {
    return errorCliente(req, res, err);
  }
});

module.exports = router;
