const { registrarMovimientoInventario } = require('./inventario-movimientos');
const { obtenerMapaPreciosCliente, precioEspecialParaProducto } = require('./cliente-precios');

const { normalizarRol } = require('../middleware/roles');

function redondearMoneda(n) {
  return Math.round(Number(n) * 100) / 100;
}

function esDuenoUsuario(rol) {
  return normalizarRol(rol) === 'dueno';
}

function precioVentaValido(producto, precioUnitario, { precioLibreDueno = false } = {}) {
  const precio = Number(precioUnitario);
  if (!Number.isFinite(precio) || precio <= 0) return false;
  if (precioLibreDueno) return true;
  const min = Number(producto.precio);
  const max = producto.precio_max != null ? Number(producto.precio_max) : min;
  if (!Number.isFinite(min)) return false;
  if (Number.isFinite(max) && max > min) {
    return precio >= min && precio <= max;
  }
  return Math.round(precio * 100) === Math.round(min * 100);
}

async function obtenerSucursalVenta(client, sucursalId) {
  const sucCheck = await client.query(
    'SELECT id, nombre, mp_terminal_id FROM sucursales WHERE id = $1 AND activo IS NOT FALSE',
    [sucursalId]
  );
  if (sucCheck.rows.length === 0) {
    throw new Error('Sucursal no válida');
  }
  return sucCheck.rows[0];
}

async function prepararLineasVenta(client, {
  items,
  sucursalId,
  bloquearStock = true,
  rolUsuario = null,
  clienteId = null,
} = {}) {
  const lock = bloquearStock ? ' FOR UPDATE' : '';
  const lineas = [];
  const cantidadPorProducto = new Map();
  const consignadoIds = new Set();
  const precioLibreDueno = esDuenoUsuario(rolUsuario);
  const preciosCliente = await obtenerMapaPreciosCliente(client, clienteId);

  for (const raw of items) {
    const esConsignado = Boolean(raw?.es_consignado ?? raw?.consignado);
    const cantidad = parseInt(raw?.cantidad, 10);
    const precioUnitario = Number(raw?.precio_unitario ?? raw?.precioUnitario ?? raw?.precio);

    if (!Number.isFinite(cantidad) || cantidad < 1) {
      throw new Error('Cantidad inválida en uno de los productos');
    }
    if (!Number.isFinite(precioUnitario) || precioUnitario <= 0) {
      throw new Error('Precio inválido en uno de los productos');
    }

    if (esConsignado) {
      const consignadoId = Number(raw?.producto_consignado_id ?? raw?.consignado_id ?? raw?.consignadoId);
      if (!Number.isFinite(consignadoId)) {
        throw new Error('producto_consignado_id es requerido para productos consignados');
      }
      if (consignadoIds.has(consignadoId)) {
        throw new Error('Producto consignado duplicado en la venta');
      }
      consignadoIds.add(consignadoId);

      const consRes = await client.query(
        `SELECT id, nombre, costo_consignacion::float8 AS costo_consignacion,
                precio_venta::float8 AS precio_venta, categoria, sucursal_id
         FROM productos_consignados
         WHERE id = $1${lock}`,
        [consignadoId]
      );
      if (consRes.rows.length === 0) {
        throw new Error(`Producto consignado ${consignadoId} no encontrado`);
      }
      const cons = consRes.rows[0];
      if (Number(cons.sucursal_id) !== sucursalId) {
        throw new Error(`«${cons.nombre}» no pertenece a la sucursal seleccionada`);
      }
      // `cliente_precios` identifica el producto por categoría + nombre: el mismo
      // artículo debe costar igual esté en `productos` o en `productos_consignados`.
      const precioEspecialCons = precioLibreDueno ? null : precioEspecialParaProducto(preciosCliente, cons);
      if (precioEspecialCons == null
        && !precioLibreDueno
        && Math.round(precioUnitario * 100) !== Math.round(Number(cons.precio_venta) * 100)) {
        throw new Error(`Precio inválido para «${cons.nombre}»`);
      }
      if (cantidad !== 1) {
        throw new Error('Los productos consignados solo se venden de uno en uno');
      }
      const precioFinalCons = precioEspecialCons != null
        ? redondearMoneda(precioEspecialCons)
        : precioUnitario;

      lineas.push({
        es_consignado: true,
        producto_id: null,
        producto_consignado_id: consignadoId,
        producto_nombre: cons.nombre,
        cantidad: 1,
        precio_unitario: precioFinalCons,
        subtotal: redondearMoneda(precioFinalCons),
        detalle: {
          costo_consignacion: cons.costo_consignacion,
          categoria: cons.categoria,
          ...(precioEspecialCons != null
            ? { precio_lista: Number(cons.precio_venta), precio_especial_cliente: true }
            : {}),
        },
      });
      continue;
    }

    const productoId = Number(raw?.producto_id ?? raw?.productoId ?? raw?.id);
    if (!Number.isFinite(productoId)) {
      throw new Error('producto_id inválido');
    }

    const claveCantidad = `${productoId}`;
    cantidadPorProducto.set(claveCantidad, (cantidadPorProducto.get(claveCantidad) || 0) + cantidad);

    lineas.push({
      es_consignado: false,
      producto_id: productoId,
      producto_consignado_id: null,
      producto_nombre: String(raw?.producto_nombre ?? raw?.nombre ?? '').trim() || `Producto ${productoId}`,
      cantidad,
      precio_unitario: precioUnitario,
      subtotal: redondearMoneda(precioUnitario * cantidad),
      detalle: null,
      _pendiente_producto: true,
    });
  }

  const productosCache = new Map();
  // Siempre en el mismo orden de id: dos cajas con los mismos productos en orden
  // inverso se bloquearían entre sí al tomar los FOR UPDATE.
  const idsOrdenados = [...cantidadPorProducto.keys()]
    .map(Number)
    .sort((a, b) => a - b);
  for (const productoId of idsOrdenados) {
    const cantidadTotal = cantidadPorProducto.get(`${productoId}`);
    const prodRes = await client.query(
      `SELECT id, nombre, precio::float8 AS precio, precio_max::float8 AS precio_max,
              costo_compra::float8 AS costo_compra, stock, sucursal_id, categoria
       FROM productos
       WHERE id = $1${lock}`,
      [productoId]
    );
    if (prodRes.rows.length === 0) {
      throw new Error(`Producto ${productoId} no encontrado`);
    }
    const prod = prodRes.rows[0];
    if (Number(prod.sucursal_id) !== sucursalId) {
      throw new Error(`«${prod.nombre}» no pertenece a la sucursal seleccionada`);
    }
    const stock = Number(prod.stock) || 0;
    if (cantidadTotal > stock) {
      throw new Error(`Stock insuficiente para «${prod.nombre}» (disponible: ${stock})`);
    }
    productosCache.set(productoId, prod);
  }

  for (const linea of lineas) {
    if (linea.es_consignado || !linea._pendiente_producto) continue;
    const prod = productosCache.get(linea.producto_id);
    if (!prod) continue;

    // El precio especial del cliente lo manda el servidor, no el navegador.
    // El dueño conserva su precio libre si lo cambió a mano en el carrito.
    const precioEspecial = precioLibreDueno ? null : precioEspecialParaProducto(preciosCliente, prod);
    if (precioEspecial != null) {
      linea.precio_unitario = redondearMoneda(precioEspecial);
      linea.subtotal = redondearMoneda(linea.precio_unitario * linea.cantidad);
    } else if (!precioVentaValido(prod, linea.precio_unitario, { precioLibreDueno })) {
      throw new Error(`Precio inválido para «${prod.nombre}»`);
    }

    linea.producto_nombre = prod.nombre;
    linea.detalle = {
      costo_compra: prod.costo_compra,
      categoria: prod.categoria,
    };
    if (precioEspecial != null) {
      linea.detalle.precio_lista = Number(prod.precio);
      linea.detalle.precio_especial_cliente = true;
    }
    delete linea._pendiente_producto;
  }

  const subtotal = redondearMoneda(lineas.reduce((s, l) => s + l.subtotal, 0));
  return { lineas, subtotal, productosCache };
}

