const fs = require('fs');
const { Router } = require('express');
const pool = require('../config/db');
const { emitirTicketVenta } = require('../services/ticket-emision');
const { armarDatosTicket } = require('../services/ticket-contenido');
const { reimprimirTicketAhora, terminalParaSucursal } = require('../services/ticket-point');
const { rutaAbsolutaTicket } = require('../services/ticket-pdf');
const { procesarVentaTarjeta } = require('../services/venta-tarjeta');
const {
  obtenerSucursalVenta,
  prepararLineasVenta,
  persistirVenta,
} = require('../services/venta-core');
const { actualizarComisionTrasVenta } = require('../services/comisiones');
const { obtenerClienteVenta } = require('../services/cliente-precios');
const { registrarDevolucion, emitirNotaDevolucion } = require('../services/devolucion');
const { verificarPasswordAdminODueno } = require('../services/verificar-dueno');
const { rutaAbsolutaNotaDevolucion } = require('../services/ticket-pdf');
const { tieneAccesoCompleto, sucursalPermitida } = require('../middleware/roles');
const { crearRateLimiter, ipCliente } = require('../middleware/login-limiter');
const { responderError } = require('../middleware/errors');

const METODOS_PAGO = new Set(['efectivo', 'tarjeta', 'transferencia']);

const router = Router();

// La devolución acepta la contraseña de cualquier admin o dueño: sin límite de
// intentos el endpoint sirve para probar contraseñas de administrador.
const devolucionLimiter = crearRateLimiter({
  maxIntentos: 5,
  ventanaMs: 15 * 60 * 1000,
  clave: (req) => `${req.usuario?.id ?? 'anon'}|${ipCliente(req)}`,
  mensaje: 'Demasiados intentos de autorización. Intenta más tarde.',
  contarAutomatico: false,
});

function errorVenta(req, res, err) {
  console.error('Ventas', req.originalUrl, err);
  return responderError(res, err);
}

