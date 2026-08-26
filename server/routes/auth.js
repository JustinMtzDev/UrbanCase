const { Router } = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { sessions, crearSesion, obtenerSesion } = require('../middleware/auth');
const { responderError } = require('../middleware/errors');
const { loginRateLimiter } = require('../middleware/login-limiter');

const router = Router();

function mapUsuarioPerfil(row) {
  if (!row) return null;
  const rawSid = row.sucursal_id;
  const sid = rawSid != null && String(rawSid).trim() !== ''
    ? parseInt(String(rawSid), 10)
    : null;
  return {
    id: row.id,
    usuario: row.usuario,
    nombre: row.nombre,
    rol: row.rol,
    sucursal_id: Number.isFinite(sid) ? sid : null,
    sucursal_nombre: row.sucursal_nombre || null,
  };
}

router.post('/login', loginRateLimiter, async (req, res) => {
  const usuarioLogin = String(req.body?.usuario ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');
  if (!usuarioLogin || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.usuario, u.nombre, u.rol, u.password_hash, u.sucursal_id,
              s.nombre AS sucursal_nombre
       FROM usuarios u
       LEFT JOIN sucursales s ON s.id = u.sucursal_id
       WHERE lower(u.usuario) = $1 AND u.activo = TRUE`,
      [usuarioLogin]
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const sesion = crearSesion(user);
    res.json({ token: sesion.token, usuario: mapUsuarioPerfil(user) });
  } catch (err) {
    return responderError(res, err, 500, 'Error al iniciar sesión');
  }
});

router.post('/logout', (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim();
  if (token) sessions.delete(token);
  res.json({ ok: true });
});

router.get('/me', async (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim();
  const sesion = obtenerSesion(token);
  if (!sesion) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.usuario, u.nombre, u.rol, u.sucursal_id, s.nombre AS sucursal_nombre
       FROM usuarios u
       LEFT JOIN sucursales s ON s.id = u.sucursal_id
       WHERE u.id = $1 AND u.activo = TRUE`,
      [sesion.id]
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: 'No autenticado' });
    }
    const perfil = mapUsuarioPerfil(rows[0]);
    sesion.sucursal_id = perfil.sucursal_id;
    sesion.sucursal_nombre = perfil.sucursal_nombre;
    res.json(perfil);
  } catch (err) {
    return responderError(res, err, 500, 'Error al obtener sesión');
  }
});

module.exports = router;
