const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { formatoMoneda } = require('./ticket-contenido');

const TICKETS_DIR = path.join(__dirname, '..', 'tickets');

function asegurarDirTickets() {
  fs.mkdirSync(TICKETS_DIR, { recursive: true });
}

function rutaAbsolutaTicket(nombreRelativo) {
  const crudo = String(nombreRelativo || '').replace(/\\/g, '/');
  const nombre = path.basename(crudo);
  if (!nombre || !/^venta-\d+\.pdf$/.test(nombre)) return null;
  return path.join(TICKETS_DIR, nombre);
}

function rutaAbsolutaNotaDevolucion(nombreRelativo) {
  const crudo = String(nombreRelativo || '').replace(/\\/g, '/');
  const nombre = path.basename(crudo);
  if (!nombre || !/^devolucion-\d+\.pdf$/.test(nombre)) return null;
  return path.join(TICKETS_DIR, nombre);
}

function generarPdfTicket(datos) {
  asegurarDirTickets();
  const relativo = `tickets/venta-${datos.folio}.pdf`;
  const destino = path.join(TICKETS_DIR, `venta-${datos.folio}.pdf`);

  return new Promise((resolve, reject) => {
    const alto = Math.max(560, 280 + (datos.items.length * 40));
    const doc = new PDFDocument({
      size: [226, alto],
      margin: 12,
    });
    const stream = fs.createWriteStream(destino);
    doc.pipe(stream);

    doc.fontSize(13).font('Helvetica-Bold').text('URBAN CASE', { align: 'center' });
    doc.moveDown(0.25);
    doc.fontSize(8).font('Helvetica').text(datos.sucursal, { align: 'center' });
    doc.moveDown(0.4);
    doc.text('--------------------------------', { align: 'center' });
    doc.fontSize(8).text(`Folio: #${datos.folio}`);
    doc.text(datos.fecha);
    doc.text(`Cajero: ${datos.cajero}`);
    doc.text(`Pago: ${datos.metodo}`);
    if (datos.cliente) doc.text(`Cliente: ${datos.cliente}`);
    doc.text('--------------------------------', { align: 'center' });
    doc.moveDown(0.2);

    for (const item of datos.items) {
      doc.font('Helvetica-Bold').fontSize(8).text(item.nombre, { width: 202 });
      doc.font('Helvetica').fontSize(8).text(
        `${item.cantidad} x ${formatoMoneda(item.precio_unitario)}     ${formatoMoneda(item.subtotal)}`,
        { align: 'right', width: 202 }
      );
      doc.moveDown(0.15);
    }

    doc.text('--------------------------------', { align: 'center' });
    doc.font('Helvetica-Bold').fontSize(11).text(`TOTAL ${formatoMoneda(datos.total)}`, { align: 'center' });
    doc.moveDown(0.35);
    doc.font('Helvetica').fontSize(8).text('Gracias por su compra', { align: 'center' });
    doc.moveDown(0.35);
    doc.fontSize(7).text('Salida la mercancia no hay devoluciones', { align: 'center', width: 202 });
    doc.text('No hay garantia en micas', { align: 'center', width: 202 });
    doc.text('15 dias de garantia por defectos de fabrica con este ticket', { align: 'center', width: 202 });

    doc.end();
    stream.on('finish', () => resolve(relativo));
    stream.on('error', reject);
    doc.on('error', reject);
  });
}

function generarPdfNotaDevolucion(datos) {
  asegurarDirTickets();
  const relativo = `tickets/devolucion-${datos.folio}.pdf`;
  const destino = path.join(TICKETS_DIR, `devolucion-${datos.folio}.pdf`);

  return new Promise((resolve, reject) => {
    const alto = Math.max(560, 300 + (datos.items.length * 40));
    const doc = new PDFDocument({
      size: [226, alto],
      margin: 12,
    });
    const stream = fs.createWriteStream(destino);
    doc.pipe(stream);

    doc.fontSize(13).font('Helvetica-Bold').text('URBAN CASE', { align: 'center' });
    doc.moveDown(0.25);
    doc.fontSize(8).font('Helvetica').text(datos.sucursal, { align: 'center' });
    doc.moveDown(0.25);
    doc.fontSize(10).font('Helvetica-Bold').text('NOTA DE DEVOLUCIÓN', { align: 'center' });
    doc.moveDown(0.4);
    doc.font('Helvetica').text('--------------------------------', { align: 'center' });
    doc.fontSize(8).text(`Nota: #${datos.folio}`);
    doc.text(`Venta: #${datos.folio_venta}`);
    doc.text(datos.fecha);
    if (datos.fecha_venta) doc.text(`Venta del: ${datos.fecha_venta}`);
    doc.text(`Atendió: ${datos.cajero}`);
    if (datos.autorizado_por) doc.text(`Autorizó: ${datos.autorizado_por}`);
    doc.text(`Reembolso: ${datos.metodo}`);
    if (datos.cliente) doc.text(`Cliente: ${datos.cliente}`);
    doc.text('--------------------------------', { align: 'center' });
    doc.moveDown(0.2);

    for (const item of datos.items) {
      doc.font('Helvetica-Bold').fontSize(8).text(item.nombre, { width: 202 });
      doc.font('Helvetica').fontSize(8).text(
        `${item.cantidad} x ${formatoMoneda(item.precio_unitario)}     ${formatoMoneda(item.subtotal)}`,
        { align: 'right', width: 202 }
      );
      doc.moveDown(0.15);
    }

    doc.text('--------------------------------', { align: 'center' });
    doc.font('Helvetica-Bold').fontSize(11).text(`DEVUELTO ${formatoMoneda(datos.total)}`, { align: 'center' });
    doc.moveDown(0.35);
    doc.font('Helvetica').fontSize(8);
    if (datos.motivo) {
      doc.text(`Motivo: ${datos.motivo}`, { width: 202 });
      doc.moveDown(0.25);
    }
    doc.fontSize(7).text('Mercancia devuelta a inventario', { align: 'center', width: 202 });
    doc.text('Conserve esta nota como comprobante', { align: 'center', width: 202 });

    doc.end();
    stream.on('finish', () => resolve(relativo));
    stream.on('error', reject);
    doc.on('error', reject);
  });
}

module.exports = {
  TICKETS_DIR,
  generarPdfTicket,
  generarPdfNotaDevolucion,
  rutaAbsolutaTicket,
  rutaAbsolutaNotaDevolucion,
};
