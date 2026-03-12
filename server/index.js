const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { router: authRouter, authMiddleware } = require('./auth');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: 'conectada', message: 'Servidor activo' });
  } catch (err) {
    res.status(503).json({ ok: false, db: 'error', message: err.message });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/usuarios', authMiddleware, require('./usuarios'));
app.use('/api/sucursales', authMiddleware, require('./sucursales'));
app.use('/api/clientes', authMiddleware, require('./clientes'));
app.use('/api/proveedores', authMiddleware, require('./proveedores'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'login.html'));
});

app.use(express.static(path.join(__dirname, '..')));

app.listen(PORT, () => {
  console.log(`UrbanCase corriendo en http://localhost:${PORT}`);
});
