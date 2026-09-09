const { registrarMovimientoInventario } = require('./inventario-movimientos');
const {
  ajustarComisionAcumulada,
  calcularComisionDiaria,
  normalizarDiaSql,
  obtenerVentasDiaUsuario,
  rolGeneraComision,
  sincronizarComisionDiariaUsuario,
  TZ,
} = require('./comisiones');
const { armarDatosNotaDevolucion } = require('./ticket-contenido');
const { generarPdfNotaDevolucion } = require('./ticket-pdf');
const { encolarImpresionPoint, terminalParaSucursal } = require('./ticket-point');

async function obtenerVentaParaDevolucion(client, ventaId) {
  const { rows } = await client.query(
    `SELECT v.id, v.sucursal_id, v.usuario_id, v.total::float8 AS total, v.metodo_pago,
            v.created_at, v.devuelta_at, v.cliente_id,
            s.nombre AS sucursal_nombre, s.mp_terminal_id,
            c.nombre AS cliente_nombre,
            u.nombre AS usuario_nombre
     FROM ventas v
     JOIN sucursales s ON s.id = v.sucursal_id
     LEFT JOIN clientes c ON c.id = v.cliente_id
     LEFT JOIN usuarios u ON u.id = v.usuario_id
     WHERE v.id = $1
     FOR UPDATE OF v`,
    [ventaId]
  );
  return rows[0] || null;
}

async function obtenerLineasVenta(client, ventaId) {
  const { rows } = await client.query(
    `SELECT id, producto_id, producto_consignado_id, producto_nombre, cantidad,
            precio_unitario::float8 AS precio_unitario, subtotal::float8 AS subtotal,
            es_consignado, detalle
     FROM venta_detalle
     WHERE venta_id = $1
     ORDER BY id`,
    [ventaId]
  );
  return rows;
}

async function regresarStockProducto(client, { linea, venta, usuarioId, motivo }) {
  const { rows } = await client.query(
    `UPDATE productos
     SET stock = COALESCE(stock, 0) + $1
     WHERE id = $2
     RETURNING id, nombre, stock`,
    [linea.cantidad, linea.producto_id]
  );
  const producto = rows[0] || null;
  await registrarMovimientoInventario({
    executor: client,
    productoId: producto ? producto.id : null,
    productoNombre: producto ? producto.nombre : linea.producto_nombre,
    movimiento: 'devolucion',
    cantidad: linea.cantidad,
    usuarioId,
    sucursalId: venta.sucursal_id,
    detalle: {
      motivo: motivo || null,
      venta_id: venta.id,
      precio_unitario: linea.precio_unitario,
      // El producto pudo haberse eliminado después de la venta: ahí no hay stock que regresar.
      producto_eliminado: !producto,
      stock_despues: producto ? Number(producto.stock) : null,
    },
    strict: true,
  });
  return Boolean(producto);
}

