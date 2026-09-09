const bcrypt = require('bcryptjs');
const pool = require('../config/db');

async function verificarPasswordDueno(password) {
  const pwd = String(password ?? '');
  if (!pwd) return false;
  const { rows } = await pool.query(
    `SELECT password_hash
     FROM usuarios
     WHERE LOWER(TRIM(rol)) IN ('dueno', 'dueño', 'owner')
       AND activo IS NOT FALSE
     ORDER BY id ASC
     LIMIT 1`
  );
  if (!rows.length) return false;
  return bcrypt.compare(pwd, rows[0].password_hash);
}

// Autoriza una acción con la contraseña de cualquier admin o dueño activo.
// Devuelve al usuario que autorizó (para dejar rastro) o null si no coincide.
async function verificarPasswordAdminODueno(password) {
  const pwd = String(password ?? '');
  if (!pwd) return null;
  const { rows } = await pool.query(
    `SELECT id, nombre, rol, password_hash
     FROM usuarios
     WHERE LOWER(TRIM(rol)) IN ('dueno', 'dueño', 'owner', 'admin', 'developer')
       AND activo IS NOT FALSE
     ORDER BY id ASC`
  );
  for (const usuario of rows) {
    if (await bcrypt.compare(pwd, usuario.password_hash)) {
      return { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol };
    }
  }
  return null;
}

module.exports = { verificarPasswordDueno, verificarPasswordAdminODueno };
