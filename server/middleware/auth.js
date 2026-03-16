const sessions = new Map();

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  req.usuario = sessions.get(token);
  next();
}

module.exports = { authMiddleware, sessions };
