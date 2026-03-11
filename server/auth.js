const { Router } = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('./db');

const router = Router();
const sessions = new Map();

router.post('/login', async (req, res) => {
  const { usuario, password } = req.body;
  if (!usuario || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT * FROM usuarios WHERE usuario = $1 AND activo = TRUE',
      [usuario]
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, {
      id: user.id,
      usuario: user.usuario,
      nombre: user.nombre,
      rol: user.rol,
    });

    res.json({
      token,
      usuario: { id: user.id, usuario: user.usuario, nombre: user.nombre, rol: user.rol },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/logout', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) sessions.delete(token);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  res.json(sessions.get(token));
});

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  req.usuario = sessions.get(token);
  next();
}

module.exports = { router, authMiddleware };
