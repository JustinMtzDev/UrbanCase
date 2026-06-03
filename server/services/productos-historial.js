const ACCIONES_PRODUCTO_HISTORIAL = new Set(['alta', 'edicion', 'eliminacion']);

const CAMPOS_EDICION_HISTORIAL = [
  'nombre',
  'precio',
  'precio_max',
  'stock',
  'categoria',
  'imagen',
];

function etiquetaCampoHistorial(campo) {
  const map = {
    nombre: 'Nombre',
    precio: 'Precio',
    precio_max: 'Precio máximo',
    stock: 'Stock',
    categoria: 'Categoría',
    imagen: 'Imagen',
  };
  return map[campo] || campo || '—';
}

function formatearValorHistorial(campo, valor) {
  if (campo === 'imagen') {
    return valor ? 'Con imagen' : 'Sin imagen';
  }
  if (valor == null || valor === '') return '—';
  if (campo === 'precio' || campo === 'precio_max') {
    const n = Number(valor);
    if (Number.isFinite(n)) return `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
  }
  if (campo === 'stock') {
    const n = parseInt(valor, 10);
    if (Number.isFinite(n)) return String(n);
  }
  return String(valor);
}

const CAMPOS_NUMERICOS_HISTORIAL = new Set(['precio', 'precio_max', 'stock']);

function normalizarNumeroHistorial(valor) {
  if (valor == null || valor === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function valoresCampoEquivalentes(campo, antes, despues) {
  if (campo === 'imagen') {
    const a = antes ? 1 : 0;
    const b = despues ? 1 : 0;
    if (a !== b) return false;
    if (!antes && !despues) return true;
    return String(antes) === String(despues);
  }
  if (CAMPOS_NUMERICOS_HISTORIAL.has(campo)) {
    const a = campo === 'stock'
      ? (normalizarNumeroHistorial(antes) != null ? Math.trunc(normalizarNumeroHistorial(antes)) : null)
      : normalizarNumeroHistorial(antes);
    const b = campo === 'stock'
      ? (normalizarNumeroHistorial(despues) != null ? Math.trunc(normalizarNumeroHistorial(despues)) : null)
      : normalizarNumeroHistorial(despues);
    if (a == null && b == null) return true;
    if (a == null || b == null) return false;
    return Math.abs(a - b) < 0.005;
  }
  const a = antes == null || antes === '' ? null : String(antes).trim();
  const b = despues == null || despues === '' ? null : String(despues).trim();
  return a === b;
}

async function insertarHistorialProducto({
  executor,
  productoId,
  productoNombre,
  accion,
  campo = null,
  valorAnterior = null,
  valorNuevo = null,
  detalle = null,
  usuarioId = null,
  sucursalId = null,
  strict = false,
}) {
  if (!executor || typeof executor.query !== 'function') {
    throw new Error('executor inválido para registrar historial de producto');
  }
  if (!ACCIONES_PRODUCTO_HISTORIAL.has(accion)) {
    throw new Error(`Acción de historial no soportada: ${accion}`);
  }
  if (!productoNombre || typeof productoNombre !== 'string') {
    throw new Error('productoNombre es requerido para registrar historial de producto');
  }

  const productoIdNum = Number(productoId);
  const usuarioIdNum = Number(usuarioId);
  const sucursalIdNum = Number(sucursalId);
  const detalleJson = detalle && typeof detalle === 'object' ? JSON.stringify(detalle) : null;

  try {
    await executor.query(
      `INSERT INTO productos_historial
         (producto_id, producto_nombre, accion, campo, valor_anterior, valor_nuevo, detalle, usuario_id, sucursal_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
      [
        Number.isFinite(productoIdNum) ? productoIdNum : null,
        String(productoNombre).trim().slice(0, 500),
        accion,
        campo ? String(campo).slice(0, 80) : null,
        valorAnterior != null ? String(valorAnterior).slice(0, 2000) : null,
        valorNuevo != null ? String(valorNuevo).slice(0, 2000) : null,
        detalleJson,
        Number.isFinite(usuarioIdNum) ? usuarioIdNum : null,
        Number.isFinite(sucursalIdNum) ? sucursalIdNum : null,
      ]
    );
    return true;
  } catch (err) {
    if (strict) throw err;
    console.warn('No se pudo registrar historial de producto:', err.message);
    return false;
  }
}

