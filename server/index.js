const express = require('express');
const cors = require('cors');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const pool = require('./config/db');
const { authMiddleware } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '4mb' }));

app.get('/api/health', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT current_database(), inet_server_addr()');
    res.json({
      ok: true,
      db: 'conectada',
      message: 'Servidor activo',
      database: rows[0]?.current_database,
      host: rows[0]?.inet_server_addr,
    });
  } catch (err) {
    res.status(503).json({ ok: false, db: 'error', message: err.message });
  }
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/usuarios', authMiddleware, require('./routes/usuarios'));
app.use('/api/sucursales', authMiddleware, require('./routes/sucursales'));
app.use('/api/clientes', authMiddleware, require('./routes/clientes'));
app.use('/api/proveedores', authMiddleware, require('./routes/proveedores'));
app.use('/api/productos', authMiddleware, require('./routes/productos'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'login.html'));
});

app.use(express.static(path.join(__dirname, '..')));

app.listen(PORT, () => {
  console.log(`UrbanCase corriendo en http://localhost:${PORT}`);
  console.log('API reg.: auth, usuarios, sucursales, clientes, proveedores, productos');
});
