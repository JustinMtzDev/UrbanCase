const https = require('https');

const SETUP_URL = 'https://api.mercadopago.com/terminals/v1/setup';
const LIST_URL = 'https://api.mercadopago.com/terminals/v1/list';

function mpRequest(method, url, token, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = body == null ? null : JSON.stringify(body);
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
    const req = https.request(
      { hostname: u.hostname, path: u.pathname + u.search, method, headers },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          let parsed = {};
          try { parsed = data ? JSON.parse(data) : {}; } catch { parsed = { raw: data }; }
          resolve({ status: res.statusCode, body: parsed, ok: res.statusCode >= 200 && res.statusCode < 300 });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function listarTerminales(token) {
  const res = await mpRequest('GET', LIST_URL, token);
  if (!res.ok) {
    throw new Error(`MP list (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return res.body?.data?.terminals || res.body?.terminals || [];
}

async function activarModoPdv(token, terminalId) {
  return mpRequest('PATCH', SETUP_URL, token, {
    terminals: [{ id: terminalId, operating_mode: 'PDV' }],
  });
}

/** Al arrancar: asegura modo PDV en la Smart Point configurada. */
async function ensureTerminalPdvMode() {
  const token = String(process.env.MP_ACCESS_TOKEN || '').trim();
  const terminalId = String(process.env.MP_TERMINAL_ID || '').trim();
  if (!token || !terminalId) {
    console.log('MP Point: sin MP_ACCESS_TOKEN o MP_TERMINAL_ID — impresión en papel desactivada.');
    return;
  }

  try {
    const lista = await listarTerminales(token);
    const terminal = lista.find((t) => t.id === terminalId);
    if (!terminal) {
      console.warn('MP Point: terminal no encontrada en la cuenta:', terminalId);
      return;
    }
    if (terminal.operating_mode === 'PDV') {
      console.log('MP Point: terminal en modo PDV ✓', terminalId);
      return;
    }
    const res = await activarModoPdv(token, terminalId);
    if (res.ok) {
      console.log('MP Point: modo PDV activado en', terminalId);
      console.log('MP Point: reinicia la Point si no refleja el cambio.');
      return;
    }
    console.warn('MP Point: no se pudo activar PDV:', res.status, JSON.stringify(res.body));
  } catch (err) {
    console.warn('MP Point setup:', err.message);
  }
}

/** Sincroniza mp_terminal_id en sucursales si falta. */
async function syncSucursalesTerminalId(pool) {
  const terminalId = String(process.env.MP_TERMINAL_ID || '').trim();
  if (!terminalId || !pool) return;
  try {
    const { rowCount } = await pool.query(
      `UPDATE sucursales
       SET mp_terminal_id = $1
       WHERE mp_terminal_id IS NULL OR TRIM(mp_terminal_id) = ''`,
      [terminalId]
    );
    if (rowCount > 0) {
      console.log(`MP Point: mp_terminal_id asignado a ${rowCount} sucursal(es).`);
    }
  } catch (err) {
    console.warn('MP Point sync sucursales:', err.message);
  }
}

module.exports = { ensureTerminalPdvMode, syncSucursalesTerminalId };
