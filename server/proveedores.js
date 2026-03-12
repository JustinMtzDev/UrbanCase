const { Router } = require('express');
const pool = require('./db');

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM proveedores ORDER BY id'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function validarProveedor(body) {
  if (!body.nombre) return 'El nombre es requerido';
  if (body.telefono && !/^\d{10}$/.test(body.telefono)) return 'El teléfono debe tener exactamente 10 dígitos (sin letras)';
  if (body.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.correo)) return 'Ingresa un correo electrónico válido';
  if (body.rfc && !/^([A-ZÑ&]{3,4})\d{6}([A-Z0-9]{3})$/.test((body.rfc || '').replace(/\s/g, '').toUpperCase())) return 'El RFC debe tener formato: 3-4 letras + 6 dígitos + 3 caracteres';
  return null;
}

router.post('/', async (req, res) => {
  const { nombre, rfc, telefono, correo, direccion } = req.body;
  const err = validarProveedor(req.body);
  if (err) return res.status(400).json({ error: err });
  const rfcNorm = rfc ? rfc.replace(/\s/g, '').toUpperCase() : null;
  try {
    const { rows } = await pool.query(
      `INSERT INTO proveedores (nombre, rfc, telefono, correo, direccion)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [nombre, rfcNorm, telefono || null, correo || null, direccion || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const { nombre, rfc, telefono, correo, direccion } = req.body;
  const err = validarProveedor(req.body);
  if (err) return res.status(400).json({ error: err });
  const rfcNorm = rfc ? rfc.replace(/\s/g, '').toUpperCase() : null;
  try {
    const { rows } = await pool.query(
      `UPDATE proveedores SET
        nombre = COALESCE($1, nombre),
        rfc = COALESCE($2, rfc),
        telefono = COALESCE($3, telefono),
        correo = COALESCE($4, correo),
        direccion = COALESCE($5, direccion)
       WHERE id = $6 RETURNING *`,
      [nombre, rfcNorm, telefono, correo, direccion, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Proveedor no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('DELETE FROM proveedores WHERE id = $1 RETURNING id', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Proveedor no encontrado' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
