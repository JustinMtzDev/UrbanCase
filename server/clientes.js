const { Router } = require('express');
const pool = require('./db');

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM clientes ORDER BY id'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function validarCliente(body) {
  if (!body.nombre) return 'El nombre es requerido';
  if (body.telefono && !/^\d{10}$/.test(body.telefono)) return 'El teléfono debe tener exactamente 10 dígitos (sin letras)';
  if (body.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.correo)) return 'Ingresa un correo electrónico válido';
  return null;
}

router.post('/', async (req, res) => {
  const { nombre, telefono, correo, direccion } = req.body;
  const err = validarCliente(req.body);
  if (err) return res.status(400).json({ error: err });
  try {
    const { rows } = await pool.query(
      `INSERT INTO clientes (nombre, telefono, correo, direccion)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [nombre, telefono || null, correo || null, direccion || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
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
      [nombre, telefono, correo, direccion, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('DELETE FROM clientes WHERE id = $1 RETURNING id', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
