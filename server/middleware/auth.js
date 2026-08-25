const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS) || 12 * 60 * 60 * 1000; // 12 h
const sessions = new Map();

function limpiarSesionesExpiradas() {
  const ahora = Date.now();
  for (const [token, sesion] of sessions.entries()) {
    if (!sesion?.expiresAt || sesion.expiresAt <= ahora) sessions.delete(token);
  }
}

function obtenerSesion(token) {
  if (!token) return null;
  limpiarSesionesExpiradas();
  const sesion = sessions.get(token);
  if (!sesion) return null;
  if (sesion.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return sesion;
}

function crearSesion(usuario) {
  const crypto = require('crypto');
  const token = crypto.randomBytes(32).toString('hex');
  const rawSid = usuario.sucursal_id;
  const sucursalId = rawSid != null && String(rawSid).trim() !== ''
    ? parseInt(String(rawSid), 10)
    : null;
  const datos = {
    id: usuario.id,
    usuario: usuario.usuario,
    nombre: usuario.nombre,
    rol: usuario.rol,
    sucursal_id: Number.isFinite(sucursalId) ? sucursalId : null,
    sucursal_nombre: usuario.sucursal_nombre || null,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  sessions.set(token, datos);
  return {
    token,
    usuario: {
      id: datos.id,
      usuario: datos.usuario,
      nombre: datos.nombre,
      rol: datos.rol,
      sucursal_id: datos.sucursal_id,
      sucursal_nombre: datos.sucursal_nombre,
    },
  };
}

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim();
  const sesion = obtenerSesion(token);
  if (!sesion) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  req.usuario = {
    id: sesion.id,
    usuario: sesion.usuario,
    nombre: sesion.nombre,
    rol: sesion.rol,
    sucursal_id: sesion.sucursal_id ?? null,
    sucursal_nombre: sesion.sucursal_nombre ?? null,
  };
  req.token = token;
  next();
}

module.exports = {
  authMiddleware,
  sessions,
  crearSesion,
  obtenerSesion,
  limpiarSesionesExpiradas,
  SESSION_TTL_MS,
};
