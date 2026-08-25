/** Control de acceso por rol. */
const { normalizarRol, tieneAccesoCompleto } = require('./roles');

function requireRol(...rolesPermitidos) {
  const permitidos = new Set(rolesPermitidos.map((r) => normalizarRol(r)));
  return (req, res, next) => {
    const rol = normalizarRol(req.usuario?.rol);
    if (!permitidos.has(rol)) {
      return res.status(403).json({ error: 'No tienes permiso para esta acción' });
    }
    next();
  };
}

function requireAccesoCompleto(req, res, next) {
  if (!tieneAccesoCompleto(req.usuario?.rol)) {
    return res.status(403).json({ error: 'No tienes permiso para esta acción' });
  }
  next();
}

const requireAdmin = requireAccesoCompleto;

module.exports = { requireRol, requireAccesoCompleto, requireAdmin };
