// Customer-facing PDF. Built from the same whitelisted DTO the customer page
// uses — there is deliberately no code path here that can see cost or margin.

import PDFDocument from 'pdfkit';
import { money } from './labels.js';

export function renderQuotePdf(dto, stream) {
  const doc = new PDFDocument({ size: 'A4', margin: 56 });
  doc.pipe(stream);

  const ink = '#2b2b2b';
  const soft = '#8a7a70';
  const rule = '#e6ddd6';

  // header
  doc.fillColor(ink).font('Helvetica-Bold').fontSize(22)
    .text(dto.businessName || 'Bakery', { align: 'left' });
  doc.moveDown(0.2);
  doc.font('Helvetica').fontSize(11).fillColor(soft)
    .text(`${dto.mode === 'menu' ? 'Cake price list' : 'Quotation'}${dto.estimated ? ' · estimate' : ''}`, { align: 'left' });
  doc.moveDown(0.8);
  doc.strokeColor(rule).lineWidth(1)
    .moveTo(doc.x, doc.y).lineTo(doc.page.width - 56, doc.y).stroke();
  doc.moveDown(1);

  // cake
  doc.fillColor(ink).font('Helvetica-Bold').fontSize(16).text(dto.cakeName || 'Celebration cake');
  if (dto.description) {
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(11).fillColor(ink).text(dto.description);
  }
  doc.moveDown(0.9);

  const priceLabel = dto.estimated ? 'Estimated price' : 'Price';

  if (dto.mode === 'menu') {
    dto.menu.forEach((item) => {
      doc.font('Helvetica-Bold').fontSize(12).fillColor(ink)
        .text(item.sizeLabel || 'Size', { continued: true })
        .font('Helvetica').fillColor(soft)
        .text(item.weightLabel ? `   ${item.weightLabel}` : '', { continued: true })
        .font('Helvetica-Bold').fillColor(ink)
        .text(`      ${money(item.price, dto.currency)}${item.estimated ? ' (est.)' : ''}`, { align: 'right' });
      doc.moveDown(0.5);
    });
  } else {
    row(doc, 'Size', dto.sizeLabel, ink, soft);
    row(doc, 'Serves / weight', dto.weightLabel, ink, soft);
    doc.moveDown(0.6);
    doc.strokeColor(rule).moveTo(doc.x, doc.y).lineTo(doc.page.width - 56, doc.y).stroke();
    doc.moveDown(0.6);
    doc.font('Helvetica-Bold').fontSize(14).fillColor(ink)
      .text(priceLabel, { continued: true })
      .text(money(dto.price, dto.currency), { align: 'right' });
  }

  doc.moveDown(0.8);
  if (dto.priceNote) {
    doc.font('Helvetica-Oblique').fontSize(9.5).fillColor(soft).text(dto.priceNote);
  }

  doc.moveDown(1.2);
  if (dto.allergens) {
    doc.font('Helvetica-Bold').fontSize(10).fillColor(soft).text('Allergen information');
    doc.font('Helvetica').fontSize(10).fillColor(ink).text(dto.allergens);
    doc.moveDown(0.6);
  }
  if (dto.note) {
    doc.font('Helvetica-Oblique').fontSize(11).fillColor(ink).text(dto.note);
    doc.moveDown(0.6);
  }

  doc.font('Helvetica').fontSize(9).fillColor(soft)
    .text(`Prepared ${new Date().toLocaleDateString('en-GB')}${dto.businessName ? ` · ${dto.businessName}` : ''}`,
      56, doc.page.height - 70, { align: 'center', width: doc.page.width - 112 });

  doc.end();
}

function row(doc, label, value, ink, soft) {
  if (!value) return;
  doc.font('Helvetica').fontSize(11).fillColor(soft).text(`${label}`, { continued: true })
    .fillColor(ink).text(`   ${value}`);
  doc.moveDown(0.3);
}
