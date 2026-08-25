/** Límite de intentos de login por IP (sin dependencias externas). */
const ventanaMs = 15 * 60 * 1000;
const maxIntentos = Number(process.env.LOGIN_RATE_MAX) || 10;
const intentosPorIp = new Map();

function ipCliente(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || req.socket?.remoteAddress || 'unknown';
}

function loginRateLimiter(req, res, next) {
  const ip = ipCliente(req);
  const ahora = Date.now();
  let reg = intentosPorIp.get(ip);
  if (!reg || ahora - reg.inicio > ventanaMs) {
    reg = { inicio: ahora, count: 0 };
  }
  reg.count += 1;
  intentosPorIp.set(ip, reg);

  if (reg.count > maxIntentos) {
    return res.status(429).json({
      error: 'Demasiados intentos de inicio de sesión. Intenta más tarde.',
    });
  }
  next();
}

module.exports = { loginRateLimiter };
