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

const METODOS_PAGO = new Set(['efectivo', 'tarjeta', 'transferencia']);

const router = Router();

router.post('/', async (req, res) => {
  const items = req.body?.items;
  const sucursalId = Number(req.body?.sucursal_id ?? req.body?.sucursalId);
  const metodoPagoRaw = String(req.body?.metodo_pago ?? req.body?.metodoPago ?? 'efectivo').trim().toLowerCase();
  const metodoPago = METODOS_PAGO.has(metodoPagoRaw) ? metodoPagoRaw : 'efectivo';

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Se requiere al menos un producto en la venta' });
  }
  if (!Number.isFinite(sucursalId)) {
    return res.status(400).json({ error: 'sucursal_id es requerido' });
  }

  if (metodoPago === 'tarjeta') {
    return procesarVentaTarjeta(req, res, { items, sucursalId, metodoPago });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sucursal = await obtenerSucursalVenta(client, sucursalId);
    const prep = await prepararLineasVenta(client, {
      items,
      sucursalId,
      bloquearStock: true,
      rolUsuario: req.usuario?.rol,
    });
    const usuarioId = req.usuario?.id != null ? Number(req.usuario.id) : null;
    const venta = await persistirVenta(client, {
      lineas: prep.lineas,
      subtotal: prep.subtotal,
      sucursalId,
      usuarioId,
      metodoPago,
      productosCache: prep.productosCache,
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

router.post('/:id/reimprimir-ticket', async (req, res) => {
  const ventaId = Number(req.params.id);
  if (!Number.isFinite(ventaId) || ventaId <= 0) {
    return res.status(400).json({ error: 'id de venta inválido' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT v.*, s.nombre AS sucursal_nombre, s.mp_terminal_id
       FROM ventas v
       JOIN sucursales s ON s.id = v.sucursal_id
       WHERE v.id = $1`,
      [ventaId]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Venta no encontrada' });
    }
    const venta = rows[0];
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
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/ticket', async (req, res) => {
  const ventaId = Number(req.params.id);
  if (!Number.isFinite(ventaId) || ventaId <= 0) {
    return res.status(400).json({ error: 'id de venta inválido' });
  }
  try {
    const { rows } = await pool.query(
      'SELECT id, ticket_pdf_path FROM ventas WHERE id = $1',
      [ventaId]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Venta no encontrada' });
    }
    const abs = rutaAbsolutaTicket(rows[0].ticket_pdf_path);
    if (!abs || !fs.existsSync(abs)) {
      return res.status(404).json({ error: 'Este ticket no tiene PDF' });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="ticket-${ventaId}.pdf"`);
    fs.createReadStream(abs).pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
