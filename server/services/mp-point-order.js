const https = require('https');
const { randomUUID } = require('crypto');

const ORDERS_URL = 'https://api.mercadopago.com/v1/orders';
const ESPERA_ORDEN_MS = 15 * 60 * 1000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function redondearMoneda(n) {
  return Math.round(Number(n) * 100) / 100;
}

function formatoMontoOrden(n) {
  return redondearMoneda(n).toFixed(2);
}

function mpRequest(method, url, { token, body, idempotencyKey, extraHeaders }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = body == null ? null : JSON.stringify(body);
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(extraHeaders || {}),
    };
    if (idempotencyKey) headers['X-Idempotency-Key'] = idempotencyKey;
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method,
        headers,
        rejectUnauthorized: false,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          let parsed = {};
          try {
            parsed = data ? JSON.parse(data) : {};
          } catch {
            parsed = {};
          }
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            body: parsed,
          });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function mensajeMercadoPago(status, body) {
  const detalle = body?.errors?.[0]?.message || body?.message || body?.error;
  const codigo = body?.errors?.[0]?.code || '';
  if (status === 409 || String(codigo).includes('already_queued')) {
    return 'La Point tiene una operación en cola. Entrá a Ingresar monto y pulsá Actualizar.';
  }
  if (detalle) return String(detalle);
  return `Mercado Pago ${status}`;
}

function paymentIdDeOrden(order) {
  const payments = order?.transactions?.payments;
  if (!Array.isArray(payments) || !payments.length) return null;
  return payments[0]?.id || null;
}

function crearReferenciaExterna() {
  return `UC${Date.now()}${Math.random().toString(36).slice(2, 8)}`.slice(0, 64);
}

async function crearOrdenCobro({ amount, terminalId, externalReference, description }) {
  const token = String(process.env.MP_ACCESS_TOKEN || '').trim();
  const terminal = String(terminalId || '').trim();
  if (!token || !terminal) {
    return { ok: false, error: 'Falta MP_ACCESS_TOKEN o terminal de la Point' };
  }
  const res = await mpRequest('POST', ORDERS_URL, {
    token,
    idempotencyKey: randomUUID(),
    body: {
      type: 'point',
      external_reference: externalReference || crearReferenciaExterna(),
      expiration_time: 'PT15M',
      description: String(description || 'Urban Case').slice(0, 150),
      transactions: {
        payments: [{ amount: formatoMontoOrden(amount) }],
      },
      config: {
        point: {
          terminal_id: terminal,
          print_on_terminal: 'seller_ticket',
        },
      },
    },
  });
  if (!res.ok) {
    return { ok: false, error: mensajeMercadoPago(res.status, res.body), status: res.status, body: res.body };
  }
  return {
    ok: true,
    orderId: res.body?.id || null,
    paymentId: paymentIdDeOrden(res.body),
    body: res.body,
  };
}

async function consultarOrden(orderId) {
  const token = String(process.env.MP_ACCESS_TOKEN || '').trim();
  if (!token || !orderId) return null;
  try {
    const res = await mpRequest('GET', `${ORDERS_URL}/${orderId}`, { token });
    if (!res.ok) return null;
    return res.body;
  } catch {
    return null;
  }
}

function esEstadoOrdenFinal(estado) {
  return ['processed', 'failed', 'canceled', 'expired', 'refunded'].includes(estado);
}

function mensajePagoPoint(estado, order) {
  const detalle = String(order?.status_detail || '').trim();
  if (estado === 'processed') return null;
  if (estado === 'canceled') return 'Pago cancelado en la Point';
  if (estado === 'expired') return 'El cobro expiró. Volvé a intentar.';
  if (estado === 'failed') {
    const tx = order?.transactions?.payments?.[0];
    const txDetalle = String(tx?.status_detail || detalle || '').trim();
    if (txDetalle.includes('rejected') || txDetalle.includes('issuer')) {
      return 'Tarjeta rechazada';
    }
    return 'Pago con tarjeta no aprobado';
  }
  return 'No se pudo completar el pago con tarjeta';
}

async function esperarOrdenProcesada(orderId) {
  const inicio = Date.now();
  let n = 0;
  for (;;) {
    const order = await consultarOrden(orderId);
    const estado = String(order?.status || '').trim() || 'created';
    if (esEstadoOrdenFinal(estado)) {
      return {
        ok: estado === 'processed',
        estado,
        order,
        paymentId: paymentIdDeOrden(order),
        error: estado === 'processed' ? null : mensajePagoPoint(estado, order),
      };
    }
    if (Date.now() - inicio >= ESPERA_ORDEN_MS) {
      return {
        ok: false,
        estado: 'timeout',
        order,
        paymentId: paymentIdDeOrden(order),
        error: 'La Point no confirmó el pago a tiempo. Revisá la terminal y pulsá Actualizar.',
      };
    }
    n += 1;
    if (n === 1 || n % 8 === 0) {
      console.log('MP Point: esperando pago', orderId, estado);
    }
    await sleep(2500);
  }
}

module.exports = {
  crearOrdenCobro,
  consultarOrden,
  esperarOrdenProcesada,
  crearReferenciaExterna,
  mensajePagoPoint,
};
