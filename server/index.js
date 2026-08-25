const express = require('express');
const cors = require('cors');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const pool = require('./config/db');
const { ensureTerminalPdvMode, syncSucursalesTerminalId } = require('./services/mp-terminal-setup');
const { authMiddleware } = require('./middleware/auth');
const { requireAdmin } = require('./middleware/rbac');
const { staticGuard } = require('./middleware/static-guard');
const { responderError } = require('./middleware/errors');
const { securityHeaders } = require('./middleware/security-headers');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

const corsOrigins = String(process.env.CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(securityHeaders);

app.use(cors({
  origin(origin, callback) {
    if (!origin || corsOrigins.length === 0 || corsOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origen no permitido por CORS'));
  },
  credentials: true,
}));

app.use(express.json({ limit: '4mb' }));

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, message: 'Servidor activo' });
  } catch (err) {
    res.status(503).json({ ok: false, message: IS_PROD ? 'Servicio no disponible' : err.message });
  }
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/usuarios', authMiddleware, requireAdmin, require('./routes/usuarios'));
app.use('/api/sucursales', authMiddleware, require('./routes/sucursales'));
app.use('/api/clientes', authMiddleware, require('./routes/clientes'));
app.use('/api/proveedores', authMiddleware, require('./routes/proveedores'));
app.use('/api/productos', authMiddleware, require('./routes/productos'));
app.use('/api/productos-consignados', authMiddleware, require('./routes/productos-consignados'));
app.use('/api/inventario-favoritos', authMiddleware, require('./routes/inventario-favoritos'));
app.use('/api/reportes', authMiddleware, require('./routes/reportes'));
app.use('/api/ventas', authMiddleware, require('./routes/ventas'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'login.html'));
});

app.use(staticGuard);
app.use(express.static(path.join(__dirname, '..'), {
  dotfiles: 'deny',
  index: false,
}));

app.use((err, req, res, next) => {
  if (err?.message?.includes('CORS')) {
    return res.status(403).json({ error: 'Origen no permitido' });
  }
  return responderError(res, err);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`UrbanCase corriendo en http://localhost:${PORT}`);
  console.log(`Seguridad: headers, rate-limit login, RBAC, sesión ${process.env.SESSION_TTL_MS || 43200000}ms`);
  if (!IS_PROD) console.log('Modo desarrollo (NODE_ENV != production)');
  void syncSucursalesTerminalId(pool);
  void ensureTerminalPdvMode();
});
