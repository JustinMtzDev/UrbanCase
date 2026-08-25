const fs = require('fs');
const path = require('path');
const https = require('https');
const { randomUUID } = require('crypto');
const { armarContenidoPoint } = require('./ticket-contenido');

const MP_ACTIONS_URL = 'https://api.mercadopago.com/terminals/v1/actions';
const LAST_ACTION_PATH = path.join(__dirname, '..', 'tickets', 'last-mp-action.json');
const ESPERA_IMPRESION_MS = 120000;
const MAX_REINTENTOS_409 = 24;

const colaImpresion = [];
let drenandoCola = false;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function terminalParaSucursal(sucursal) {
  const deSucursal = String(sucursal?.mp_terminal_id || '').trim();
  if (deSucursal) return deSucursal;
  return String(process.env.MP_TERMINAL_ID || '').trim();
}

function mensajeMercadoPago(status, body) {
  const detalle = body?.errors?.[0]?.message || body?.message || body?.error;
  const codigo = body?.errors?.[0]?.code || '';
  if (status === 409 || String(codigo).includes('already_queued')) {
    return 'La Point tiene un ticket en cola. Entrá a Ingresar monto y pulsá Actualizar.';
  }
  if (detalle) return String(detalle);
  return `Mercado Pago ${status}`;
}

function leerUltimaAccion() {
  try {
    const raw = fs.readFileSync(LAST_ACTION_PATH, 'utf8');
    const data = JSON.parse(raw);
    return String(data?.id || '').trim() || null;
  } catch {
    return null;
  }
}

function guardarUltimaAccion(id) {
  if (!id) return;
  try {
    fs.mkdirSync(path.dirname(LAST_ACTION_PATH), { recursive: true });
    fs.writeFileSync(LAST_ACTION_PATH, JSON.stringify({ id, at: new Date().toISOString() }));
  } catch (err) {
    console.error('Ticket Point (guardar acción):', err.message);
  }
}

function mpRequest(method, url, { token, body, idempotencyKey }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = body == null ? null : JSON.stringify(body);
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
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
        res.on('data', (chunk) => {
          data += chunk;
        });
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

async function estadoAccion(token, actionId) {
  if (!actionId) return null;
  try {
    const res = await mpRequest('GET', `${MP_ACTIONS_URL}/${actionId}`, { token });
    if (!res.ok) return null;
    return String(res.body?.status || '').trim() || null;
  } catch {
    return null;
  }
}

async function crearImpresion(token, terminal, datos) {
  return mpRequest('POST', MP_ACTIONS_URL, {
    token,
    idempotencyKey: `venta-${datos.folio}-${randomUUID()}`,
    body: {
      type: 'print',
      external_reference: `venta_${datos.folio}`,
      config: {
        point: {
          terminal_id: terminal,
          subtype: 'custom',
        },
      },
      content: armarContenidoPoint(datos),
    },
  });
}

async function esperarProcesada(token, actionId) {
  const inicio = Date.now();
  let n = 0;
  for (;;) {
    const estado = await estadoAccion(token, actionId);
    if (estado === 'processed' || estado === 'failed' || estado === 'canceled') {
      return estado;
    }
    if (Date.now() - inicio >= ESPERA_IMPRESION_MS) {
      console.warn('Ticket Point: tiempo de espera agotado', actionId, estado || 'created');
      return 'timeout';
    }
    n += 1;
    if (n === 1 || n % 8 === 0) {
      console.log('Ticket Point: esperando impresión', actionId, estado || 'created');
    }
    await sleep(2500);
  }
}

async function enviarHastaAceptar(token, terminal, datos) {
  let reintentos409 = 0;
  for (;;) {
    const res = await crearImpresion(token, terminal, datos);
    if (res.ok) return res;
    if (res.status === 409) {
      reintentos409 += 1;
      if (reintentos409 > MAX_REINTENTOS_409) {
        return {
          ok: false,
          status: 409,
          body: {
            message: 'La Point sigue con un ticket en cola. Entrá a Ingresar monto y pulsá Actualizar.',
          },
        };
      }
      const previa = leerUltimaAccion();
      const estado = await estadoAccion(token, previa);
      if (estado === 'processed' || estado === 'failed' || estado === 'canceled' || !previa) {
        await sleep(1500);
        continue;
      }
      await sleep(2500);
      continue;
    }
    console.error('Ticket Point MP:', res.status, JSON.stringify(res.body));
    return res;
  }
}

async function drenarColaImpresion() {
  if (drenandoCola) return;
  drenandoCola = true;
  const token = String(process.env.MP_ACCESS_TOKEN || '').trim();
  while (colaImpresion.length) {
    const job = colaImpresion[0];
    try {
      const res = await enviarHastaAceptar(token, job.terminal, job.datos);
      if (!res.ok) {
        console.error('Ticket Point:', mensajeMercadoPago(res.status, res.body));
        if (job.onFail) await job.onFail(mensajeMercadoPago(res.status, res.body));
        colaImpresion.shift();
        continue;
      }
      const actionId = res.body?.id || null;
      guardarUltimaAccion(actionId);
      const estado = await esperarProcesada(token, actionId);
      if (estado === 'processed') {
        console.log('Ticket Point: impreso venta', job.datos?.folio, actionId);
        if (job.onOk) await job.onOk(actionId);
      } else if (job.onFail) {
        const msg = estado === 'timeout'
          ? 'La Point no respondió a tiempo. Revisá que esté en Ingresar monto y pulsá Actualizar.'
          : `Impresión ${estado}`;
        await job.onFail(msg);
      }
    } catch (err) {
      console.error('Ticket Point:', err.message);
      if (job.onFail) await job.onFail(err.message);
    }
    colaImpresion.shift();
  }
  drenandoCola = false;
}

function encolarImpresionPoint({ datos, terminalId, onOk, onFail }) {
  const token = String(process.env.MP_ACCESS_TOKEN || '').trim();
  const terminal = String(terminalId || '').trim();
  if (!token) {
    return { ok: false, omitido: true, error: 'Falta MP_ACCESS_TOKEN' };
  }
  if (!terminal) {
    return { ok: false, omitido: true, error: 'Falta ID de terminal Mercado Pago' };
  }
  colaImpresion.push({
    datos,
    terminal,
    onOk,
    onFail,
  });
  void drenarColaImpresion();
  return { ok: true, encolado: true };
}

async function reimprimirTicketAhora({ datos, terminalId }) {
  const token = String(process.env.MP_ACCESS_TOKEN || '').trim();
  const terminal = String(terminalId || '').trim();
  if (!token || !terminal) {
    return { ok: false, error: 'Falta token o terminal' };
  }
  const res = await enviarHastaAceptar(token, terminal, datos);
  if (!res.ok) {
    return { ok: false, error: mensajeMercadoPago(res.status, res.body) };
  }
  const actionId = res.body?.id || null;
  guardarUltimaAccion(actionId);
  const estado = await esperarProcesada(token, actionId);
  return { ok: estado === 'processed', estado, id: actionId };
}

function imprimirTicketPoint({ datos, terminalId }) {
  return encolarImpresionPoint({ datos, terminalId });
}

module.exports = {
  terminalParaSucursal,
  imprimirTicketPoint,
  encolarImpresionPoint,
  reimprimirTicketAhora,
};
