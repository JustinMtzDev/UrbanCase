const TIPOS_MOVIMIENTO_INVENTARIO = new Set([
  'venta',
  'entrada_mercancia',
  'ajuste_manual',
  'transferencia_salida',
  'transferencia_entrada',
  'devolucion',
  'otro',
]);

async function registrarMovimientoInventario({
  executor,
  productoId = null,
  productoNombre,
  movimiento,
  cantidad,
  usuarioId = null,
  sucursalId = null,
  detalle = null,
  strict = false,
}) {
  if (!executor || typeof executor.query !== 'function') {
    throw new Error('executor inválido para registrar movimiento de inventario');
  }
  if (!productoNombre || typeof productoNombre !== 'string') {
    throw new Error('productoNombre es requerido para registrar movimiento de inventario');
  }
  if (!TIPOS_MOVIMIENTO_INVENTARIO.has(movimiento)) {
    throw new Error(`Tipo de movimiento no soportado: ${movimiento}`);
  }
  const cant = Number(cantidad);
  if (!Number.isFinite(cant) || cant === 0) {
    throw new Error('cantidad inválida para registrar movimiento de inventario');
  }
  const productoIdNum = Number(productoId);
  const usuarioIdNum = Number(usuarioId);
  const sucursalIdNum = Number(sucursalId);
  const detalleJson = detalle && typeof detalle === 'object' ? JSON.stringify(detalle) : null;

  try {
    await executor.query(
      `INSERT INTO inventario_movimientos
         (producto_id, producto_nombre, movimiento, cantidad, usuario_id, sucursal_id, detalle)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        Number.isFinite(productoIdNum) ? productoIdNum : null,
        String(productoNombre).trim().slice(0, 500),
        movimiento,
        Math.trunc(cant),
        Number.isFinite(usuarioIdNum) ? usuarioIdNum : null,
        Number.isFinite(sucursalIdNum) ? sucursalIdNum : null,
        detalleJson,
      ]
    );
    return true;
  } catch (err) {
    if (strict) throw err;
    console.warn('No se pudo registrar movimiento de inventario:', err.message);
    return false;
  }
}

module.exports = {
  TIPOS_MOVIMIENTO_INVENTARIO,
  registrarMovimientoInventario,
};
