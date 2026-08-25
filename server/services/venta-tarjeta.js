const pool = require('../config/db');
const { armarDatosTicket } = require('./ticket-contenido');
const { generarPdfTicket } = require('./ticket-pdf');
const { reimprimirTicketAhora, terminalParaSucursal } = require('./ticket-point');
const {
  MONTO_MINIMO_TARJETA,
  crearOrdenCobro,
  crearReferenciaExterna,
  esperarOrdenProcesada,
  validarMontoTarjeta,
} = require('./mp-point-order');
const {
  obtenerSucursalVenta,
  prepararLineasVenta,
  persistirVenta,
} = require('./venta-core');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function emitirTicketUrbanCaseSincrono(pool, {
  venta,
  sucursal,
  usuarioNombre,
  lineas,
}) {
  const datos = armarDatosTicket({
    venta,
    sucursalNombre: sucursal?.nombre,
    usuarioNombre,
    lineas,
  });
  const ticket = {
    pdf: false,
    print: false,
    print_omitido: false,
    print_error: null,
    print_en_cola: false,
  };

  try {
    const relativo = await generarPdfTicket(datos);
    await pool.query(
      'UPDATE ventas SET ticket_pdf_path = $1 WHERE id = $2',
      [relativo, venta.id]
    );
    ticket.pdf = true;
  } catch (err) {
    console.error('Ticket PDF:', err.message);
  }

  const terminal = terminalParaSucursal(sucursal);
  const token = String(process.env.MP_ACCESS_TOKEN || '').trim();
  if (!token || !terminal) {
    ticket.print_omitido = true;
    ticket.print_error = 'Falta configuración de la Point';
    return ticket;
  }

  await sleep(2500);
  const printRes = await reimprimirTicketAhora({ datos, terminalId: terminal });
  if (printRes.ok) {
    ticket.print = true;
    await pool.query(
      'UPDATE ventas SET ticket_impreso_at = NOW() WHERE id = $1',
      [venta.id]
    );
  } else {
    ticket.print_error = printRes.error || 'No se pudo imprimir el ticket UrbanCase';
    console.error('Ticket UrbanCase tarjeta:', ticket.print_error);
  }

  return ticket;
}

async function procesarVentaTarjeta(req, res, { items, sucursalId, metodoPago }) {
  const usuarioId = req.usuario?.id != null ? Number(req.usuario.id) : null;
  const rolUsuario = req.usuario?.rol;
  const token = String(process.env.MP_ACCESS_TOKEN || '').trim();

  let sucursal;
  let subtotal;
  let lineasPreview;

  const clientPreview = await pool.connect();
  try {
    await clientPreview.query('BEGIN');
    sucursal = await obtenerSucursalVenta(clientPreview, sucursalId);
    const prep = await prepararLineasVenta(clientPreview, {
      items,
      sucursalId,
      bloquearStock: false,
      rolUsuario,
    });
    subtotal = prep.subtotal;
    lineasPreview = prep.lineas;
    await clientPreview.query('COMMIT');
  } catch (err) {
    await clientPreview.query('ROLLBACK').catch(() => {});
    return res.status(400).json({ error: err.message });
  } finally {
    clientPreview.release();
  }

  const terminal = terminalParaSucursal(sucursal);
  if (!token || !terminal) {
    return res.status(400).json({
      error: 'Cobro con tarjeta requiere MP_ACCESS_TOKEN y terminal configurada en Railway.',
    });
  }

  const montoCheck = validarMontoTarjeta(subtotal);
  if (!montoCheck.ok) {
    return res.status(400).json({ error: montoCheck.error, monto_minimo_tarjeta: MONTO_MINIMO_TARJETA });
  }

  const externalReference = crearReferenciaExterna();
  const descripcion = lineasPreview.length === 1
    ? lineasPreview[0].producto_nombre
    : `Urban Case (${lineasPreview.length} arts.)`;

  const orden = await crearOrdenCobro({
    amount: subtotal,
    terminalId: terminal,
    externalReference,
    description: descripcion,
  });
  if (!orden.ok) {
    return res.status(400).json({ error: orden.error || 'No se pudo iniciar el cobro en la Point' });
  }

  const pago = await esperarOrdenProcesada(orden.orderId);
  if (!pago.ok) {
    return res.status(400).json({
      error: pago.error || 'Pago con tarjeta no aprobado',
      pago_point: {
        ok: false,
        order_id: orden.orderId,
        estado: pago.estado,
      },
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const prep = await prepararLineasVenta(client, {
      items,
      sucursalId,
      bloquearStock: true,
      rolUsuario,
    });
    if (prep.subtotal !== subtotal) {
      throw new Error('El total cambió mientras se cobraba. Revisá inventario y reintenta.');
    }
    const venta = await persistirVenta(client, {
      lineas: prep.lineas,
      subtotal: prep.subtotal,
      sucursalId,
      usuarioId,
      metodoPago,
      productosCache: prep.productosCache,
      mpOrderId: orden.orderId,
      mpPaymentId: pago.paymentId || orden.paymentId,
    });
    await client.query('COMMIT');

    let ticket = { pdf: false, print: false, print_omitido: true, print_error: null };
    try {
      ticket = await emitirTicketUrbanCaseSincrono(pool, {
        venta,
        sucursal,
        usuarioNombre: req.usuario?.nombre,
        lineas: prep.lineas,
      });
    } catch (emitErr) {
      console.error('Ticket venta tarjeta:', emitErr.message);
    }

    return res.status(201).json({
      ok: true,
      venta: {
        ...venta,
        subtotal: Number(venta.subtotal),
        total: Number(venta.total),
        ticket_pdf: Boolean(ticket.pdf),
      },
      ticket,
      pago_point: {
        ok: true,
        order_id: orden.orderId,
        payment_id: pago.paymentId || orden.paymentId,
        boucher: true,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Venta tarjeta post-cobro:', err.message, 'orden MP:', orden.orderId);
    return res.status(500).json({
      error: err.message,
      pago_point: {
        ok: true,
        order_id: orden.orderId,
        payment_id: pago.paymentId || orden.paymentId,
        aviso: 'El cobro fue aprobado pero no se guardó la venta. Anotá el folio y contactá soporte.',
      },
    });
  } finally {
    client.release();
  }
}

module.exports = { procesarVentaTarjeta };
