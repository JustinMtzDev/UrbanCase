/**
 * Configura la Smart Point en modo PDV y verifica la conexión.
 * Uso: MP_ACCESS_TOKEN=... MP_TERMINAL_ID=NEWLAND_N950__... node setup-mp-terminal.js
 * O con server/.env cargado: node setup-mp-terminal.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const https = require('https');

const TERMINAL_ID = String(process.env.MP_TERMINAL_ID || 'NEWLAND_N950__N950NCBC02427685').trim();
const TOKEN = String(process.env.MP_ACCESS_TOKEN || '').trim();

function mpRequest(method, url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = body == null ? null : JSON.stringify(body);
    const headers = {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    };
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method,
        headers,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          let parsed = {};
          try { parsed = data ? JSON.parse(data) : {}; } catch { parsed = { raw: data }; }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function listarTerminales() {
  const res = await mpRequest('GET', 'https://api.mercadopago.com/terminals/v1/list');
  if (!res.ok) {
    throw new Error(`Listar terminales falló (${res.status}): ${JSON.stringify(res.body)}`);
  }
  const lista = res.body?.data?.terminals || res.body?.terminals || [];
  return lista;
}

async function activarModoPdv() {
  const res = await mpRequest('PATCH', 'https://api.mercadopago.com/terminals/v1/setup', {
    terminals: [{ id: TERMINAL_ID, operating_mode: 'PDV' }],
  });
  if (res.status !== 200) {
    throw new Error(`Activar PDV falló (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

async function main() {
  if (!TOKEN) {
    console.error('❌ Falta MP_ACCESS_TOKEN en server/.env o en la variable de entorno.');
    process.exit(1);
  }

  console.log('🔧 Configurando terminal:', TERMINAL_ID);

  const antes = await listarTerminales();
  const actual = antes.find((t) => t.id === TERMINAL_ID);
  if (!actual) {
    console.error('❌ No se encontró la terminal en la cuenta. Terminales:', antes.map((t) => t.id).join(', '));
    process.exit(1);
  }
  console.log('   Modo actual:', actual.operating_mode || '(desconocido)');

  if (actual.operating_mode === 'PDV') {
    console.log('✅ Ya está en modo PDV. No hace falta cambiar nada.');
  } else {
    const setup = await activarModoPdv();
    console.log('✅ Modo PDV activado:', JSON.stringify(setup, null, 2));
    console.log('   Reinicia la Point (apagar/encender) si no refleja el cambio.');
  }

  const despues = await listarTerminales();
  const ver = despues.find((t) => t.id === TERMINAL_ID);
  console.log('\n📋 Estado final:');
  console.log('   id:', ver?.id);
  console.log('   operating_mode:', ver?.operating_mode);
  console.log('   pos_id:', ver?.pos_id);
  console.log('   store_id:', ver?.store_id);
  console.log('\n✅ Listo para UrbanCase (impresión de tickets).');
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
