const { Router } = require('express');
const bcrypt = require('bcryptjs');
const pool = require('./db');

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.usuario, u.nombre, u.rol, u.sucursal_id, u.activo, u.created_at,
              s.nombre AS sucursal_nombre
       FROM usuarios u
       LEFT JOIN sucursales s ON u.sucursal_id = s.id
       ORDER BY u.id`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const { usuario, nombre, password, rol, sucursal_id } = req.body;
  if (!usuario || !nombre || !password) {
    return res.status(400).json({ error: 'Usuario, nombre y contraseña son requeridos' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO usuarios (usuario, nombre, password_hash, rol, sucursal_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, usuario, nombre, rol, sucursal_id, activo, created_at`,
      [usuario, nombre, hash, rol || 'vendedor', sucursal_id || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'El usuario ya existe' });
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const { usuario, nombre, password, rol, activo, sucursal_id } = req.body;
  try {
    let hash = null;
    if (password) hash = await bcrypt.hash(password, 10);

    const { rows } = await pool.query(
      `UPDATE usuarios SET
        usuario = COALESCE($1, usuario),
        nombre = COALESCE($2, nombre),
        password_hash = COALESCE($3, password_hash),
        rol = COALESCE($4, rol),
        activo = COALESCE($5, activo),
        sucursal_id = $6
       WHERE id = $7
       RETURNING id, usuario, nombre, rol, sucursal_id, activo, created_at`,
      [usuario, nombre, hash, rol, activo, sucursal_id ?? null, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'El usuario ya existe' });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'DELETE FROM usuarios WHERE id = $1 RETURNING id', [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
