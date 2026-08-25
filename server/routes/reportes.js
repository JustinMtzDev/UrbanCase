const { Router } = require('express');
const pool = require('../config/db');

const router = Router();
const TZ = 'America/Mexico_City';
const TS = `(v.created_at AT TIME ZONE '${TZ}')`;
const PERIODOS_KPI = new Set(['diario', 'semanal', 'mensual', 'anual']);

function parseSucursalIdQuery(req) {
  const sidRaw = String(req.query.sucursal_id ?? '').trim();
  if (!sidRaw) return { sid: null };
  const sid = Number(sidRaw);
  if (!Number.isFinite(sid) || sid <= 0) {
    return { error: 'sucursal_id inválido' };
  }
  return { sid };
}

function anexarFiltroSucursalQuery(req, filtros, vals, idx, columnSql) {
  const parsed = parseSucursalIdQuery(req);
  if (parsed.error) return { error: parsed.error, idx };
  if (parsed.sid == null) return { idx };
  filtros.push(`${columnSql} = $${idx}`);
  vals.push(parsed.sid);
  return { idx: idx + 1 };
}

function rangoKpi(periodo) {
  const now = `(NOW() AT TIME ZONE '${TZ}')`;
  if (periodo === 'semanal') {
    return {
      actual: `${TS} >= date_trunc('week', ${now}::timestamp) AND ${TS} < date_trunc('week', ${now}::timestamp) + INTERVAL '1 week'`,
      anterior: `${TS} >= date_trunc('week', ${now}::timestamp) - INTERVAL '1 week' AND ${TS} < date_trunc('week', ${now}::timestamp)`,
      etiquetaCmp: 'la semana pasada',
    };
  }
  if (periodo === 'mensual') {
    return {
      actual: `${TS} >= date_trunc('month', ${now}::timestamp) AND ${TS} < date_trunc('month', ${now}::timestamp) + INTERVAL '1 month'`,
      anterior: `${TS} >= date_trunc('month', ${now}::timestamp) - INTERVAL '1 month' AND ${TS} < date_trunc('month', ${now}::timestamp)`,
      etiquetaCmp: 'el mes pasado',
    };
  }
  if (periodo === 'anual') {
    return {
      actual: `${TS} >= date_trunc('year', ${now}::timestamp) AND ${TS} < date_trunc('year', ${now}::timestamp) + INTERVAL '1 year'`,
      anterior: `${TS} >= date_trunc('year', ${now}::timestamp) - INTERVAL '1 year' AND ${TS} < date_trunc('year', ${now}::timestamp)`,
      etiquetaCmp: 'el año pasado',
    };
  }
  return {
    actual: `${TS} >= (${now}::date)::timestamp AND ${TS} < ((${now}::date) + INTERVAL '1 day')::timestamp`,
    anterior: `${TS} >= ((${now}::date) - INTERVAL '1 day')::timestamp AND ${TS} < (${now}::date)::timestamp`,
    etiquetaCmp: 'ayer',
  };
}

async function metricasPeriodo(pool, whereSql, vals) {
  const where = whereSql ? `WHERE ${whereSql}` : '';
  const [ingRes, comRes] = await Promise.all([
    pool.query(
      `SELECT
         COALESCE(SUM(v.total), 0)::float8 AS ingresos,
         COUNT(*)::int AS tickets,
         COALESCE(AVG(v.total), 0)::float8 AS ticket_promedio
       FROM ventas v
       ${where}`,
      vals
    ),
    pool.query(
      `SELECT COALESCE(SUM(
         d.subtotal - (COALESCE(NULLIF(d.detalle->>'costo_consignacion', ''), '0')::numeric * d.cantidad)
       ), 0)::float8 AS ingresos_comision
       FROM venta_detalle d
       INNER JOIN ventas v ON v.id = d.venta_id
       ${where}
       AND d.es_consignado = TRUE`,
      vals
    ),
  ]);
  const ing = ingRes.rows[0] || {};
  const com = comRes.rows[0] || {};
  return {
    ingresos: Number(ing.ingresos) || 0,
    tickets: Number(ing.tickets) || 0,
    ticket_promedio: Number(ing.ticket_promedio) || 0,
    ingresos_comision: Math.max(0, Number(com.ingresos_comision) || 0),
  };
}