router.post('/', async (req, res) => {
  const items = req.body?.items;
  const sucursalId = Number(req.body?.sucursal_id ?? req.body?.sucursalId);
  const metodoPagoRaw = String(req.body?.metodo_pago ?? req.body?.metodoPago ?? 'efectivo').trim().toLowerCase();
  const metodoPago = METODOS_PAGO.has(metodoPagoRaw) ? metodoPagoRaw : 'efectivo';
  const clienteIdRaw = req.body?.cliente_id ?? req.body?.clienteId;
  const clienteId = Number.isFinite(Number(clienteIdRaw)) && Number(clienteIdRaw) > 0 ? Number(clienteIdRaw) : null;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Se requiere al menos un producto en la venta' });
  }
  if (!Number.isFinite(sucursalId)) {
    return res.status(400).json({ error: 'sucursal_id es requerido' });
  }
  if (!sucursalPermitida(req.usuario, sucursalId)) {
    return res.status(403).json({ error: 'No puedes vender en otra sucursal' });
  }

  if (metodoPago === 'tarjeta') {
    return procesarVentaTarjeta(req, res, { items, sucursalId, metodoPago, clienteId });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sucursal = await obtenerSucursalVenta(client, sucursalId);
    const cliente = await obtenerClienteVenta(client, clienteId);
    const prep = await prepararLineasVenta(client, {
      items,
      sucursalId,
      bloquearStock: true,
      rolUsuario: req.usuario?.rol,
      clienteId,
    });
    const usuarioId = req.usuario?.id != null ? Number(req.usuario.id) : null;
    const venta = await persistirVenta(client, {
      lineas: prep.lineas,
      subtotal: prep.subtotal,
      sucursalId,
      usuarioId,
      metodoPago,
      productosCache: prep.productosCache,
      clienteId,
      clienteNombre: cliente?.nombre || null,
    });
    await actualizarComisionTrasVenta(client, usuarioId);

    await client.query('COMMIT');
    let ticket = { pdf: false, print: false, print_omitido: true, print_error: null };
    try {
      ticket = await emitirTicketVenta(pool, {
        venta,
        sucursal,
        usuarioNombre: req.usuario?.nombre,
        lineas: prep.lineas,
      });
    } catch (emitErr) {
      console.error('Ticket venta:', emitErr.message);
    }
    res.status(201).json({
      ok: true,
      venta: {
        ...venta,
        subtotal: Number(venta.subtotal),
        total: Number(venta.total),
        ticket_pdf: Boolean(ticket.pdf),
      },
      ticket,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Devolución de la venta completa. El dueño y el admin la hacen directo; el
// vendedor necesita la contraseña de un admin o dueño, que queda registrada.
router.post('/:id/devolucion', devolucionLimiter, async (req, res) => {
  const ventaId = Number(req.params.id);
  if (!Number.isFinite(ventaId) || ventaId <= 0) {
    return res.status(400).json({ error: 'id de venta inválido' });
  }
  // Saca dinero de la caja: el motivo queda por escrito, no es opcional.
  const motivo = String(req.body?.motivo ?? '').trim().slice(0, 500);
  if (!motivo) {
    return res.status(400).json({ error: 'El motivo de la devolución es requerido' });
  }
  const usuarioId = req.usuario?.id != null ? Number(req.usuario.id) : null;
  const accesoCompleto = tieneAccesoCompleto(req.usuario?.rol);

  const ventaSuc = await pool.query('SELECT sucursal_id FROM ventas WHERE id = $1', [ventaId]);
  if (!ventaSuc.rows.length) {
    return res.status(404).json({ error: 'Venta no encontrada' });
  }
  if (!sucursalPermitida(req.usuario, ventaSuc.rows[0].sucursal_id)) {
    return res.status(403).json({ error: 'Esa venta es de otra sucursal' });
  }

  let autorizadoPor = null;
  let autorizadoPorNombre = null;
  if (!accesoCompleto) {
    const autorizador = await verificarPasswordAdminODueno(
      req.body?.password_admin ?? req.body?.password
    );
    if (!autorizador) {
      devolucionLimiter.registrarIntento(req);
      console.warn(
        'Devolución: contraseña de autorización incorrecta',
        `venta=${ventaId}`,
        `usuario=${usuarioId}`,
        `ip=${ipCliente(req)}`
      );
      return res.status(403).json({ error: 'Contraseña de admin o dueño incorrecta' });
    }
    autorizadoPor = autorizador.id;
    autorizadoPorNombre = autorizador.nombre;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { devolucion, venta, lineas, advertencias } = await registrarDevolucion(client, {
      ventaId,
      usuarioId,
      autorizadoPor,
      motivo,
    });
    await client.query('COMMIT');

    let nota = { pdf: false, print: false, print_omitido: true, print_error: null };
    try {
      const emision = await emitirNotaDevolucion(pool, {
        devolucion,
        venta,
        lineas,
        usuarioNombre: req.usuario?.nombre,
        autorizadoPorNombre,
      });
      nota = emision.nota;
    } catch (emitErr) {
      console.error('Nota devolución:', emitErr.message);
    }

    res.status(201).json({
      ok: true,
      devolucion: { ...devolucion, nota_pdf: Boolean(nota.pdf) },
      nota,
      advertencias: advertencias || [],
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    const status = err.message === 'Venta no encontrada' ? 404 : 400;
    res.status(status).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.get('/:id/nota-devolucion', async (req, res) => {
  const ventaId = Number(req.params.id);
  if (!Number.isFinite(ventaId) || ventaId <= 0) {
    return res.status(400).json({ error: 'id de venta inválido' });
  }
  try {
    const { rows } = await pool.query(
      'SELECT id, nota_pdf_path, sucursal_id FROM devoluciones WHERE venta_id = $1',
      [ventaId]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Esta venta no tiene devolución' });
    }
    if (!sucursalPermitida(req.usuario, rows[0].sucursal_id)) {
      return res.status(403).json({ error: 'Esa venta es de otra sucursal' });
    }
    const abs = rutaAbsolutaNotaDevolucion(rows[0].nota_pdf_path);
    if (!abs || !fs.existsSync(abs)) {
      return res.status(404).json({ error: 'La devolución no tiene PDF' });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="devolucion-${rows[0].id}.pdf"`);
    fs.createReadStream(abs).pipe(res);
  } catch (err) {
    return errorVenta(req, res, err);
  }
});

router.post('/:id/reimprimir-ticket', async (req, res) => {
  const ventaId = Number(req.params.id);
  if (!Number.isFinite(ventaId) || ventaId <= 0) {
    return res.status(400).json({ error: 'id de venta inválido' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT v.*, s.nombre AS sucursal_nombre, s.mp_terminal_id, c.nombre AS cliente_nombre
       FROM ventas v
       JOIN sucursales s ON s.id = v.sucursal_id
       LEFT JOIN clientes c ON c.id = v.cliente_id
       WHERE v.id = $1`,
      [ventaId]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Venta no encontrada' });
    }
    const venta = rows[0];
    if (!sucursalPermitida(req.usuario, venta.sucursal_id)) {
      return res.status(403).json({ error: 'Esa venta es de otra sucursal' });
    }
    const { rows: lineas } = await pool.query(
      `SELECT producto_nombre, cantidad, precio_unitario, subtotal
       FROM venta_detalle WHERE venta_id = $1 ORDER BY id`,
      [ventaId]
    );
    const datos = armarDatosTicket({
      venta,
      sucursalNombre: venta.sucursal_nombre,
      usuarioNombre: req.usuario?.nombre,
      lineas,
    });
    const terminal = terminalParaSucursal({ mp_terminal_id: venta.mp_terminal_id });
    const printRes = await reimprimirTicketAhora({ datos, terminalId: terminal });
    if (printRes.ok) {
      await pool.query('UPDATE ventas SET ticket_impreso_at = NOW() WHERE id = $1', [ventaId]);
    }
    res.json({
      ok: printRes.ok,
      venta_id: ventaId,
      action_id: printRes.id || null,
      estado: printRes.estado || null,
      error: printRes.error || null,
    });
  } catch (err) {
    return errorVenta(req, res, err);
  }
});

router.get('/:id/ticket', async (req, res) => {
  const ventaId = Number(req.params.id);
  if (!Number.isFinite(ventaId) || ventaId <= 0) {
    return res.status(400).json({ error: 'id de venta inválido' });
  }
  try {
    const { rows } = await pool.query(
      'SELECT id, ticket_pdf_path, sucursal_id FROM ventas WHERE id = $1',
      [ventaId]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Venta no encontrada' });
    }
    if (!sucursalPermitida(req.usuario, rows[0].sucursal_id)) {
      return res.status(403).json({ error: 'Esa venta es de otra sucursal' });
    }
    const abs = rutaAbsolutaTicket(rows[0].ticket_pdf_path);
    if (!abs || !fs.existsSync(abs)) {
      return res.status(404).json({ error: 'Este ticket no tiene PDF' });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="ticket-${ventaId}.pdf"`);
    fs.createReadStream(abs).pipe(res);
  } catch (err) {
    return errorVenta(req, res, err);
  }
});

module.exports = router;
