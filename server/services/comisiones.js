const { normalizarRol } = require('../middleware/roles');

const TZ = 'America/Mexico_City';
const COMISION_MINIMO_VENTAS = 1000;
const COMISION_BLOQUE_VENTAS = 500;
const COMISION_POR_BLOQUE = 50;
const DIAS_DETALLE = 7;

function rolGeneraComision(rol) {
  const r = normalizarRol(rol);
  return r === 'admin' || r === 'vendedor';
}

/** Desde $1,000: cada $500 completos de venta del día = $50 de comisión. */
function calcularComisionDiaria(ventasTotal) {
  const ventas = Number(ventasTotal) || 0;
  if (ventas < COMISION_MINIMO_VENTAS) return 0;
  return Math.floor(ventas / COMISION_BLOQUE_VENTAS) * COMISION_POR_BLOQUE;
}

function normalizarDiaSql(valor) {
  if (valor == null) return null;
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  return String(valor).slice(0, 10);
}

async function obtenerVentasDiaUsuario(executor, usuarioId, dia) {
  const { rows } = await executor.query(
    `SELECT
       COALESCE(SUM(v.total), 0)::float8 AS ventas_total,
       COUNT(v.id)::int AS tickets
     FROM ventas v
     WHERE v.usuario_id = $1
       AND (v.created_at AT TIME ZONE '${TZ}')::date = $2::date`,
    [usuarioId, dia]
  );
  return {
    ventas_total: Number(rows[0]?.ventas_total) || 0,
    tickets: Number(rows[0]?.tickets) || 0,
  };
}

async function sincronizarComisionDiariaUsuario(executor, usuarioId, diaInput = null) {
  const uid = Number(usuarioId);
  if (!Number.isFinite(uid) || uid <= 0) return null;

  const { rows: userRows } = await executor.query(
    'SELECT rol FROM usuarios WHERE id = $1',
    [uid]
  );
  if (!userRows.length || !rolGeneraComision(userRows[0].rol)) return null;

  let dia = normalizarDiaSql(diaInput);
  if (!dia) {
    const hoy = await executor.query(
      `SELECT (NOW() AT TIME ZONE '${TZ}')::date AS dia`
    );
    dia = normalizarDiaSql(hoy.rows[0]?.dia);
  }

  const { ventas_total: ventasTotal, tickets } = await obtenerVentasDiaUsuario(executor, uid, dia);
  const nuevaComision = calcularComisionDiaria(ventasTotal);

  const prevRes = await executor.query(
    `SELECT comision::float8 AS comision
     FROM usuario_comision_diaria
     WHERE usuario_id = $1 AND dia = $2::date`,
    [uid, dia]
  );
  const comisionAnterior = Number(prevRes.rows[0]?.comision) || 0;
  const delta = nuevaComision - comisionAnterior;

  if (ventasTotal <= 0 && nuevaComision <= 0 && !prevRes.rows.length) {
    return { dia, ventas_total: 0, comision: 0, tickets: 0, delta: 0 };
  }

  await executor.query(
    `INSERT INTO usuario_comision_diaria
       (usuario_id, dia, ventas_total, comision, tickets, updated_at)
     VALUES ($1, $2::date, $3, $4, $5, NOW())
     ON CONFLICT (usuario_id, dia) DO UPDATE SET
       ventas_total = EXCLUDED.ventas_total,
       comision = EXCLUDED.comision,
       tickets = EXCLUDED.tickets,
       updated_at = NOW()`,
    [uid, dia, ventasTotal, nuevaComision, tickets]
  );

  if (delta !== 0) {
    await executor.query(
      `UPDATE usuarios
       SET comision_total_acumulada = COALESCE(comision_total_acumulada, 0) + $1
       WHERE id = $2`,
      [delta, uid]
    );
  }

  return { dia, ventas_total: ventasTotal, comision: nuevaComision, tickets, delta };
}

async function purgarComisionesAntiguas(executor) {
  await executor.query(
    `DELETE FROM usuario_comision_diaria
     WHERE dia < ((NOW() AT TIME ZONE '${TZ}')::date - INTERVAL '${DIAS_DETALLE - 1} days')::date`
  );
}

async function actualizarComisionTrasVenta(executor, usuarioId) {
  if (usuarioId == null) return;
  const uid = Number(usuarioId);
  if (!Number.isFinite(uid) || uid <= 0) return;

  const hoyRes = await executor.query(
    `SELECT (NOW() AT TIME ZONE '${TZ}')::date AS dia`
  );
  const dia = normalizarDiaSql(hoyRes.rows[0]?.dia);
  await sincronizarComisionDiariaUsuario(executor, uid, dia);
  await purgarComisionesAntiguas(executor);
}