async function persistirVenta(client, {
  lineas,
  subtotal,
  sucursalId,
  usuarioId,
  metodoPago,
  productosCache,
  mpOrderId = null,
  mpPaymentId = null,
  clienteId = null,
  clienteNombre = null,
}) {
  const cliente = Number.isFinite(Number(clienteId)) && Number(clienteId) > 0 ? Number(clienteId) : null;
  const ventaRes = await client.query(
    `INSERT INTO ventas (sucursal_id, usuario_id, subtotal, total, metodo_pago, mp_order_id, mp_payment_id, cliente_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, sucursal_id, usuario_id, subtotal::float8 AS subtotal, total::float8 AS total,
               metodo_pago, mp_order_id, mp_payment_id, cliente_id, created_at`,
    [sucursalId, usuarioId, subtotal, subtotal, metodoPago, mpOrderId, mpPaymentId, cliente]
  );
  const venta = ventaRes.rows[0];
  if (cliente) venta.cliente_nombre = clienteNombre || null;

  const detalleMovimiento = [];
  let cantidadMovimientoInventario = 0;

  for (const linea of lineas) {
    await client.query(
      `INSERT INTO venta_detalle
         (venta_id, producto_id, producto_consignado_id, producto_nombre, cantidad,
          precio_unitario, subtotal, es_consignado, detalle)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [
        venta.id,
        linea.producto_id,
        linea.producto_consignado_id,
        linea.producto_nombre,
        linea.cantidad,
        linea.precio_unitario,
        linea.subtotal,
        linea.es_consignado,
        linea.detalle ? JSON.stringify(linea.detalle) : null,
      ]
    );

    if (linea.es_consignado) {
      await client.query('DELETE FROM productos_consignados WHERE id = $1', [linea.producto_consignado_id]);
      continue;
    }

    const prod = productosCache.get(linea.producto_id);
    const stockAntes = Number(prod.stock) || 0;
    const stockDespues = stockAntes - linea.cantidad;
    await client.query('UPDATE productos SET stock = $1 WHERE id = $2', [stockDespues, linea.producto_id]);
    prod.stock = stockDespues;

    cantidadMovimientoInventario += linea.cantidad;
    detalleMovimiento.push({
      producto_id: linea.producto_id,
      nombre: linea.producto_nombre,
      cantidad: linea.cantidad,
      precio_unitario: linea.precio_unitario,
      subtotal: linea.subtotal,
      stock_antes: stockAntes,
      stock_despues: stockDespues,
      costo_compra: prod.costo_compra,
    });
  }

  if (detalleMovimiento.length > 0) {
    const nombres = detalleMovimiento.map((p) => p.nombre).filter(Boolean).join(', ');
    await registrarMovimientoInventario({
      executor: client,
      productoId: null,
      productoNombre: nombres || 'Venta',
      movimiento: 'venta',
      cantidad: -cantidadMovimientoInventario,
      usuarioId,
      sucursalId,
      detalle: {
        venta_id: venta.id,
        total: subtotal,
        metodo_pago: metodoPago,
        total_productos: detalleMovimiento.length,
        productos: detalleMovimiento,
      },
    });
  }

  return venta;
}

module.exports = {
  redondearMoneda,
  precioVentaValido,
  obtenerSucursalVenta,
  prepararLineasVenta,
  persistirVenta,
};