router.get('/dashboard-kpis', async (req, res) => {
  const periodoRaw = String(req.query.periodo || 'diario').trim().toLowerCase();
  const periodo = PERIODOS_KPI.has(periodoRaw) ? periodoRaw : 'diario';
  const sidRaw = String(req.query.sucursal_id ?? '').trim();
  const filtrosSuc = [];
  const vals = [];
  let idx = 1;
  if (sidRaw) {
    const sid = Number(sidRaw);
    if (!Number.isFinite(sid) || sid <= 0) {
      return res.status(400).json({ error: 'sucursal_id inválido' });
    }
    filtrosSuc.push(`v.sucursal_id = $${idx}`);
    vals.push(sid);
    idx++;
  }
  const { actual, anterior, etiquetaCmp } = rangoKpi(periodo);
  const whereActual = [...filtrosSuc, actual].join(' AND ');
  const whereAnterior = [...filtrosSuc, anterior].join(' AND ');

  try {
    const [act, ant] = await Promise.all([
      metricasPeriodo(pool, whereActual, vals),
      metricasPeriodo(pool, whereAnterior, vals),
    ]);
    let variacionPct = null;
    if (ant.ingresos > 0) {
      variacionPct = ((act.ingresos - ant.ingresos) / ant.ingresos) * 100;
    } else if (act.ingresos > 0) {
      variacionPct = 100;
    }
    res.json({
      periodo,
      ingresos: act.ingresos,
      ingresos_comision: act.ingresos_comision,
      tickets: act.tickets,
      ticket_promedio: act.ticket_promedio,
      variacion_pct: variacionPct,
      etiqueta_comparacion: etiquetaCmp,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/dashboard-top-productos', async (req, res) => {
  const periodoRaw = String(req.query.periodo || 'diario').trim().toLowerCase();
  const periodo = PERIODOS_KPI.has(periodoRaw) ? periodoRaw : 'diario';
  const sidRaw = String(req.query.sucursal_id ?? '').trim();
  const filtrosSuc = [];
  const vals = [];
  let idx = 1;
  if (sidRaw) {
    const sid = Number(sidRaw);
    if (!Number.isFinite(sid) || sid <= 0) {
      return res.status(400).json({ error: 'sucursal_id inválido' });
    }
    filtrosSuc.push(`v.sucursal_id = $${idx}`);
    vals.push(sid);
    idx++;
  }
  const { actual } = rangoKpi(periodo);
  const whereActual = [...filtrosSuc, actual].join(' AND ');

  try {
    const { rows } = await pool.query(
      `WITH ranked AS (
         SELECT
           LOWER(BTRIM(d.producto_nombre)) AS clave,
           MIN(d.producto_nombre) AS producto_nombre,
           BOOL_OR(COALESCE(d.es_consignado, FALSE)) AS es_consignado,
           SUM(d.cantidad)::int AS unidades,
           COALESCE(SUM(d.subtotal), 0)::float8 AS ingresos
         FROM venta_detalle d
         INNER JOIN ventas v ON v.id = d.venta_id
         WHERE ${whereActual}
           AND BTRIM(COALESCE(d.producto_nombre, '')) <> ''
         GROUP BY LOWER(BTRIM(d.producto_nombre))
       )
       SELECT
         r.producto_nombre,
         r.es_consignado,
         r.unidades,
         r.ingresos,
         p.imagen
       FROM ranked r
       LEFT JOIN LATERAL (
         SELECT imagen
         FROM productos
         WHERE LOWER(BTRIM(nombre)) = r.clave
           AND imagen IS NOT NULL
           AND BTRIM(imagen) <> ''
         ORDER BY id DESC
         LIMIT 1
       ) p ON TRUE
       ORDER BY r.unidades DESC, r.ingresos DESC, r.producto_nombre ASC
       LIMIT 10`,
      vals
    );
    res.json({
      periodo,
      todas_sucursales: !sidRaw,
      productos: rows.map((row, i) => ({
        ranking: i + 1,
        nombre: row.producto_nombre,
        es_consignado: Boolean(row.es_consignado),
        unidades: Number(row.unidades) || 0,
        ingresos: Number(row.ingresos) || 0,
        imagen: row.imagen || null,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/dashboard-comparativa-sucursales', async (req, res) => {
  const periodoRaw = String(req.query.periodo || 'diario').trim().toLowerCase();
  const periodo = PERIODOS_KPI.has(periodoRaw) ? periodoRaw : 'diario';
  const { actual } = rangoKpi(periodo);

  try {
    const { rows } = await pool.query(
      `WITH ventas_suc AS (
         SELECT
           v.sucursal_id,
           COALESCE(SUM(v.total), 0)::float8 AS ingresos,
           COUNT(*)::int AS tickets,
           COALESCE(AVG(v.total), 0)::float8 AS ticket_promedio
         FROM ventas v
         WHERE ${actual}
         GROUP BY v.sucursal_id
       ),
       top_prod AS (
         SELECT sucursal_id, producto_nombre, unidades
         FROM (
           SELECT
             v.sucursal_id,
             MIN(d.producto_nombre) AS producto_nombre,
             SUM(d.cantidad)::int AS unidades,
             ROW_NUMBER() OVER (
               PARTITION BY v.sucursal_id
               ORDER BY SUM(d.cantidad) DESC, SUM(d.subtotal) DESC
             ) AS rn
           FROM venta_detalle d
           INNER JOIN ventas v ON v.id = d.venta_id
           WHERE ${actual}
             AND BTRIM(COALESCE(d.producto_nombre, '')) <> ''
           GROUP BY v.sucursal_id, LOWER(BTRIM(d.producto_nombre))
         ) x
         WHERE rn = 1
       )
       SELECT
         s.id,
         s.nombre,
         COALESCE(vs.ingresos, 0)::float8 AS ingresos,
         COALESCE(vs.tickets, 0)::int AS tickets,
         COALESCE(vs.ticket_promedio, 0)::float8 AS ticket_promedio,
         tp.producto_nombre AS producto_estrella,
         COALESCE(tp.unidades, 0)::int AS producto_estrella_unidades
       FROM sucursales s
       LEFT JOIN ventas_suc vs ON vs.sucursal_id = s.id
       LEFT JOIN top_prod tp ON tp.sucursal_id = s.id
       WHERE s.activo IS NOT FALSE
       ORDER BY COALESCE(vs.ingresos, 0) DESC, s.nombre ASC`
    );
    const totalIngresos = rows.reduce((s, r) => s + (Number(r.ingresos) || 0), 0);
    const sucursales = rows.map((row) => {
      const ingresos = Number(row.ingresos) || 0;
      const pct = totalIngresos > 0 ? (ingresos / totalIngresos) * 100 : 0;
      return {
        id: row.id,
        nombre: row.nombre,
        ingresos,
        tickets: Number(row.tickets) || 0,
        ticket_promedio: Number(row.ticket_promedio) || 0,
        participacion_pct: pct,
        producto_estrella: row.producto_estrella || null,
        producto_estrella_unidades: Number(row.producto_estrella_unidades) || 0,
      };
    });
    res.json({ periodo, total_ingresos: totalIngresos, sucursales });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const DIAS_CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DIAS_LARGO = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const ORDEN_LUN_DOM = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

router.get('/dashboard-ventas-7d', async (req, res) => {
  const sidRaw = String(req.query.sucursal_id ?? '').trim();
  const filtrosSuc = [];
  const vals = [];
  let idx = 1;
  if (sidRaw) {
    const sid = Number(sidRaw);
    if (!Number.isFinite(sid) || sid <= 0) {
      return res.status(400).json({ error: 'sucursal_id inválido' });
    }
    filtrosSuc.push(`v.sucursal_id = $${idx}`);
    vals.push(sid);
    idx++;
  }
  const joinSuc = filtrosSuc.length ? `AND ${filtrosSuc.join(' AND ')}` : '';

  try {
    const { rows } = await pool.query(
      `WITH rango AS (
         SELECT generate_series(
           ((NOW() AT TIME ZONE '${TZ}')::date - INTERVAL '6 days')::date,
           ((NOW() AT TIME ZONE '${TZ}')::date)::date,
           INTERVAL '1 day'
         )::date AS dia
       )
       SELECT
         r.dia,
         COALESCE(SUM(v.total), 0)::float8 AS ingresos,
         COUNT(v.id)::int AS tickets,
         COALESCE(AVG(v.total), 0)::float8 AS ticket_promedio
       FROM rango r
       LEFT JOIN ventas v
         ON (${TS})::date = r.dia
         ${joinSuc}
       GROUP BY r.dia
       ORDER BY r.dia ASC`,
      vals
    );

    const dias = rows.map((row) => {
      const diaDate = row.dia;
      const iso = diaDate instanceof Date
        ? diaDate.toISOString().slice(0, 10)
        : String(diaDate).slice(0, 10);
      const dow = diaDate instanceof Date ? diaDate.getUTCDay() : new Date(`${iso}T12:00:00Z`).getUTCDay();
      return {
        fecha: iso,
        etiqueta: DIAS_CORTO[dow],
        etiqueta_larga: DIAS_LARGO[dow],
        ingresos: Number(row.ingresos) || 0,
        tickets: Number(row.tickets) || 0,
        ticket_promedio: Number(row.ticket_promedio) || 0,
      };
    });

    dias.sort((a, b) => ORDEN_LUN_DOM.indexOf(a.etiqueta) - ORDEN_LUN_DOM.indexOf(b.etiqueta));

    res.json({ dias });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/resumen-inventario', async (req, res) => {
  const sidRaw = String(req.query.sucursal_id ?? '').trim();
  const filtros = [];
  const vals = [];
  if (sidRaw) {
    const sid = Number(sidRaw);
    if (!Number.isFinite(sid) || sid <= 0) {
      return res.status(400).json({ error: 'sucursal_id inválido' });
    }
    filtros.push('sucursal_id = $1');
    vals.push(sid);
  }
  const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
  try {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*)::int AS total_productos,
         COUNT(*) FILTER (WHERE COALESCE(stock, 0) <= 0)::int AS total_sin_stock,
         COALESCE(SUM(COALESCE(stock, 0)), 0)::int AS stock_total
       FROM productos
       ${where}`,
      vals
    );
    const row = rows[0] || {};
    res.json({
      total_productos: Number(row.total_productos) || 0,
      total_sin_stock: Number(row.total_sin_stock) || 0,
      stock_total: Number(row.stock_total) || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/movimientos-inventario', async (req, res) => {
  const limitRaw = Number(req.query.limit);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 1000) : 300;
  const q = String(req.query.q || '').trim();
  const filtros = [
    `(
      im.movimiento = 'devolucion'
      OR im.movimiento = 'restock_rapido'
      OR (im.movimiento = 'entrada_mercancia' AND COALESCE(im.detalle->>'motivo', '') = 'restock_rapido')
    )`,
  ];
  const vals = [];
  let idx = 1;

  if (q) {
    filtros.push(`(
      im.producto_nombre ILIKE $${idx}
      OR im.movimiento ILIKE $${idx}
      OR COALESCE(im.detalle::text, '') ILIKE $${idx}
      OR COALESCE(u.nombre, '') ILIKE $${idx}
      OR COALESCE(s.nombre, '') ILIKE $${idx}
    )`);
    vals.push(`%${q}%`);
    idx++;
  }

  const sucRes = anexarFiltroSucursalQuery(req, filtros, vals, idx, 'im.sucursal_id');
  if (sucRes.error) return res.status(400).json({ error: sucRes.error });
  idx = sucRes.idx;

  vals.push(limit);
  const where = `WHERE ${filtros.join(' AND ')}`;

  try {
    const { rows } = await pool.query(
      `SELECT
         im.id,
         im.created_at,
         im.producto_id,
         im.producto_nombre,
         im.movimiento,
         im.cantidad,
         im.detalle,
         im.usuario_id,
         COALESCE(u.nombre, 'Sistema') AS usuario_nombre,
         im.sucursal_id,
         COALESCE(s.nombre, 'Sin sucursal') AS sucursal_nombre
       FROM inventario_movimientos im
       LEFT JOIN usuarios u ON u.id = im.usuario_id
       LEFT JOIN sucursales s ON s.id = im.sucursal_id
       ${where}
       ORDER BY im.created_at DESC, im.id DESC
       LIMIT $${idx}`,
      vals
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/transferencias-sucursales', async (req, res) => {
  const limitRaw = Number(req.query.limit);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 1000) : 300;
  const q = String(req.query.q || '').trim();
  const filtros = [];
  const vals = [];
  let idx = 1;

  if (q) {
    filtros.push(`(
      COALESCE(po.nombre, pd.nombre, '') ILIKE $${idx}
      OR COALESCE(u.nombre, '') ILIKE $${idx}
      OR COALESCE(so.nombre, '') ILIKE $${idx}
      OR COALESCE(sd.nombre, '') ILIKE $${idx}
    )`);
    vals.push(`%${q}%`);
    idx++;
  }

  const parsedSuc = parseSucursalIdQuery(req);
  if (parsedSuc.error) return res.status(400).json({ error: parsedSuc.error });
  if (parsedSuc.sid != null) {
    filtros.push(`(t.sucursal_origen_id = $${idx} OR t.sucursal_destino_id = $${idx})`);
    vals.push(parsedSuc.sid);
    idx++;
  }

  vals.push(limit);
  const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';

  try {
    const { rows } = await pool.query(
      `SELECT
         t.id,
         t.created_at,
         t.cantidad,
         t.producto_origen_id,
         t.producto_destino_id,
         COALESCE(po.nombre, pd.nombre, 'Sin nombre') AS producto_nombre,
         t.sucursal_origen_id,
         COALESCE(so.nombre, 'Sin sucursal') AS sucursal_origen_nombre,
         t.sucursal_destino_id,
         COALESCE(sd.nombre, 'Sin sucursal') AS sucursal_destino_nombre,
         t.usuario_id,
         COALESCE(u.nombre, 'Sistema') AS usuario_nombre
       FROM inventario_traslados t
       LEFT JOIN productos po ON po.id = t.producto_origen_id
       LEFT JOIN productos pd ON pd.id = t.producto_destino_id
       LEFT JOIN sucursales so ON so.id = t.sucursal_origen_id
       LEFT JOIN sucursales sd ON sd.id = t.sucursal_destino_id
       LEFT JOIN usuarios u ON u.id = t.usuario_id
       ${where}
       ORDER BY t.created_at DESC, t.id DESC
       LIMIT $${idx}`,
      vals
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/historial-productos', async (req, res) => {
  const limitRaw = Number(req.query.limit);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 1000) : 300;
  const q = String(req.query.q || '').trim();
  const filtros = [];
  const vals = [];
  let idx = 1;

  if (q) {
    filtros.push(`(
      ph.producto_nombre ILIKE $${idx}
      OR ph.accion ILIKE $${idx}
      OR COALESCE(ph.campo, '') ILIKE $${idx}
      OR COALESCE(ph.valor_anterior, '') ILIKE $${idx}
      OR COALESCE(ph.valor_nuevo, '') ILIKE $${idx}
      OR COALESCE(ph.detalle::text, '') ILIKE $${idx}
      OR COALESCE(u.nombre, '') ILIKE $${idx}
      OR COALESCE(s.nombre, '') ILIKE $${idx}
    )`);
    vals.push(`%${q}%`);
    idx++;
  }

  const accionFiltro = String(req.query.accion || '').trim().toLowerCase();
  const accionesValidas = new Set(['alta', 'edicion', 'eliminacion']);
  if (accionFiltro && accionesValidas.has(accionFiltro)) {
    filtros.push(`ph.accion = $${idx}`);
    vals.push(accionFiltro);
    idx++;
  }

  const sucRes = anexarFiltroSucursalQuery(req, filtros, vals, idx, 'ph.sucursal_id');
  if (sucRes.error) return res.status(400).json({ error: sucRes.error });
  idx = sucRes.idx;

  vals.push(limit);
  const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';

  try {
    const { rows } = await pool.query(
      `SELECT
         ph.id,
         ph.created_at,
         ph.producto_id,
         ph.producto_nombre,
         ph.accion,
         ph.campo,
         ph.valor_anterior,
         ph.valor_nuevo,
         ph.detalle,
         ph.usuario_id,
         COALESCE(u.nombre, 'Sistema') AS usuario_nombre,
         ph.sucursal_id,
         COALESCE(s.nombre, 'Sin sucursal') AS sucursal_nombre,
         p.costo_compra::float8 AS producto_costo_compra,
         p.precio::float8 AS producto_precio,
         p.precio_max::float8 AS producto_precio_max,
         p.stock AS producto_stock
       FROM productos_historial ph
       LEFT JOIN usuarios u ON u.id = ph.usuario_id
       LEFT JOIN sucursales s ON s.id = ph.sucursal_id
       LEFT JOIN productos p ON p.id = ph.producto_id
       ${where}
       ORDER BY ph.created_at DESC, ph.id DESC
       LIMIT $${idx}`,
      vals
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/corte-caja/fechas', async (req, res) => {
  const tsVenta = `(v.created_at AT TIME ZONE '${TZ}')`;
  const filtros = [];
  const vals = [];
  const sucRes = anexarFiltroSucursalQuery(req, filtros, vals, 1, 'v.sucursal_id');
  if (sucRes.error) return res.status(400).json({ error: sucRes.error });
  const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT (${tsVenta})::date AS dia
       FROM ventas v
       ${where}
       ORDER BY dia ASC`,
      vals
    );
    const fechas = rows.map((row) => {
      const d = row.dia;
      if (d instanceof Date) return d.toISOString().slice(0, 10);
      return String(d).slice(0, 10);
    });
    res.json({ fechas });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/corte-caja/:id/detalle', async (req, res) => {
  const ventaId = Number(req.params.id);
  if (!Number.isFinite(ventaId) || ventaId <= 0) {
    return res.status(400).json({ error: 'id de venta inválido' });
  }
  try {
    const existe = await pool.query('SELECT id FROM ventas WHERE id = $1 LIMIT 1', [ventaId]);
    if (!existe.rows.length) {
      return res.status(404).json({ error: 'Venta no encontrada' });
    }
    const { rows } = await pool.query(
      `SELECT
         d.id,
         d.producto_nombre,
         d.cantidad,
         d.precio_unitario::float8 AS precio_unitario,
         d.subtotal::float8 AS subtotal,
         d.es_consignado,
         NULLIF(d.detalle->>'costo_consignacion', '')::float8 AS costo_consignacion,
         d.detalle
       FROM venta_detalle d
       WHERE d.venta_id = $1
       ORDER BY d.id ASC`,
      [ventaId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/corte-caja', async (req, res) => {
  const limitRaw = Number(req.query.limit);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 1000) : 300;
  const q = String(req.query.q || '').trim();
  const periodoRaw = String(req.query.periodo || 'diario').trim().toLowerCase();
  const periodosValidos = new Set(['diario', 'semanal', 'mensual', 'anual']);
  const periodo = periodosValidos.has(periodoRaw) ? periodoRaw : 'diario';
  const fechaRaw = String(req.query.fecha || '').trim();
  const filtros = [];
  const vals = [];
  let idx = 1;

  if (q) {
    filtros.push(`(
      CAST(v.id AS TEXT) ILIKE $${idx}
      OR COALESCE(v.metodo_pago, '') ILIKE $${idx}
      OR COALESCE(u.nombre, '') ILIKE $${idx}
      OR COALESCE(s.nombre, '') ILIKE $${idx}
    )`);
    vals.push(`%${q}%`);
    idx++;
  }

  let fechaExpr = `((NOW() AT TIME ZONE 'America/Mexico_City')::date)`;
  if (fechaRaw) {
    const fechaValida = /^\d{4}-\d{2}-\d{2}$/.test(fechaRaw);
    if (!fechaValida) {
      return res.status(400).json({ error: 'fecha debe tener formato YYYY-MM-DD' });
    }
    fechaExpr = `$${idx}::date`;
    vals.push(fechaRaw);
    idx++;
  }

  const tsVenta = `(v.created_at AT TIME ZONE 'America/Mexico_City')`;
  if (periodo === 'semanal') {
    filtros.push(`
      ${tsVenta} >= date_trunc('week', ${fechaExpr}::timestamp)
      AND ${tsVenta} < (date_trunc('week', ${fechaExpr}::timestamp) + INTERVAL '1 week')
    `);
  } else if (periodo === 'mensual') {
    filtros.push(`
      ${tsVenta} >= date_trunc('month', ${fechaExpr}::timestamp)
      AND ${tsVenta} < (date_trunc('month', ${fechaExpr}::timestamp) + INTERVAL '1 month')
    `);
  } else if (periodo === 'anual') {
    filtros.push(`
      ${tsVenta} >= date_trunc('year', ${fechaExpr}::timestamp)
      AND ${tsVenta} < (date_trunc('year', ${fechaExpr}::timestamp) + INTERVAL '1 year')
    `);
  } else {
    filtros.push(`
      ${tsVenta} >= ${fechaExpr}::timestamp
      AND ${tsVenta} < (${fechaExpr}::timestamp + INTERVAL '1 day')
    `);
  }

  const sucRes = anexarFiltroSucursalQuery(req, filtros, vals, idx, 'v.sucursal_id');
  if (sucRes.error) return res.status(400).json({ error: sucRes.error });
  idx = sucRes.idx;

  vals.push(limit);
  const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';

  try {
    const { rows } = await pool.query(
      `SELECT
         v.id,
         v.created_at,
         v.subtotal::float8 AS subtotal,
         v.total::float8 AS total,
         COALESCE(v.metodo_pago, 'efectivo') AS metodo_pago,
         v.usuario_id,
         COALESCE(u.nombre, 'Sistema') AS usuario_nombre,
         v.sucursal_id,
         COALESCE(s.nombre, 'Sin sucursal') AS sucursal_nombre,
         (v.ticket_pdf_path IS NOT NULL AND BTRIM(v.ticket_pdf_path) <> '') AS ticket_pdf,
         COALESCE((
           SELECT SUM(d.cantidad)::int
           FROM venta_detalle d
           WHERE d.venta_id = v.id
         ), 0) AS total_productos,
         COALESCE(
           (
             SELECT json_agg(
               json_build_object(
                 'id', d.id,
                 'producto_nombre', d.producto_nombre,
                 'cantidad', d.cantidad,
                 'precio_unitario', d.precio_unitario::float8,
                 'subtotal', d.subtotal::float8,
                 'es_consignado', d.es_consignado,
                 'costo_consignacion', NULLIF(d.detalle->>'costo_consignacion', '')::float8,
                 'detalle', d.detalle
               )
               ORDER BY d.id
             )
             FROM venta_detalle d
             WHERE d.venta_id = v.id
           ),
           '[]'::json
         ) AS detalle
       FROM ventas v
       LEFT JOIN usuarios u ON u.id = v.usuario_id
       LEFT JOIN sucursales s ON s.id = v.sucursal_id
       ${where}
       ORDER BY v.created_at DESC, v.id DESC
       LIMIT $${idx}`,
      vals
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
