const { Router } = require('express');
const pool = require('./db');

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT s.*,
        COALESCE(
          (SELECT string_agg(u.nombre, ', ' ORDER BY u.nombre)
           FROM usuarios u WHERE u.sucursal_id = s.id AND u.activo = TRUE),
          ''
        ) AS empleados
      FROM sucursales s ORDER BY s.id
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const { nombre } = req.body;
  if (!nombre) return res.status(400).json({ error: 'El nombre es requerido' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO sucursales (nombre) VALUES ($1) RETURNING *', [nombre]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const { nombre, activo } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE sucursales SET
        nombre = COALESCE($1, nombre),
        activo = COALESCE($2, activo)
       WHERE id = $3 RETURNING *`,
      [nombre, activo, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Sucursal no encontrada' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('DELETE FROM sucursales WHERE id = $1 RETURNING id', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Sucursal no encontrada' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
