const IS_PROD = process.env.NODE_ENV === 'production';

function mensajeErrorSeguro(err, fallback = 'Error interno del servidor') {
  if (!IS_PROD && err?.message) return err.message;
  return fallback;
}

function responderError(res, err, status = 500, fallback) {
  return res.status(status).json({ error: mensajeErrorSeguro(err, fallback) });
}

module.exports = { mensajeErrorSeguro, responderError, IS_PROD };