async function registrarHistorialProductoAlta({
  executor,
  producto,
  usuarioId = null,
  strict = false,
}) {
  if (!producto) return false;
  const texto = 'Producto registrado en inventario';
  const costoCompraNum = Number(producto.costo_compra);
  const precioNum = Number(producto.precio);
  const stockNum = Number(producto.stock);
  const detalleAlta = {
    costo_compra: Number.isFinite(costoCompraNum) ? Math.round(costoCompraNum * 100) / 100 : null,
    precio: Number.isFinite(precioNum) ? Math.round(precioNum * 100) / 100 : null,
    stock: Number.isFinite(stockNum) ? Math.max(0, Math.trunc(stockNum)) : null,
  };
  return insertarHistorialProducto({
    executor,
    productoId: producto.id,
    productoNombre: producto.nombre,
    accion: 'alta',
    valorNuevo: texto,
    detalle: {
      alta: detalleAlta,
      ...detalleAlta,
      cambios: [{ etiqueta: 'Alta', valor_anterior: '—', valor_nuevo: texto }],
    },
    usuarioId,
    sucursalId: producto.sucursal_id,
    strict,
  });
}

async function registrarHistorialProductoEliminacion({
  executor,
  producto,
  usuarioId = null,
  strict = false,
}) {
  if (!producto) return false;
  const texto = 'Producto eliminado';
  const stockEliminado = Number(producto.stock) || 0;
  return insertarHistorialProducto({
    executor,
    productoId: producto.id,
    productoNombre: producto.nombre,
    accion: 'eliminacion',
    valorAnterior: 'Producto activo en inventario',
    valorNuevo: texto,
    detalle: {
      stock_eliminado: stockEliminado,
      cambios: [{
        etiqueta: 'Eliminación',
        valor_anterior: 'Producto activo en inventario',
        valor_nuevo: texto,
        stock_eliminado: stockEliminado,
      }],
    },
    usuarioId,
    sucursalId: producto.sucursal_id,
    strict,
  });
}

async function registrarHistorialProductoEdicion({
  executor,
  previo,
  actual,
  usuarioId = null,
  camposActualizados = null,
  strict = false,
}) {
  if (!previo || !actual) return false;
  const productoNombre = actual.nombre || previo.nombre;
  const sucursalId = actual.sucursal_id ?? previo.sucursal_id;
  const cambios = [];

  const camposRevisar = Array.isArray(camposActualizados) && camposActualizados.length
    ? CAMPOS_EDICION_HISTORIAL.filter((c) => camposActualizados.includes(c))
    : CAMPOS_EDICION_HISTORIAL;

  for (const campo of camposRevisar) {
    const antes = previo[campo];
    const despues = actual[campo];
    if (valoresCampoEquivalentes(campo, antes, despues)) continue;
    if (campo === 'imagen') {
      const valorAnterior = formatearValorHistorial(campo, antes);
      const valorNuevo = formatearValorHistorial(campo, despues);
      if (valorAnterior === valorNuevo) continue;
      cambios.push({
        campo,
        etiqueta: 'Imagen',
        valor_anterior: valorAnterior,
        valor_nuevo: valorNuevo,
        tenia_imagen: Boolean(antes),
        tiene_imagen: Boolean(despues),
      });
      continue;
    }
    const valorAnterior = formatearValorHistorial(campo, antes);
    const valorNuevo = formatearValorHistorial(campo, despues);
    if (valorAnterior === valorNuevo) continue;
    cambios.push({
      campo,
      etiqueta: etiquetaCampoHistorial(campo),
      valor_anterior: valorAnterior,
      valor_nuevo: valorNuevo,
    });
  }

  if (cambios.length === 0) return 0;

  const ok = await insertarHistorialProducto({
    executor,
    productoId: actual.id ?? previo.id,
    productoNombre,
    accion: 'edicion',
    detalle: { cambios },
    usuarioId,
    sucursalId,
    strict,
  });
  return ok ? 1 : 0;
}

module.exports = {
  ACCIONES_PRODUCTO_HISTORIAL,
  CAMPOS_EDICION_HISTORIAL,
  etiquetaCampoHistorial,
  formatearValorHistorial,
  registrarHistorialProductoAlta,
  registrarHistorialProductoEliminacion,
  registrarHistorialProductoEdicion,
};
