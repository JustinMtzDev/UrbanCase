function redondearMoneda(n) {
  return Math.round(Number(n) * 100) / 100;
}

function formatoMoneda(n) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(redondearMoneda(n) || 0);
}

function etiquetaMetodoPago(valor) {
  const v = String(valor || '').toLowerCase();
  if (v === 'tarjeta') return 'Tarjeta';
  if (v === 'transferencia') return 'Transferencia';
  return 'Efectivo';
}

function formatoFechaTicket(fecha) {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function truncar(texto, max) {
  const t = String(texto || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

function armarDatosTicket({ venta, sucursalNombre, usuarioNombre, lineas, clienteNombre }) {
  const items = (Array.isArray(lineas) ? lineas : []).map((l) => {
    const cantidad = Number(l.cantidad) || 0;
    const precio = redondearMoneda(l.precio_unitario);
    const subtotal = redondearMoneda(l.subtotal != null ? l.subtotal : precio * cantidad);
    return {
      nombre: String(l.producto_nombre || 'Artículo'),
      cantidad,
      precio_unitario: precio,
      subtotal,
    };
  });
  return {
    folio: Number(venta.id) || 0,
    sucursal: String(sucursalNombre || 'Sucursal').trim() || 'Sucursal',
    cajero: String(usuarioNombre || 'Sistema').trim() || 'Sistema',
    cliente: String(clienteNombre ?? venta.cliente_nombre ?? '').trim(),
    fecha: formatoFechaTicket(venta.created_at),
    metodo: etiquetaMetodoPago(venta.metodo_pago),
    total: redondearMoneda(venta.total),
    items,
  };
}

function armarDatosNotaDevolucion({
  venta,
  devolucion,
  sucursalNombre,
  usuarioNombre,
  autorizadoPorNombre,
  lineas,
  clienteNombre,
}) {
  const base = armarDatosTicket({ venta, sucursalNombre, usuarioNombre, lineas, clienteNombre });
  return {
    ...base,
    tipo: 'devolucion',
    folio: Number(devolucion.id) || 0,
    folio_venta: Number(venta.id) || 0,
    fecha: formatoFechaTicket(devolucion.created_at || new Date()),
    fecha_venta: formatoFechaTicket(venta.created_at),
    autorizado_por: String(autorizadoPorNombre || '').trim(),
    motivo: String(devolucion.motivo || '').trim(),
    total: redondearMoneda(devolucion.total != null ? devolucion.total : venta.total),
  };
}

function armarContenidoPointDevolucion(datos) {
  const lineas = [
    '{br}--------------------------------',
    '{br}{center}{w}URBAN CASE{/w}{/center}',
    `{br}{center}{s}${escaparPoint(datos.sucursal)}{/s}{/center}`,
    '{br}{center}{b}NOTA DE DEVOLUCION{/b}{/center}',
    '{br}--------------------------------',
    `{br}{s}Nota: #${datos.folio}{/s}`,
    `{br}{s}Venta: #${datos.folio_venta}{/s}`,
    `{br}{s}${escaparPoint(datos.fecha)}{/s}`,
    `{br}{s}Atendio: ${escaparPoint(datos.cajero)}{/s}`,
  ];
  if (datos.autorizado_por) {
    lineas.push(`{br}{s}Autorizo: ${escaparPoint(truncar(datos.autorizado_por, 24))}{/s}`);
  }
  lineas.push(`{br}{s}Reembolso: ${escaparPoint(datos.metodo)}{/s}`);
  if (datos.cliente) {
    lineas.push(`{br}{s}Cliente: ${escaparPoint(truncar(datos.cliente, 24))}{/s}`);
  }
  lineas.push('{br}--------------------------------');
  for (const item of datos.items) {
    lineas.push(`{br}{s}${escaparPoint(truncar(item.nombre, 28))}{/s}`);
    lineas.push(
      `{br}{s}${item.cantidad} x ${formatoMoneda(item.precio_unitario)}  ${formatoMoneda(item.subtotal)}{/s}`
    );
  }
  lineas.push('{br}--------------------------------');
  lineas.push(`{br}{center}{b}DEVUELTO ${formatoMoneda(datos.total)}{/b}{/center}`);
  if (datos.motivo) {
    lineas.push(`{br}{s}Motivo: ${escaparPoint(truncar(datos.motivo, 60))}{/s}`);
  }
  lineas.push('{br}{center}{s}Mercancia devuelta a inventario{/s}{/center}');
  lineas.push('{br}{center}{s}Conserve esta nota{/s}{/center}');
  lineas.push('{br}--------------------------------{br}');
  let content = lineas.join('');
  while (content.length < 100) content += '{br}';
  if (content.length > 4096) {
    content = `${content.slice(0, 4080)}{br}`;
  }
  return content;
}

function armarContenidoPoint(datos) {
  if (datos?.tipo === 'devolucion') return armarContenidoPointDevolucion(datos);
  const lineas = [
    '{br}--------------------------------',
    '{br}{center}{w}URBAN CASE{/w}{/center}',
    `{br}{center}{s}${escaparPoint(datos.sucursal)}{/s}{/center}`,
    '{br}--------------------------------',
    `{br}{s}Folio: #${datos.folio}{/s}`,
    `{br}{s}${escaparPoint(datos.fecha)}{/s}`,
    `{br}{s}Cajero: ${escaparPoint(datos.cajero)}{/s}`,
    `{br}{s}Pago: ${escaparPoint(datos.metodo)}{/s}`,
  ];
  if (datos.cliente) {
    lineas.push(`{br}{s}Cliente: ${escaparPoint(truncar(datos.cliente, 24))}{/s}`);
  }
  lineas.push('{br}--------------------------------');
  for (const item of datos.items) {
    lineas.push(`{br}{s}${escaparPoint(truncar(item.nombre, 28))}{/s}`);
    lineas.push(
      `{br}{s}${item.cantidad} x ${formatoMoneda(item.precio_unitario)}  ${formatoMoneda(item.subtotal)}{/s}`
    );
  }
  lineas.push('{br}--------------------------------');
  lineas.push(`{br}{center}{b}TOTAL ${formatoMoneda(datos.total)}{/b}{/center}`);
  lineas.push('{br}{center}{s}Gracias por su compra{/s}{/center}');
  lineas.push('{br}{center}{s}Salida la mercancia no hay{/s}{/center}');
  lineas.push('{br}{center}{s}devoluciones{/s}{/center}');
  lineas.push('{br}{center}{s}No hay garantia en micas{/s}{/center}');
  lineas.push('{br}{center}{s}15 dias de garantia por{/s}{/center}');
  lineas.push('{br}{center}{s}defectos de fabrica{/s}{/center}');
  lineas.push('{br}{center}{s}con este ticket{/s}{/center}');
  lineas.push('{br}--------------------------------{br}');
  let content = lineas.join('');
  while (content.length < 100) content += '{br}';
  if (content.length > 4096) {
    content = `${content.slice(0, 4080)}{br}`;
  }
  return content;
}

function escaparPoint(texto) {
  return String(texto || '').replace(/[{}]/g, '');
}

module.exports = {
  armarDatosTicket,
  armarDatosNotaDevolucion,
  armarContenidoPoint,
  formatoMoneda,
  etiquetaMetodoPago,
};
