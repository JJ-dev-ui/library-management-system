// PDF writer (A4 landscape table), using the pdfkit package.
const path = require('path');
const PDFDocument = require('pdfkit');
const { formatManila } = require('../utils/manila');

// Noto Sans (SIL Open Font License, see assets/fonts/OFL.txt) is embedded in the file. pdfkit's
// built-in fonts only know basic Latin letters; Noto Sans also prints "ñ", "é", Greek letters, etc.
const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
const REGULAR = path.join(FONT_DIR, 'NotoSans-Regular.ttf');
const BOLD = path.join(FONT_DIR, 'NotoSans-Bold.ttf');

const MARGIN = 36;      // 0.5 inch
const FONT_SIZE = 8.5;
const PAD = 4;          // space inside each cell
const MAX_LINES = 2;    // long text wraps to 2 lines, then ends with "…"
const BRAND = '#3D398C';
const ZEBRA = '#F3F4F8';
const MUTED = '#5F6577';

function cellText(value, type) {
  if (value === null || value === undefined) return '';
  if (type === 'date') return formatManila(value, false);
  if (type === 'datetime') return formatManila(value, true);
  if (type === 'percent') return `${Math.round(value * 100)}%`;
  return String(value);
}

// info = { title, generatedAt, generatedBy, scopeLabel, filters: [..], count }
function toPdf(columns, rows, info) {
  return new Promise((resolve, reject) => {
    // bufferPages: keeps every page in memory, so "Page X of Y" can be written at the end
    // (the total Y is only known after the last row).
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: MARGIN, bufferPages: true, info: { Title: info.title, Author: 'Stacks Library' } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.registerFont('Body', REGULAR);
    doc.registerFont('Bold', BOLD);

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const tableW = pageW - MARGIN * 2;
    const bottom = pageH - MARGIN - 18; // leave room for the footer

    // Column widths: each column's "pdf" weight as a share of the page width
    const totalWeight = columns.reduce((s, c) => s + c.pdf, 0);
    const widths = columns.map((c) => (c.pdf / totalWeight) * tableW);
    doc.font('Body').fontSize(FONT_SIZE);
    const lineH = doc.currentLineHeight(true);

    // ----- Report header (first page only) -----
    doc.font('Bold').fontSize(16).fillColor(BRAND).text('Stacks Library', MARGIN, MARGIN);
    doc.font('Bold').fontSize(12).fillColor('#1A1D29').text(info.title);
    doc.moveDown(0.2);
    doc.font('Body').fontSize(8.5).fillColor(MUTED);
    doc.text(`Generated ${info.generatedAt} (Asia/Manila) by ${info.generatedBy}`);
    doc.text(`Scope: ${info.scopeLabel} · ${info.count} ${info.count === 1 ? 'row' : 'rows'}`);
    doc.text(`Filters: ${info.filters.length ? info.filters.join(' · ') : 'None'}`, { width: tableW });
    doc.moveDown(0.6);
    let y = doc.y;

    // ----- Table -----
    // Writes the cells of one row; text is cut to MAX_LINES lines with an ellipsis
    const drawCells = (texts, top, height, font) => {
      doc.font(font).fontSize(FONT_SIZE);
      let x = MARGIN;
      texts.forEach((t, i) => {
        doc.text(t, x + PAD, top + PAD, { width: widths[i] - PAD * 2, height: height - PAD * 2 + 1, ellipsis: '…', lineBreak: true });
        x += widths[i];
      });
    };
    // Height of a row = its tallest cell (1 or 2 lines)
    const rowHeight = (texts, font) => {
      doc.font(font).fontSize(FONT_SIZE);
      const lines = Math.max(1, ...texts.map((t, i) => Math.min(MAX_LINES, Math.ceil(doc.heightOfString(t || ' ', { width: widths[i] - PAD * 2 }) / lineH))));
      return lines * lineH + PAD * 2;
    };

    const headers = columns.map((c) => c.pdfHeader || c.header);
    const headerH = rowHeight(headers, 'Bold');
    // The header row is repeated at the top of every page
    const drawHeader = () => {
      doc.rect(MARGIN, y, tableW, headerH).fill(BRAND);
      doc.fillColor('#FFFFFF');
      drawCells(headers, y, headerH, 'Bold');
      y += headerH;
    };
    drawHeader();

    if (!rows.length) {
      doc.font('Body').fontSize(9).fillColor(MUTED).text('No rows match these filters.', MARGIN + PAD, y + 8);
    }
    rows.forEach((row, n) => {
      const texts = columns.map((c) => cellText(c.get(row), c.type));
      const h = rowHeight(texts, 'Body');
      if (y + h > bottom) { // no room left: new page + header again
        doc.addPage();
        y = MARGIN;
        drawHeader();
      }
      if (n % 2 === 1) doc.rect(MARGIN, y, tableW, h).fill(ZEBRA); // zebra stripes
      doc.fillColor('#1A1D29');
      drawCells(texts, y, h, 'Body');
      y += h;
    });

    // ----- Footer on every page: "Page X of Y" -----
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      // Writing below the bottom margin would make pdfkit add a new page; remove the margin first
      doc.page.margins.bottom = 0;
      doc.font('Body').fontSize(8).fillColor(MUTED);
      doc.text('Stacks Library', MARGIN, pageH - MARGIN, { width: tableW / 2, lineBreak: false });
      doc.text(`Page ${i + 1} of ${range.count}`, MARGIN, pageH - MARGIN, { width: tableW, align: 'right', lineBreak: false });
    }
    doc.end();
  });
}

module.exports = { toPdf };
