const { Router } = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { normalizarRol, rolRequiereSucursal } = require('../middleware/roles');
const { listarComisionesUsuario } = require('../services/comisiones');

const router = Router();

function normalizarUsuarioLogin(raw) {
  const u = String(raw ?? '').trim().toLowerCase();
  return u || null;
}

function normalizarSucursalId(raw) {
  if (raw === '' || raw === undefined || raw === null) return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

function validarSucursalObligatoria(rol, sucursalId) {
  if (rolRequiereSucursal(rol) && sucursalId == null) {
    return 'Admin y vendedor deben tener una sucursal asignada';
  }
  return null;
}

async function validarRolUnico(rol, exceptoId = null) {
  const r = normalizarRol(rol);
  let rolesSql = null;
  let mensaje = null;
  if (r === 'dueno') {
    rolesSql = `('dueno', 'dueño', 'owner')`;
    mensaje = 'Solo puede existir un usuario con rol Dueño';
  } else if (r === 'developer') {
    rolesSql = `('developer')`;
    mensaje = 'Solo puede existir un usuario con rol Developer';
  } else {
    return null;
  }
  const vals = [];
  let sql = `SELECT id FROM usuarios WHERE LOWER(TRIM(rol)) IN ${rolesSql}`;
  if (exceptoId != null) {
    vals.push(Number(exceptoId));
    sql += ` AND id <> $1`;
  }
  sql += ' LIMIT 1';
  const { rows } = await pool.query(sql, vals);
  if (rows.length) return mensaje;
  return null;
}

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.usuario, u.nombre, u.rol, u.sucursal_id, u.activo, u.created_at,
              COALESCE(u.comision_total_acumulada, 0)::float8 AS comision_total_acumulada,
              s.nombre AS sucursal_nombre
       FROM usuarios u
       LEFT JOIN sucursales s ON u.sucursal_id = s.id
       ORDER BY
         CASE LOWER(TRIM(u.rol))
           WHEN 'dueno' THEN 0
           WHEN 'dueño' THEN 0
           WHEN 'owner' THEN 0
           WHEN 'developer' THEN 1
           WHEN 'admin' THEN 2
           WHEN 'administrador' THEN 2
           WHEN 'vendedor' THEN 3
           ELSE 9
         END,
         u.id`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const usuario = normalizarUsuarioLogin(req.body?.usuario);
  const { nombre, password, rol, sucursal_id } = req.body;
  if (!usuario || !nombre || !password) {
    return res.status(400).json({ error: 'Usuario, nombre y contraseña son requeridos' });
  }
  const rolFinal = normalizarRol(rol || 'vendedor');
  const sidFinal = normalizarSucursalId(sucursal_id);
  const errSuc = validarSucursalObligatoria(rolFinal, sidFinal);
  if (errSuc) return res.status(400).json({ error: errSuc });
  try {
    const errRolUnico = await validarRolUnico(rolFinal);
    if (errRolUnico) return res.status(400).json({ error: errRolUnico });
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO usuarios (usuario, nombre, password_hash, rol, sucursal_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, usuario, nombre, rol, sucursal_id, activo, created_at`,
      [usuario, nombre, hash, rolFinal, sidFinal]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'El usuario ya existe' });
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/comisiones', async (req, res) => {
  const usuarioId = Number(req.params.id);
  if (!Number.isFinite(usuarioId) || usuarioId <= 0) {
    return res.status(400).json({ error: 'id de usuario inválido' });
  }
  try {
    const data = await listarComisionesUsuario(pool, usuarioId);
    if (!data) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const usuarioNorm = req.body?.usuario !== undefined
    ? normalizarUsuarioLogin(req.body.usuario)
    : undefined;
  if (req.body?.usuario !== undefined && !usuarioNorm) {
    return res.status(400).json({ error: 'Usuario inválido' });
  }
  const { nombre, password, rol, activo, sucursal_id } = req.body;
  try {
    const prev = await pool.query(
      'SELECT rol, sucursal_id FROM usuarios WHERE id = $1',
      [req.params.id]
    );
    if (prev.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

    const rolFinal = normalizarRol(rol ?? prev.rows[0].rol);
    const sidFinal = sucursal_id !== undefined
      ? normalizarSucursalId(sucursal_id)
      : prev.rows[0].sucursal_id;
    const errSuc = validarSucursalObligatoria(rolFinal, sidFinal);
    if (errSuc) return res.status(400).json({ error: errSuc });
    const errRolUnico = await validarRolUnico(rolFinal, req.params.id);
    if (errRolUnico) return res.status(400).json({ error: errRolUnico });

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
      [usuarioNorm ?? null, nombre, hash, rolFinal, activo, sidFinal, req.params.id]
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
    const prev = await pool.query('SELECT id, rol FROM usuarios WHERE id = $1', [req.params.id]);
    if (prev.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (normalizarRol(prev.rows[0].rol) === 'dueno') {
      return res.status(400).json({ error: 'No se puede eliminar al usuario Dueño' });
    }
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
