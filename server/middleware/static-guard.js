/** Bloquea rutas sensibles antes de servir archivos estáticos. */
const RUTAS_BLOQUEADAS = [
  /^\/server(?:\/|$)/i,
  /^\/\.env/i,
  /^\/node_modules(?:\/|$)/i,
  /\.sql$/i,
  /\.md$/i,
];

function staticGuard(req, res, next) {
  const ruta = decodeURIComponent(req.path || '');
  if (ruta.includes('..') || RUTAS_BLOQUEADAS.some((re) => re.test(ruta))) {
    return res.status(404).end();
  }
  next();
}

module.exports = { staticGuard };
