const { Router } = require('express');
const pool = require('../config/db');
const { registrarMovimientoInventario } = require('../services/inventario-movimientos');
const {
  registrarHistorialProductoAlta,
  registrarHistorialProductoEdicion,
  registrarHistorialProductoEliminacion,
} = require('../services/productos-historial');

const router = Router();
const IMAGEN_MAX_BASE64 = 3_500_000;

const SQL_LISTAR_TODAS_SUCURSALES = `
  SELECT p.id, p.nombre, p.precio::float8 AS precio, p.precio_max::float8 AS precio_max,
         p.costo_compra::float8 AS costo_compra,
         p.stock, p.categoria, p.imagen, p.sucursal_id,
         p.created_at, COALESCE(s.nombre, 'Sin sucursal') AS sucursal_nombre
  FROM productos p
  LEFT JOIN sucursales s ON s.id = p.sucursal_id
  ORDER BY COALESCE(s.nombre, '') ASC, p.id ASC
`;

async function obtenerProductosTodasLasSucursales() {
  const { rows } = await pool.query(SQL_LISTAR_TODAS_SUCURSALES);
  return rows.map((row) => ({ ...row, id_sucursal: row.sucursal_id }));
}

/** Sin query string: evita que proxies o clientes pierdan sucursal_id=all */
router.get('/inventario-todas-sucursales', async (req, res) => {
  try {
    res.json(await obtenerProductosTodasLasSucursales());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  let sid = req.query.sucursal_id ?? req.query.sucursalId;
  if (Array.isArray(sid)) sid = sid[0];
  const sidStr = sid != null && sid !== '' ? String(sid).trim() : '';
  const sidLower = sidStr.toLowerCase();
  if (sidLower === 'all' || sidLower === 'todas') {
    try {
      res.json(await obtenerProductosTodasLasSucursales());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }
  if (sidStr === '' || Number.isNaN(Number(sidStr))) {
    return res.status(400).json({
      error: 'sucursal_id es requerido para listar productos (o GET /api/productos/inventario-todas-sucursales)',
    });
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, nombre, precio::float8 AS precio, precio_max::float8 AS precio_max,
              costo_compra::float8 AS costo_compra,
              stock, categoria, imagen, sucursal_id, created_at
       FROM productos
       WHERE sucursal_id = $1
       ORDER BY id`,
      [Number(sidStr)]
    );
    res.json(rows.map((row) => ({ ...row, id_sucursal: row.sucursal_id })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function normalizarPrecioMaxProducto(precioNum, precioMaxRaw) {
  if (precioMaxRaw == null || precioMaxRaw === '') return null;
  const precioMaxNum = Number(precioMaxRaw);
  if (!Number.isFinite(precioMaxNum) || precioMaxNum <= precioNum) return null;
  return precioMaxNum;
}

function normalizarCostoCompraProducto(costoCompraRaw) {
  if (costoCompraRaw == null || costoCompraRaw === '') return null;
  const costoNum = Number(costoCompraRaw);
  if (!Number.isFinite(costoNum) || costoNum <= 0) return null;
  return costoNum;
}

function calcularPromedioCostoCompra(stockActual, costoActual, cantidadEntrada, costoEntrada) {
  const stock = Math.max(0, Number(stockActual) || 0);
  const qty = Math.max(0, Math.trunc(Number(cantidadEntrada) || 0));
  const costoN = Number(costoEntrada);
  if (!Number.isFinite(costoN) || costoN <= 0 || qty <= 0) return null;
  if (stock <= 0) return Math.round(costoN * 100) / 100;
  const costoPrev = Number(costoActual);
  if (!Number.isFinite(costoPrev) || costoPrev <= 0) return Math.round(costoN * 100) / 100;
  const promedio = (stock * costoPrev + qty * costoN) / (stock + qty);
  return Math.round(promedio * 100) / 100;
}

router.post('/', async (req, res) => {
  let { nombre, precio, precio_max, costo_compra, stock, categoria, imagen, sucursal_id, id_sucursal } = req.body || {};
  const sid = sucursal_id != null ? sucursal_id : id_sucursal;
  if (!nombre || typeof nombre !== 'string' || nombre.trim().length === 0) {
    return res.status(400).json({ error: 'El nombre del producto es requerido' });
  }
  if (sid == null || sid === '' || Number.isNaN(Number(sid))) {
    return res.status(400).json({ error: 'sucursal_id es requerido' });
  }
  const precioNum = Number(precio);
  const stockNum = parseInt(stock, 10);
  if (!Number.isFinite(precioNum) || precioNum <= 0) {
    return res.status(400).json({ error: 'precio inválido' });
  }
  if (!Number.isFinite(stockNum) || stockNum < 0) {
    return res.status(400).json({ error: 'stock inválido' });
  }
  const catNorm = categoria ? String(categoria).trim().slice(0, 80) : null;
  try {
    const check = await pool.query('SELECT 1 FROM sucursales WHERE id = $1', [Number(sid)]);
    if (check.rows.length === 0) return res.status(400).json({ error: 'Sucursal no válida' });
    const img = normalizarImagenProducto(imagen);
    if (img === false) return res.status(400).json({ error: 'La imagen es demasiado grande' });
    const precioMaxNum = normalizarPrecioMaxProducto(precioNum, precio_max);
    const costoCompraNum = normalizarCostoCompraProducto(costo_compra);
    const { rows } = await pool.query(
      `INSERT INTO productos (sucursal_id, nombre, precio, precio_max, costo_compra, stock, categoria, imagen)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, nombre, precio::float8 AS precio, precio_max::float8 AS precio_max,
                 costo_compra::float8 AS costo_compra,
                 stock, categoria, imagen, sucursal_id, created_at`,
      [Number(sid), nombre.trim(), precioNum, precioMaxNum, costoCompraNum, stockNum, catNorm, img]
    );
    const row = rows[0];
    if (stockNum > 0) {
      await registrarMovimientoInventario({
        executor: pool,
        productoId: row.id,
        productoNombre: row.nombre,
        movimiento: 'entrada_mercancia',
        cantidad: stockNum,
        usuarioId: req.usuario?.id,
        sucursalId: row.sucursal_id,
        detalle: { motivo: 'alta_producto' },
      });
    }
    await registrarHistorialProductoAlta({
      executor: pool,
      producto: row,
      usuarioId: req.usuario?.id,
    });
    res.status(201).json({ ...row, id_sucursal: row.sucursal_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });
  const { nombre, precio, precio_max, costo_compra, stock, categoria, imagen } = req.body || {};
  try {
    const previoRes = await pool.query(
      `SELECT id, nombre, precio::float8 AS precio, precio_max::float8 AS precio_max,
              costo_compra::float8 AS costo_compra, stock, categoria, imagen, sucursal_id
       FROM productos WHERE id = $1`,
      [id]
    );
    if (previoRes.rows.length === 0) return res.status(404).json({ error: 'Producto no encontrado' });
    const previo = previoRes.rows[0];

    const set = [];
    const vals = [];
    const camposActualizados = [];
    let idx = 1;
    if (nombre != null) {
      const n = String(nombre).trim();
      if (!n) return res.status(400).json({ error: 'nombre inválido' });
      set.push(`nombre = $${idx++}`);
      vals.push(n);
      camposActualizados.push('nombre');
    }
    if (precio != null) {
      const precioNum = Number(precio);
      if (!Number.isFinite(precioNum) || precioNum <= 0) return res.status(400).json({ error: 'precio inválido' });
      set.push(`precio = $${idx++}`);
      vals.push(precioNum);
      camposActualizados.push('precio');
    }
    if (precio_max !== undefined) {
      let precioRef = precio != null ? Number(precio) : NaN;
      if (!Number.isFinite(precioRef)) {
        const cur = await pool.query('SELECT precio::float8 AS precio FROM productos WHERE id = $1', [id]);
        if (cur.rows.length === 0) return res.status(404).json({ error: 'Producto no encontrado' });
        precioRef = Number(cur.rows[0].precio);
      }
      const precioMaxNum = normalizarPrecioMaxProducto(precioRef, precio_max);
      set.push(`precio_max = $${idx++}`);
      vals.push(precioMaxNum);
      camposActualizados.push('precio_max');
    }
    if (costo_compra !== undefined) {
      const costoCompraNum = normalizarCostoCompraProducto(costo_compra);
      set.push(`costo_compra = $${idx++}`);
      vals.push(costoCompraNum);
      camposActualizados.push('costo_compra');
    }
    if (stock != null) {
      const stockNum = parseInt(stock, 10);
      if (!Number.isFinite(stockNum) || stockNum < 0) return res.status(400).json({ error: 'stock inválido' });
      set.push(`stock = $${idx++}`);
      vals.push(stockNum);
      camposActualizados.push('stock');
    }
    if (categoria !== undefined) {
      set.push(`categoria = $${idx++}`);
      vals.push(categoria ? String(categoria).slice(0, 80) : null);
      camposActualizados.push('categoria');
    }
    if (imagen !== undefined) {
      const img = normalizarImagenProducto(imagen);
      if (img === false) return res.status(400).json({ error: 'La imagen es demasiado grande' });
      set.push(`imagen = $${idx++}`);
      vals.push(img);
      camposActualizados.push('imagen');
    }
    if (set.length === 0) return res.status(400).json({ error: 'Sin campos para actualizar' });
    vals.push(id);
    const { rows } = await pool.query(
      `UPDATE productos SET ${set.join(', ')} WHERE id = $${idx}
       RETURNING id, nombre, precio::float8 AS precio, precio_max::float8 AS precio_max,
                 costo_compra::float8 AS costo_compra,
                 stock, categoria, imagen, sucursal_id, created_at`,
      vals
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Producto no encontrado' });
    const row = rows[0];
    if (stock != null) {
      const stockAntes = Number(previo.stock) || 0;
      const stockDespues = Number(row.stock) || 0;
      const delta = stockDespues - stockAntes;
      if (delta !== 0) {
        await registrarMovimientoInventario({
          executor: pool,
          productoId: row.id,
          productoNombre: row.nombre || previo.nombre,
          movimiento: 'ajuste_manual',
          cantidad: delta,
          usuarioId: req.usuario?.id,
          sucursalId: row.sucursal_id ?? previo.sucursal_id,
          detalle: { stock_antes: stockAntes, stock_despues: stockDespues },
        });
      }
    }
    await registrarHistorialProductoEdicion({
      executor: pool,
      previo,
      actual: row,
      usuarioId: req.usuario?.id,
      camposActualizados,
    });
    res.json({ ...row, id_sucursal: row.sucursal_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function normalizarImagenProducto(imagen) {
  if (imagen == null || imagen === '') return null;
  if (typeof imagen !== 'string') return null;
  if (imagen.length > IMAGEN_MAX_BASE64) return false;
  return imagen;
}

router.post('/restock-rapido', async (req, res) => {
  const items = req.body?.items;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Se requiere al menos un producto para restock' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const productos = [];
    const detalleProductos = [];
    let cantidadTotal = 0;
    let sucursalRestockId = null;

    for (const raw of items) {
      const productoId = Number(raw?.producto_id);
      const cantidad = parseInt(raw?.cantidad, 10);
      const costoEntrada = normalizarCostoCompraProducto(raw?.costo_compra);

      if (!Number.isFinite(productoId)) {
        throw new Error('producto_id inválido');
      }
      if (!Number.isFinite(cantidad) || cantidad < 1) {
        throw new Error(`Cantidad inválida para producto ${productoId}`);
      }
      if (costoEntrada == null) {
        throw new Error('Cada producto debe incluir un costo de compra válido');
      }

      const prevRes = await client.query(
        `SELECT id, nombre, stock, costo_compra::float8 AS costo_compra, sucursal_id
         FROM productos
         WHERE id = $1
         FOR UPDATE`,
        [productoId]
      );
      if (prevRes.rows.length === 0) {
        throw new Error(`Producto ${productoId} no encontrado`);
      }
      const previo = prevRes.rows[0];
      const stockAntes = Number(previo.stock) || 0;
      const costoPromedio = calcularPromedioCostoCompra(stockAntes, previo.costo_compra, cantidad, costoEntrada);
      const stockDespues = stockAntes + cantidad;

      const { rows } = await client.query(
        `UPDATE productos
         SET stock = $1, costo_compra = $2
         WHERE id = $3
         RETURNING id, nombre, stock, costo_compra::float8 AS costo_compra, sucursal_id`,
        [stockDespues, costoPromedio, productoId]
      );
      const actual = rows[0];
      const sucursalId = actual.sucursal_id ?? previo.sucursal_id;
      if (sucursalRestockId == null) sucursalRestockId = sucursalId;

      cantidadTotal += cantidad;
      detalleProductos.push({
        producto_id: actual.id,
        nombre: actual.nombre || previo.nombre,
        cantidad,
        stock_antes: stockAntes,
        stock_despues: stockDespues,
        costo_anterior: previo.costo_compra,
        costo_entrada: costoEntrada,
        costo_promedio: costoPromedio,
        sucursal_id: sucursalId,
      });

      productos.push({ ...actual, id_sucursal: actual.sucursal_id });
    }

    if (detalleProductos.length > 0) {
      const nombresProductos = detalleProductos.map((p) => p.nombre).filter(Boolean).join(', ');
      await registrarMovimientoInventario({
        executor: client,
        productoId: null,
        productoNombre: nombresProductos || 'Restock rápido',
        movimiento: 'restock_rapido',
        cantidad: cantidadTotal,
        usuarioId: req.usuario?.id,
        sucursalId: sucursalRestockId,
        detalle: {
          motivo: 'restock_rapido',
          total_productos: detalleProductos.length,
          productos: detalleProductos,
        },
      });
    }

    await client.query('COMMIT');
    res.json({ ok: true, productos });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.post('/trasladar', async (req, res) => {
  const productoId = Number(req.body?.producto_id);
  const cantidad = parseInt(req.body?.cantidad, 10);
  const sucursalDestinoId = Number(req.body?.sucursal_destino_id ?? req.body?.sucursalDestinoId);

  if (!Number.isFinite(productoId)) {
    return res.status(400).json({ error: 'producto_id inválido' });
  }
  if (!Number.isFinite(cantidad) || cantidad < 1) {
    return res.status(400).json({ error: 'cantidad inválida' });
  }
  if (!Number.isFinite(sucursalDestinoId)) {
    return res.status(400).json({ error: 'sucursal_destino_id inválido' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const origRes = await client.query(
      `SELECT id, nombre, precio, precio_max, costo_compra, stock, categoria, imagen, sucursal_id
       FROM productos
       WHERE id = $1
       FOR UPDATE`,
      [productoId]
    );
    if (origRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    const origen = origRes.rows[0];
    const stockOrigen = Number(origen.stock) || 0;
    if (cantidad > stockOrigen) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Stock insuficiente (disponible: ${stockOrigen})` });
    }
    if (Number(origen.sucursal_id) === sucursalDestinoId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'La sucursal destino debe ser distinta a la de origen' });
    }

    const sucCheck = await client.query(
      'SELECT id FROM sucursales WHERE id = $1 AND activo IS NOT FALSE',
      [sucursalDestinoId]
    );
    if (sucCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Sucursal destino no válida' });
    }

    await client.query('UPDATE productos SET stock = stock - $1 WHERE id = $2', [cantidad, productoId]);

    const matchRes = await client.query(
      `SELECT id FROM productos
       WHERE sucursal_id = $1
         AND nombre = $2
         AND COALESCE(categoria, '') = COALESCE($3, '')
         AND precio = $4
         AND precio_max IS NOT DISTINCT FROM $5
         AND costo_compra IS NOT DISTINCT FROM $6
       ORDER BY id
       LIMIT 1
       FOR UPDATE`,
      [
        sucursalDestinoId,
        origen.nombre,
        origen.categoria,
        origen.precio,
        origen.precio_max,
        origen.costo_compra,
      ]
    );

    let productoDestinoId;
    if (matchRes.rows.length > 0) {
      productoDestinoId = matchRes.rows[0].id;
      await client.query('UPDATE productos SET stock = stock + $1 WHERE id = $2', [cantidad, productoDestinoId]);
    } else {
      const insRes = await client.query(
        `INSERT INTO productos (sucursal_id, nombre, precio, precio_max, costo_compra, stock, categoria, imagen)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          sucursalDestinoId,
          origen.nombre,
          origen.precio,
          origen.precio_max,
          origen.costo_compra,
          cantidad,
          origen.categoria,
          origen.imagen,
        ]
      );
      productoDestinoId = insRes.rows[0].id;
    }

    const usuarioId = req.usuario?.id != null ? Number(req.usuario.id) : null;
    const trasladoRes = await client.query(
      `INSERT INTO inventario_traslados
         (producto_origen_id, producto_destino_id, sucursal_origen_id, sucursal_destino_id, cantidad, usuario_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [productoId, productoDestinoId, origen.sucursal_id, sucursalDestinoId, cantidad, usuarioId]
    );
    const trasladoId = trasladoRes.rows[0]?.id;

    await registrarMovimientoInventario({
      executor: client,
      productoId,
      productoNombre: origen.nombre,
      movimiento: 'transferencia_salida',
      cantidad: -cantidad,
      usuarioId,
      sucursalId: origen.sucursal_id,
      detalle: { traslado_id: trasladoId, sucursal_destino_id: sucursalDestinoId, producto_destino_id: productoDestinoId },
    });
    await registrarMovimientoInventario({
      executor: client,
      productoId: productoDestinoId,
      productoNombre: origen.nombre,
      movimiento: 'transferencia_entrada',
      cantidad,
      usuarioId,
      sucursalId: sucursalDestinoId,
      detalle: { traslado_id: trasladoId, sucursal_origen_id: origen.sucursal_id, producto_origen_id: productoId },
    });

    await client.query('COMMIT');
    res.json({
      ok: true,
      producto_origen_id: productoId,
      producto_destino_id: productoDestinoId,
      sucursal_origen_id: Number(origen.sucursal_id),
      sucursal_destino_id: sucursalDestinoId,
      cantidad,
      stock_origen: stockOrigen - cantidad,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });
  try {
    const { rows } = await pool.query(
      'DELETE FROM productos WHERE id = $1 RETURNING id, nombre, stock, sucursal_id',
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Producto no encontrado' });
    const row = rows[0];
    const stockPrevio = Number(row.stock) || 0;
    if (stockPrevio > 0) {
      await registrarMovimientoInventario({
        executor: pool,
        productoId: row.id,
        productoNombre: row.nombre,
        movimiento: 'ajuste_manual',
        cantidad: -stockPrevio,
        usuarioId: req.usuario?.id,
        sucursalId: row.sucursal_id,
        detalle: { motivo: 'eliminacion_producto', stock_antes: stockPrevio, stock_despues: 0 },
      });
    }
    await registrarHistorialProductoEliminacion({
      executor: pool,
      producto: row,
      usuarioId: req.usuario?.id,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
