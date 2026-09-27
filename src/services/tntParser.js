const pdfParse = require('pdf-parse');

/**
 * Regex per riga manifest TNT:
 * - Tracking (Con Nr): MY + 8 cifre a inizio riga
 * - Pezzi: numero intero nella seconda colonna
 * - Peso: colonna numerica decimale
 * - Riferimento ordine (Shipper Ref.): 9 caratteri alfanumerici [A-Z0-9]{9}
 */
const ROW_REGEX = /^(MY\d{8})\s+(\d+)\s+[\d.,]+\s+([A-Z0-9]{9})\b/gm;
const TOTALS_REGEX = /Grand Totals:[\s\r\n]+(\d+)/i;

/**
 * Esegue il parsing e le verifiche di coerenza a partire dal testo estratto dal PDF.
 *
 * @param {string} text - Testo estratto dal documento
 */
function parseManifestText(text) {
  const rows = [];
  const errors = [];
  const dupes = [];

  // Reset indice per regex globale
  ROW_REGEX.lastIndex = 0;
  let match;

  while ((match = ROW_REGEX.exec(text)) !== null) {
    rows.push({
      tracking: match[1],
      pieces: parseInt(match[2], 10),
      reference: match[3].toUpperCase(),
    });
  }

  // Estrazione totale colli atteso da 'Grand Totals:'
  const totalsMatch = text.match(TOTALS_REGEX);
  const expected = totalsMatch ? parseInt(totalsMatch[1], 10) : null;
  const found = rows.reduce((sum, r) => sum + r.pieces, 0);

  // Rilevamento duplicati
  const refCounts = new Map();
  const trackingCounts = new Map();

  for (const row of rows) {
    refCounts.set(row.reference, (refCounts.get(row.reference) || 0) + 1);
    trackingCounts.set(row.tracking, (trackingCounts.get(row.tracking) || 0) + 1);
  }

  for (const [ref, count] of refCounts.entries()) {
    if (count > 1) {
      dupes.push(`Riferimento ordine duplicato nel PDF: ${ref} (${count} occorrenze)`);
    }
  }

  for (const [tr, count] of trackingCounts.entries()) {
    if (count > 1) {
      dupes.push(`Tracking TNT duplicato nel PDF: ${tr} (${count} occorrenze)`);
    }
  }

  // Verifiche di validità e coerenza
  if (rows.length === 0) {
    errors.push('Nessuna spedizione valida trovata nel documento TNT.');
  }

  if (expected === null) {
    errors.push("Riepilogo 'Grand Totals' non trovato nel documento.");
  } else if (expected !== found) {
    errors.push(`Incongruenza colli: 'Grand Totals' indica ${expected} colli, ma ne sono stati estratti ${found}.`);
  }

  if (dupes.length > 0) {
    errors.push(...dupes);
  }

  return {
    rows,
    expected,
    found,
    ok: errors.length === 0,
    dupes,
    errors
  };
}

/**
 * Effettua il parsing di un Buffer PDF del manifest TNT.
 *
 * @param {Buffer} buffer - Contenuto binario del file PDF
 */
async function parseManifest(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError('Il parametro buffer deve essere un Buffer Node.js valido');
  }

  const pdfData = await pdfParse(buffer);
  return parseManifestText(pdfData.text || '');
}

module.exports = {
  parseManifest,
  parseManifestText
};
