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

function armarDatosTicket({ venta, sucursalNombre, usuarioNombre, lineas }) {
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
    fecha: formatoFechaTicket(venta.created_at),
    metodo: etiquetaMetodoPago(venta.metodo_pago),
    total: redondearMoneda(venta.total),
    items,
  };
}

function armarContenidoPoint(datos) {
  const lineas = [
    '{br}--------------------------------',
    '{br}{center}{w}URBAN CASE{/w}{/center}',
    `{br}{center}{s}${escaparPoint(datos.sucursal)}{/s}{/center}`,
    '{br}--------------------------------',
    `{br}{s}Folio: #${datos.folio}{/s}`,
    `{br}{s}${escaparPoint(datos.fecha)}{/s}`,
    `{br}{s}Cajero: ${escaparPoint(datos.cajero)}{/s}`,
    `{br}{s}Pago: ${escaparPoint(datos.metodo)}{/s}`,
    '{br}--------------------------------',
  ];
  for (const item of datos.items) {
    lineas.push(`{br}{s}${escaparPoint(truncar(item.nombre, 28))}{/s}`);
    lineas.push(
      `{br}{s}${item.cantidad} x ${formatoMoneda(item.precio_unitario)}  ${formatoMoneda(item.subtotal)}{/s}`
    );
  }
  lineas.push('{br}--------------------------------');
  lineas.push(`{br}{center}{b}TOTAL ${formatoMoneda(datos.total)}{/b}{/center}`);
  lineas.push('{br}{center}{s}Gracias por su compra{/s}{/center}');
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
  armarContenidoPoint,
  formatoMoneda,
  etiquetaMetodoPago,
};
