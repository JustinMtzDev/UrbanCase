/** Roles con acceso completo al sistema (sin restricciones de vendedor). */
const ROLES_ACCESO_COMPLETO = new Set(['admin', 'developer', 'dueno', 'dueño']);

function normalizarRol(rol) {
  const r = String(rol || '').trim().toLowerCase();
  if (r === 'dueño' || r === 'owner') return 'dueno';
  return r;
}

function tieneAccesoCompleto(rol) {
  return ROLES_ACCESO_COMPLETO.has(normalizarRol(rol));
}

function rolRequiereSucursal(rol) {
  const r = normalizarRol(rol);
  return r === 'admin' || r === 'vendedor';
}

/** El vendedor solo opera sobre la sucursal que tiene asignada en su sesión. */
function sucursalPermitida(usuario, sucursalId) {
  if (tieneAccesoCompleto(usuario?.rol)) return true;
  return Number(sucursalId) === Number(usuario?.sucursal_id);
}

module.exports = {
  ROLES_ACCESO_COMPLETO,
  normalizarRol,
  tieneAccesoCompleto,
  rolRequiereSucursal,
  sucursalPermitida,
};
