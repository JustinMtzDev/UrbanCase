/** Límite de intentos por ventana de tiempo (sin dependencias externas). */
const VENTANA_LOGIN_MS = 15 * 60 * 1000;
const MAX_INTENTOS_LOGIN = Number(process.env.LOGIN_RATE_MAX) || 10;

// req.ip es confiable solo porque index.js declara 'trust proxy'.
function ipCliente(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

/**
 * Crea un limitador con su propio Map de intentos. `clave` devuelve una cadena
 * o un arreglo de cadenas: se cuenta cada una por separado y basta que una pase
 * el máximo para rechazar. Con `contarAutomatico` en false el conteo lo hace el
 * handler llamando a `registrarIntento` (para contar solo los fallos).
 */
function crearRateLimiter({
  maxIntentos,
  ventanaMs,
  clave,
  mensaje = 'Demasiados intentos. Intenta más tarde.',
  contarAutomatico = true,
} = {}) {
  const intentos = new Map();

  function purgarVencidos(ahora) {
    for (const [k, reg] of intentos) {
      if (ahora - reg.inicio > ventanaMs) intentos.delete(k);
    }
  }

  function clavesDe(req) {
    const valor = clave(req);
    return (Array.isArray(valor) ? valor : [valor])
      .map((v) => String(v ?? '').trim())
      .filter(Boolean);
  }

  function contar(claves, ahora) {
    for (const k of claves) {
      const reg = intentos.get(k);
      if (!reg || ahora - reg.inicio > ventanaMs) {
        intentos.set(k, { inicio: ahora, count: 1 });
      } else {
        reg.count += 1;
      }
    }
  }

  function limiter(req, res, next) {
    const ahora = Date.now();
    purgarVencidos(ahora);
    const claves = clavesDe(req);
    const excedido = claves.some((k) => (intentos.get(k)?.count || 0) >= maxIntentos);
    if (excedido) {
      return res.status(429).json({ error: mensaje });
    }
    if (contarAutomatico) contar(claves, ahora);
    next();
  }

  limiter.registrarIntento = (req) => {
    const ahora = Date.now();
    purgarVencidos(ahora);
    contar(clavesDe(req), ahora);
  };

  return limiter;
}

const loginRateLimiter = crearRateLimiter({
  maxIntentos: MAX_INTENTOS_LOGIN,
  ventanaMs: VENTANA_LOGIN_MS,
  clave: (req) => [
    `ip:${ipCliente(req)}`,
    `usuario:${String(req.body?.usuario ?? '').trim().toLowerCase()}`,
  ],
  mensaje: 'Demasiados intentos de inicio de sesión. Intenta más tarde.',
});

module.exports = { loginRateLimiter, crearRateLimiter, ipCliente };
