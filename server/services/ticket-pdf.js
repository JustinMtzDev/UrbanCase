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

module.exports = {
  TICKETS_DIR,
  generarPdfTicket,
  rutaAbsolutaTicket,
};
