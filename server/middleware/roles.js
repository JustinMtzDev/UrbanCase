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

module.exports = {
  ROLES_ACCESO_COMPLETO,
  normalizarRol,
  tieneAccesoCompleto,
  rolRequiereSucursal,
};
