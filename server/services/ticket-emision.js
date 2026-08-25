const { armarDatosTicket } = require('./ticket-contenido');
const { generarPdfTicket } = require('./ticket-pdf');
const { encolarImpresionPoint, terminalParaSucursal } = require('./ticket-point');

async function emitirTicketVenta(pool, {
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

  const printRes = encolarImpresionPoint({
    datos,
    terminalId: terminalParaSucursal(sucursal),
    onOk: async () => {
      try {
        await pool.query(
          'UPDATE ventas SET ticket_impreso_at = NOW() WHERE id = $1',
          [venta.id]
        );
      } catch (err) {
        console.error('ticket_impreso_at:', err.message);
      }
    },
    onFail: async (error) => {
      console.error('Ticket Point venta', venta.id, error);
    },
  });
  if (printRes.ok) {
    ticket.print = true;
    ticket.print_en_cola = Boolean(printRes.encolado);
  } else {
    ticket.print_omitido = Boolean(printRes.omitido);
    ticket.print_error = printRes.error || null;
    if (!printRes.omitido) {
      console.error('Ticket Point:', printRes.error);
    }
  }

  return ticket;
}

module.exports = { emitirTicketVenta };
