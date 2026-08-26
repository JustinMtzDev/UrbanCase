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

module.exports = { verificarPasswordDueno };