// Los consignados se borran de `productos_consignados` al venderse, así que la
// devolución los vuelve a crear con los datos guardados en la venta.
async function reponerConsignado(client, { linea, venta, usuarioId, motivo }) {
  const detalle = linea.detalle || {};
  const precioVenta = Number(linea.precio_unitario) || 0;
  const costoCrudo = Number(detalle.costo_consignacion);
  const costo = Number.isFinite(costoCrudo) && costoCrudo > 0 && costoCrudo <= precioVenta
    ? costoCrudo
    : precioVenta;
  if (precioVenta <= 0) return;

  const { rows } = await client.query(
    `INSERT INTO productos_consignados (sucursal_id, nombre, costo_consignacion, precio_venta, categoria)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [venta.sucursal_id, linea.producto_nombre, costo, precioVenta, detalle.categoria || null]
  );
  await registrarMovimientoInventario({
    executor: client,
    productoId: null,
    productoNombre: linea.producto_nombre,
    movimiento: 'devolucion',
    cantidad: linea.cantidad,
    usuarioId,
    sucursalId: venta.sucursal_id,
    detalle: {
      motivo: motivo || null,
      venta_id: venta.id,
      consignado: true,
      consignado_id: rows[0]?.id || null,
      precio_unitario: precioVenta,
    },
    strict: true,
  });
}

// Con la fila del día presente basta volver a sincronizarla. Si ya la borró
// `purgarComisionesAntiguas` (ventas de más de 7 días) no hay nada que
// sincronizar, así que se descuenta el delta explícito del acumulado.
async function ajustarComisionPorDevolucion(client, venta) {
  const usuarioId = Number(venta.usuario_id);
  if (!Number.isFinite(usuarioId) || usuarioId <= 0) return;

  const { rows } = await client.query(
    `SELECT (v.created_at AT TIME ZONE '${TZ}')::date AS dia
     FROM ventas v WHERE v.id = $1`,
    [venta.id]
  );
  const dia = normalizarDiaSql(rows[0]?.dia);
  if (!dia) return;

  const existente = await client.query(
    'SELECT 1 FROM usuario_comision_diaria WHERE usuario_id = $1 AND dia = $2::date',
    [usuarioId, dia]
  );
  if (existente.rows.length) {
    await sincronizarComisionDiariaUsuario(client, usuarioId, dia);
    return;
  }

  const { rows: userRows } = await client.query(
    'SELECT rol FROM usuarios WHERE id = $1',
    [usuarioId]
  );
  if (!userRows.length || !rolGeneraComision(userRows[0].rol)) return;

  // La venta ya quedó marcada como devuelta: este total es el del día sin ella.
  const { ventas_total: ventasSinLaVenta } = await obtenerVentasDiaUsuario(client, usuarioId, dia);
  const totalVenta = Number(venta.total) || 0;
  const delta = calcularComisionDiaria(ventasSinLaVenta)
    - calcularComisionDiaria(ventasSinLaVenta + totalVenta);
  await ajustarComisionAcumulada(client, usuarioId, delta);
}

/**
 * Devuelve una venta completa dentro de la transacción recibida: regresa el
 * stock, deja el rastro en movimientos y marca la venta como devuelta.
 */
async function registrarDevolucion(client, { ventaId, usuarioId, autorizadoPor, motivo }) {
  const venta = await obtenerVentaParaDevolucion(client, ventaId);
  if (!venta) throw new Error('Venta no encontrada');
  if (venta.devuelta_at) throw new Error('Esta venta ya fue devuelta');

  const lineas = await obtenerLineasVenta(client, ventaId);
  if (lineas.length === 0) throw new Error('La venta no tiene productos que devolver');

  const advertencias = [];
  for (const linea of lineas) {
    if (linea.es_consignado) {
      await reponerConsignado(client, { linea, venta, usuarioId, motivo });
      continue;
    }
    if (linea.producto_id == null) continue;
    const repuesto = await regresarStockProducto(client, { linea, venta, usuarioId, motivo });
    if (!repuesto) {
      advertencias.push(`«${linea.producto_nombre}» ya no existe en el catálogo: no se repuso stock`);
    }
  }

  const { rows: devRows } = await client.query(
    `INSERT INTO devoluciones
       (venta_id, sucursal_id, usuario_id, autorizado_por, motivo, total, metodo_pago)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, venta_id, sucursal_id, usuario_id, autorizado_por, motivo,
               total::float8 AS total, metodo_pago, created_at`,
    [
      venta.id,
      venta.sucursal_id,
      usuarioId,
      autorizadoPor,
      motivo || null,
      venta.total,
      venta.metodo_pago,
    ]
  );
  const devolucion = devRows[0];

  await client.query('UPDATE ventas SET devuelta_at = NOW() WHERE id = $1', [venta.id]);
  await ajustarComisionPorDevolucion(client, venta);

  return { devolucion, venta, lineas, advertencias };
}

async function emitirNotaDevolucion(pool, {
  devolucion,
  venta,
  lineas,
  usuarioNombre,
  autorizadoPorNombre,
}) {
  const datos = armarDatosNotaDevolucion({
    venta,
    devolucion,
    sucursalNombre: venta.sucursal_nombre,
    usuarioNombre,
    autorizadoPorNombre,
    lineas,
    clienteNombre: venta.cliente_nombre,
  });
  const nota = { pdf: false, print: false, print_omitido: false, print_error: null };

  try {
    const relativo = await generarPdfNotaDevolucion(datos);
    await pool.query('UPDATE devoluciones SET nota_pdf_path = $1 WHERE id = $2', [
      relativo,
      devolucion.id,
    ]);
    nota.pdf = true;
  } catch (err) {
    console.error('Nota devolución PDF:', err.message);
  }

  const printRes = encolarImpresionPoint({
    datos,
    terminalId: terminalParaSucursal({ mp_terminal_id: venta.mp_terminal_id }),
    onOk: async () => {
      try {
        await pool.query('UPDATE devoluciones SET nota_impresa_at = NOW() WHERE id = $1', [
          devolucion.id,
        ]);
      } catch (err) {
        console.error('nota_impresa_at:', err.message);
      }
    },
    onFail: async (error) => {
      console.error('Nota devolución Point', devolucion.id, error);
    },
  });
  if (printRes.ok) {
    nota.print = true;
    nota.print_en_cola = Boolean(printRes.encolado);
  } else {
    nota.print_omitido = Boolean(printRes.omitido);
    nota.print_error = printRes.error || null;
  }

  return { nota, datos };
}

module.exports = {
  registrarDevolucion,
  emitirNotaDevolucion,
};
