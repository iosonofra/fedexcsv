const PDFDocument = require('pdfkit');

/**
 * Formats a number with comma as decimal separator.
 */
function formatNumber(num, decimals = 2) {
  if (num === null || num === undefined || isNaN(num)) return '0,' + '0'.repeat(decimals);
  return Number(num).toFixed(decimals).replace('.', ',');
}

/**
 * Formats weight to 3 decimal places with comma, matching TNT print format (e.g. 2,000).
 */
function formatWeight(num) {
  if (num === null || num === undefined || isNaN(num)) return '0,000';
  return Number(num).toFixed(3).replace('.', ',');
}

/**
 * Formats COD amount (empty if 0 or null, otherwise formatted to 2 decimals with comma).
 */
function formatCod(val) {
  const num = Number(val);
  if (!num || isNaN(num) || num <= 0) return '';
  return Number(num).toFixed(2).replace('.', ',');
}

/**
 * Formats date into DD.MM.YYYY, exactly like TNT (e.g. 24.09.2026).
 */
function formatDateDot(date = new Date()) {
  const d = new Date(date);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/**
 * Normalizes technical carrier service string to clean printable format.
 */
function formatServiceName(service, carrier = 'FedEx') {
  if (!service) return 'Express';
  const s = String(service).trim();
  if (/REGIONAL_ECONOMY/i.test(s)) return 'Regional\nEconomy';
  if (/REGIONAL/i.test(s)) return 'Regional';
  if (/INTERNATIONAL_PRIORITY/i.test(s)) return 'Intl Priority';
  if (/INTERNATIONAL_ECONOMY/i.test(s)) return 'Intl Economy';
  if (/PRIORITY_OVERNIGHT/i.test(s)) return 'Priority';
  if (/STANDARD_OVERNIGHT/i.test(s)) return 'Standard';
  if (/2_DAY/i.test(s)) return '2 Day';
  if (/EXPRESS_SAVER/i.test(s)) return 'Express Saver';
  if (/ECONOMY_FREIGHT/i.test(s)) return 'Economy Freight';
  if (/GROUND/i.test(s)) return 'Ground';
  if (/EXPRESS/i.test(s)) return 'Express';
  return s.replace(/^FEDEX_/i, '').replace(/_/g, ' ');
}

/**
 * Generates a PDF buffer for the Manifest (Borderò) matching TNT doShippingManagerPrintList.pdf layout.
 *
 * @param {object} options
 * @param {string} options.manifestCode - e.g. BOR-20261012-001
 * @param {string} [options.carrier] - e.g. FedEx / TNT
 * @param {object} options.shipper - Shipper template details
 * @param {Array<object>} options.shipments - Array of shipment rows
 * @param {string} [options.notes] - Optional pickup notes
 * @returns {Promise<Buffer>}
 */
function generateManifestPdf({ manifestCode, carrier = 'FedEx', shipper = {}, shipments = [], notes = '' }) {
  return new Promise((resolve, reject) => {
    try {
      const isTNT = String(carrier).toUpperCase().includes('TNT');
      const carrierNameUpper = isTNT ? 'TNT' : 'FEDEX';

      // Detect if all shipments are domestic or international
      const hasInternational = shipments.some(s => {
        const country = (s.country || s.recipientCountry || '').toUpperCase();
        const city = (s.city || '').toUpperCase();
        return (country && country !== 'IT' && country !== 'ITA' && country !== 'ITALIA') ||
               (/\([A-Z]{2}\)/.test(city) && !/\(IT\)/i.test(city));
      });
      const allInternational = shipments.length > 0 && shipments.every(s => {
        const country = (s.country || s.recipientCountry || '').toUpperCase();
        const city = (s.city || '').toUpperCase();
        return (country && country !== 'IT' && country !== 'ITA' && country !== 'ITALIA') ||
               (/\([A-Z]{2}\)/.test(city) && !/\(IT\)/i.test(city));
      });
      const scopeType = allInternational ? 'INTERNATIONAL' : (hasInternational ? 'DOMESTIC / INTL' : 'DOMESTIC');

      // Standard A4: 595.28 x 841.89 pt
      const doc = new PDFDocument({
        size: 'A4',
        margin: 34,
        bufferPages: true,
        info: {
          Title: `Collection Manifest - ${manifestCode}`,
          Author: shipper.company || `${carrierNameUpper} Shipping Manager`,
          Subject: 'Collection Manifest (Summary)',
          Keywords: `${carrierNameUpper}, Manifest, Collection, Shipping, Borderò`
        }
      });

      const buffers = [];
      doc.on('data', chunk => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', err => reject(err));

      const pageHeight = 841.89;
      const leftMargin = 34;
      const contentWidth = 528;

      // Calculate totals
      let totalPieces = 0;
      let totalWeight = 0;
      let totalCod = 0;

      shipments.forEach(s => {
        totalPieces += Number(s.packages) || 1;
        totalWeight += Number(s.weight) || 0;
        totalCod += Number(s.cod) || 0;
      });

      // Sender details formatted for the manifest
      const senderAccount = shipper.accountNumber || (shipper.fedex && shipper.fedex.accountNumber) || '';
      const senderName = (shipper.company || shipper.nameVal || shipper.name || 'MITTENTE NON SPECIFICATO').toUpperCase();
      const senderAddressLine1 = (shipper.address1 || '').toLowerCase();
      const cityPart = (shipper.city || '').toUpperCase();
      const statePart = (shipper.state || '').toUpperCase();
      const zipPart = (shipper.zip || '');
      const countryPart = (shipper.country || 'IT').toUpperCase();
      const senderAddressLine2 = [cityPart, statePart, zipPart, countryPart].filter(Boolean).join(',  ');

      // Table columns exact coordinates matching TNT print list
      const cols = [
        { key: 'conNr', title1: 'Con Nr', title2: '', x: 34, width: 62, align: 'left' },
        { key: 'pieces', title1: 'No. of', title2: 'Pieces', x: 98, width: 26, align: 'right' },
        { key: 'weight', title1: 'Weight', title2: '(kgs)', x: 126, width: 42, align: 'right' },
        { key: 'ref', title1: 'Shipper Ref.', title2: '', x: 180, width: 68, align: 'left' },
        { key: 'receiver', title1: 'Receiver', title2: '', x: 250, width: 118, align: 'left' },
        { key: 'city', title1: 'City', title2: '', x: 372, width: 72, align: 'left' },
        { key: 'service', title1: 'Destination Service', title2: '', x: 446, width: 62, align: 'left' },
        { key: 'cod', title1: 'C.O.D.', title2: '', x: 510, width: 52, align: 'right' }
      ];

      // Draw Carrier Logo (FedEx vector/typography or TNT circles)
      function renderLogo(x, y) {
        doc.save();
        if (isTNT) {
          doc.circle(x + 10, y + 10, 8).fill('#000000');
          doc.circle(x + 26, y + 10, 8).fill('#000000');
          doc.circle(x + 42, y + 10, 8).fill('#000000');
          doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);
          doc.text('T', x + 7, y + 6);
          doc.text('N', x + 23, y + 6);
          doc.text('T', x + 39, y + 6);
        } else {
          doc.font('Helvetica-Bold').fontSize(24);
          doc.fillColor('#4D148C').text('Fed', x, y, { continued: true, characterSpacing: -0.6 });
          doc.fillColor('#FF6200').text('Ex', { continued: false });
        }
        doc.restore();
      }

      // Draw Page Header matching TNT doShippingManagerPrintList.pdf
      function renderHeader(pageIndex = 0) {
        const topY = 46;

        // 1. Logo
        renderLogo(leftMargin + 10, topY + 8);

        // 2. Title Centered
        const titleText = `COLLECTION MANIFEST (SUMMARY) - ${pageIndex + 1}`;
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#000000');
        const titleWidth = doc.widthOfString(titleText);
        const titleX = 218;
        doc.text(titleText, titleX, topY + 16);

        // Underline beneath Title
        doc.moveTo(titleX, topY + 27)
           .lineTo(titleX + titleWidth, topY + 27)
           .lineWidth(0.5)
           .strokeColor('#000000')
           .stroke();

        // Subtitle below title
        doc.font('Helvetica-Bold').fontSize(6).fillColor('#000000');
        const subTitle = `${carrierNameUpper} ${scopeType}`;
        doc.text(subTitle, 275, topY + 33);

        // Top Right: Scope indicator ("DOMESTIC")
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#000000');
        doc.text(scopeType, 404, topY + 34);

        // 3. Sender Details & Page/Date Block
        const metaY = topY + 46;

        // Left: Sender Account
        doc.font('Helvetica-Bold').fontSize(6).fillColor('#000000');
        doc.text('Sender Account:', leftMargin, metaY);
        doc.font('Courier').fontSize(6);
        doc.text(senderAccount, leftMargin + 80, metaY);

        // Right: Page
        doc.font('Helvetica-Bold').fontSize(6);
        doc.text('Page:', 488, metaY);
        doc.font('Courier').fontSize(6);
        doc.text(String(pageIndex + 1), 557, metaY);

        // Sender Name
        doc.font('Helvetica-Bold').fontSize(6);
        doc.text('Sender Name:', leftMargin, metaY + 10);
        doc.font('Courier-Bold').fontSize(6);
        doc.text(senderName, leftMargin + 80, metaY + 10, { width: 350 });

        // Date
        doc.font('Helvetica-Bold').fontSize(6);
        doc.text('Date:', 488, metaY + 10);
        doc.font('Courier').fontSize(6);
        doc.text(formatDateDot(), 515, metaY + 10);

        // & Address
        doc.font('Helvetica-Bold').fontSize(6);
        doc.text('& Address', leftMargin, metaY + 20);
        doc.font('Courier-Bold').fontSize(6);
        doc.text(senderAddressLine1, leftMargin + 80, metaY + 20, { width: 350 });
        if (senderAddressLine2) {
          doc.text(senderAddressLine2, leftMargin + 80, metaY + 27, { width: 350 });
        }

        // Doc / Manifest reference
        if (manifestCode) {
          doc.font('Helvetica-Bold').fontSize(6);
          doc.text('Doc:', 450, metaY + 20);
          doc.font('Courier').fontSize(6);
          doc.text(manifestCode, 474, metaY + 20, { width: 90, lineBreak: false });
        }

        // Horizontal separator line before table headers
        const lineY = metaY + 41;
        doc.moveTo(leftMargin, lineY)
           .lineTo(leftMargin + contentWidth, lineY)
           .lineWidth(0.5)
           .strokeColor('#000000')
           .stroke();

        // 4. Table Headers
        const thY = lineY + 5;
        doc.font('Helvetica-Bold').fontSize(6).fillColor('#000000');

        cols.forEach(c => {
          if (c.title2) {
            doc.text(c.title1, c.x, thY, { width: c.width, align: c.align });
            doc.text(c.title2, c.x, thY + 7, { width: c.width, align: c.align });
          } else {
            doc.text(c.title1, c.x, thY, { width: c.width, align: c.align });
          }
        });

        return thY + 20;
      }

      // Draw Totals Section
      function renderTotals(y) {
        // Horizontal line before Account Totals
        doc.moveTo(leftMargin, y)
           .lineTo(leftMargin + contentWidth, y)
           .lineWidth(0.5)
           .strokeColor('#000000')
           .stroke();

        y += 8;

        // Account Totals
        doc.font('Courier').fontSize(6).fillColor('#000000');
        doc.text(`Account  ${senderAccount || '00000000'}  Totals:`, leftMargin, y);

        y += 9;
        const countStr = String(shipments.length);
        const piecesStr = String(totalPieces);
        const weightStr = formatWeight(totalWeight);
        const codStr = totalCod > 0 ? formatCod(totalCod) : '';

        // Indented totals matching TNT: Con Nr/Pieces x: 52
        doc.text(countStr, 52, y, { width: 30, align: 'left' });
        doc.text(piecesStr, cols[1].x, y, { width: cols[1].width, align: 'right' });
        doc.text(weightStr, cols[2].x, y, { width: cols[2].width, align: 'right' });
        if (codStr) {
          doc.text(codStr, cols[7].x, y, { width: cols[7].width, align: 'right' });
        }

        y += 14;

        // Line before Grand Totals
        doc.moveTo(leftMargin, y)
           .lineTo(leftMargin + contentWidth, y)
           .lineWidth(0.5)
           .strokeColor('#000000')
           .stroke();

        y += 8;

        // Grand Totals
        doc.font('Courier').fontSize(6).fillColor('#000000');
        doc.text('Grand Totals:', leftMargin, y);

        y += 9;
        doc.text(countStr, 52, y, { width: 30, align: 'left' });
        doc.text(piecesStr, cols[1].x, y, { width: cols[1].width, align: 'right' });
        doc.text(weightStr, cols[2].x, y, { width: cols[2].width, align: 'right' });
        if (codStr) {
          doc.text(codStr, cols[7].x, y, { width: cols[7].width, align: 'right' });
        }

        y += 14;

        // Line after Grand Totals
        doc.moveTo(leftMargin, y)
           .lineTo(leftMargin + contentWidth, y)
           .lineWidth(0.5)
           .strokeColor('#000000')
           .stroke();

        return y + 10;
      }

      // Draw Signatures Section
      function renderSignatures(y) {
        if (notes && notes.trim()) {
          doc.font('Courier').fontSize(6).fillColor('#333333');
          doc.text(`Note Ritiro: ${notes.trim()}`, leftMargin, y, { width: contentWidth });
          y += 14;
        }

        // Position signatures near bottom if space allows
        const minSigY = Math.max(y + 20, 560);

        // Sender's Signature row
        doc.font('Helvetica-Bold').fontSize(6).fillColor('#000000');
        doc.text("Sender's Signature", leftMargin, minSigY);

        doc.font('Helvetica').fontSize(9);
        doc.text('_________________________', leftMargin + 92, minSigY - 2);

        doc.font('Helvetica-Bold').fontSize(6);
        doc.text('Date:  ______/______/_____', 340, minSigY);

        // Carrier Signature row
        const sigY2 = minSigY + 44;
        doc.font('Helvetica-Bold').fontSize(6);
        doc.text(`Received by ${carrierNameUpper}`, leftMargin, sigY2);

        doc.font('Helvetica').fontSize(9);
        doc.text('_________________________', leftMargin + 92, sigY2 - 2);

        doc.font('Helvetica-Bold').fontSize(6);
        doc.text('Date:  ______/______/_____ Time:  _______:______  hrs', 340, sigY2);

        return sigY2 + 20;
      }

      // Render document pages and rows
      let pageIndex = 0;
      let y = renderHeader(pageIndex);
      const neededBottomSpace = 160;

      shipments.forEach((row, idx) => {
        const receiverName = (row.recipient || row.customerName || '').toUpperCase();
        const serviceName = formatServiceName(row.service, carrier);

        let cityDisplay = (row.city || '').toUpperCase();
        const countryVal = (row.country || row.recipientCountry || '').toUpperCase();
        if (countryVal && countryVal !== 'IT' && countryVal !== 'ITA' && countryVal !== 'ITALIA') {
          if (!cityDisplay.includes(`(${countryVal})`) && !cityDisplay.endsWith(` ${countryVal}`)) {
            cityDisplay = cityDisplay ? `${cityDisplay} (${countryVal})` : countryVal;
          }
        }

        doc.font('Courier').fontSize(6);
        const recHeight = doc.heightOfString(receiverName, { width: cols[4].width });
        const cityHeight = doc.heightOfString(cityDisplay, { width: cols[5].width });
        const srvHeight = doc.heightOfString(serviceName, { width: cols[6].width });
        const currentRowHeight = Math.max(10, Math.max(recHeight, cityHeight, srvHeight) + 1);

        if (y + currentRowHeight > pageHeight - 50) {
          doc.addPage();
          pageIndex++;
          y = renderHeader(pageIndex);
        }

        doc.font('Courier').fontSize(6).fillColor('#000000');

        // Con Nr
        doc.text(String(row.tracking || '-'), cols[0].x, y, { width: cols[0].width, align: 'left', lineBreak: false });

        // Pieces
        doc.text(String(row.packages || 1), cols[1].x, y, { width: cols[1].width, align: 'right' });

        // Weight
        doc.text(formatWeight(row.weight), cols[2].x, y, { width: cols[2].width, align: 'right' });

        // Shipper Ref
        doc.text(String(row.reference || '-').toUpperCase(), cols[3].x, y, { width: cols[3].width, align: 'left', lineBreak: false });

        // Receiver
        doc.text(receiverName, cols[4].x, y, { width: cols[4].width, align: 'left' });

        // City
        doc.text(cityDisplay, cols[5].x, y, { width: cols[5].width, align: 'left' });

        // Service
        doc.text(serviceName, cols[6].x, y, { width: cols[6].width, align: 'left' });

        // C.O.D.
        const codVal = formatCod(row.cod);
        if (codVal) {
          doc.text(codVal, cols[7].x, y, { width: cols[7].width, align: 'right' });
        }

        y += currentRowHeight;
      });

      // Break page if remaining space is insufficient for Totals & Signatures
      if (y + neededBottomSpace > pageHeight - 40) {
        doc.addPage();
        pageIndex++;
        y = renderHeader(pageIndex);
      }

      y += 8;
      y = renderTotals(y);
      y = renderSignatures(y);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generateManifestPdf
};