async function recalcularComisionesUsuario(executor, usuarioId) {
  const uid = Number(usuarioId);
  if (!Number.isFinite(uid) || uid <= 0) return null;

  const { rows: userRows } = await executor.query(
    'SELECT rol FROM usuarios WHERE id = $1',
    [uid]
  );
  if (!userRows.length || !rolGeneraComision(userRows[0].rol)) return null;

  const { rows: dias } = await executor.query(
    `SELECT
       (v.created_at AT TIME ZONE '${TZ}')::date AS dia,
       COALESCE(SUM(v.total), 0)::float8 AS ventas_total,
       COUNT(v.id)::int AS tickets
     FROM ventas v
     WHERE v.usuario_id = $1
     GROUP BY 1
     ORDER BY 1 ASC`,
    [uid]
  );

  await executor.query('DELETE FROM usuario_comision_diaria WHERE usuario_id = $1', [uid]);

  let totalAcumulada = 0;
  for (const row of dias) {
    const dia = normalizarDiaSql(row.dia);
    const ventasTotal = Number(row.ventas_total) || 0;
    const tickets = Number(row.tickets) || 0;
    const comision = calcularComisionDiaria(ventasTotal);
    totalAcumulada += comision;
    await executor.query(
      `INSERT INTO usuario_comision_diaria
         (usuario_id, dia, ventas_total, comision, tickets, updated_at)
       VALUES ($1, $2::date, $3, $4, $5, NOW())`,
      [uid, dia, ventasTotal, comision, tickets]
    );
  }

  await executor.query(
    'UPDATE usuarios SET comision_total_acumulada = $1 WHERE id = $2',
    [totalAcumulada, uid]
  );
  await purgarComisionesAntiguas(executor);
  return { usuario_id: uid, comision_total_acumulada: totalAcumulada };
}

async function recalcularComisionesGlobales(executor) {
  const { rows: usuarios } = await executor.query(
    `SELECT id, rol FROM usuarios WHERE activo IS NOT FALSE`
  );
  for (const u of usuarios) {
    if (!rolGeneraComision(u.rol)) continue;
    await recalcularComisionesUsuario(executor, u.id);
  }
}

async function listarComisionesUsuario(poolOrClient, usuarioId) {
  const uid = Number(usuarioId);
  if (!Number.isFinite(uid) || uid <= 0) {
    throw new Error('id de usuario inválido');
  }

  const { rows: userRows } = await poolOrClient.query(
    `SELECT id, rol, COALESCE(comision_total_acumulada, 0)::float8 AS comision_total_acumulada
     FROM usuarios WHERE id = $1`,
    [uid]
  );
  if (!userRows.length) return null;
  const usuario = userRows[0];
  if (!rolGeneraComision(usuario.rol)) {
    return {
      usuario_id: uid,
      comision_total_acumulada: Number(usuario.comision_total_acumulada) || 0,
      registros: [],
      elegible: false,
    };
  }

  await purgarComisionesAntiguas(poolOrClient);

  const { rows } = await poolOrClient.query(
    `SELECT
       c.dia,
       c.ventas_total::float8 AS ventas_total,
       c.comision::float8 AS comision,
       c.tickets
     FROM usuario_comision_diaria c
     WHERE c.usuario_id = $1
       AND c.dia >= ((NOW() AT TIME ZONE '${TZ}')::date - INTERVAL '${DIAS_DETALLE - 1} days')::date
     ORDER BY c.dia DESC`,
    [uid]
  );

  return {
    usuario_id: uid,
    comision_total_acumulada: Number(usuario.comision_total_acumulada) || 0,
    registros: rows.map((r) => ({
      dia: normalizarDiaSql(r.dia),
      ventas_total: Number(r.ventas_total) || 0,
      comision: Number(r.comision) || 0,
      tickets: Number(r.tickets) || 0,
    })),
    elegible: true,
  };
}

module.exports = {
  COMISION_MINIMO_VENTAS,
  COMISION_BLOQUE_VENTAS,
  COMISION_POR_BLOQUE,
  DIAS_DETALLE,
  TZ,
  rolGeneraComision,
  calcularComisionDiaria,
  sincronizarComisionDiariaUsuario,
  purgarComisionesAntiguas,
  actualizarComisionTrasVenta,
  recalcularComisionesUsuario,
  recalcularComisionesGlobales,
  listarComisionesUsuario,
};
