const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { router: authRouter, authMiddleware } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

app.use('/api/auth', authRouter);
app.use('/api/usuarios', authMiddleware, require('./usuarios'));
app.use('/api/sucursales', authMiddleware, require('./sucursales'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'login.html'));
});

app.listen(PORT, () => {
  console.log(`UrbanCase corriendo en http://localhost:${PORT}`);
});
