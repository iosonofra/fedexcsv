const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

async function buildFedExExcel(rows) {
  const wb = new ExcelJS.Workbook();
  const templatePath = path.join(__dirname, '../../templates/fedex_example.xlsx');
  
  if (fs.existsSync(templatePath)) {
    await wb.xlsx.readFile(templatePath);
  } else {
    throw new Error('Template file templates/fedex_example.xlsx not found.');
  }

  // Target the first worksheet
  const ws = wb.getWorksheet(1);

  // Set headers for columns 60 to 66 programmatically to enable recipient email notifications and billing options
  ws.getCell(1, 60).value = 'recipientDeliveryNotification';
  ws.getCell(1, 61).value = 'recipientExceptionNotification';
  ws.getCell(1, 62).value = 'recipientShipAlertNotification';
  ws.getCell(1, 63).value = 'recipientNotificationLanguageCode';
  ws.getCell(1, 64).value = 'recipientNotificationLocaleCode';
  ws.getCell(1, 65).value = 'taxPaymentType';
  ws.getCell(1, 66).value = 'paymentType';

  // Clear existing template rows backwards to force exceljs to reset rowCount
  const rowCount = ws.rowCount;
  for (let i = rowCount; i >= 2; i--) {
    ws.spliceRows(i, 1);
  }

  // Populate worksheet based on the exact 59 columns in example-batch-upload.xlsx + 5 notification columns
  rows.forEach(row => {
    const values = [];
    
    values[1] = row.reference || '';
    values[2] = row.senderContactName || '';
    values[3] = row.senderCompany || '';
    values[4] = row.senderContactNumber || '';
    values[5] = row.senderEmail || '';
    values[6] = row.senderLine1 || '';
    values[7] = row.senderLine2 || null;
    values[8] = row.senderPostcode || '';
    values[9] = row.senderState || null;
    values[10] = row.senderCity || '';
    values[11] = row.senderCountry || '';
    values[12] = row.recipientContactName || '';
    values[13] = row.recipientCompany || null;
    values[14] = row.recipientContactNumber || '';
    values[15] = row.recipientEmail || null;
    values[16] = row.recipientLine1 || '';
    values[17] = row.recipientLine2 || null;
    values[18] = row.recipientLine3 || null;
    values[19] = row.recipientPostcode || '';
    values[20] = row.recipientState || null;
    values[21] = row.recipientCity || '';
    values[22] = row.recipientCountry || '';
    values[23] = row.packageType || 'YOUR_PACKAGING';
    values[24] = row.numberOfPackages ? Number(row.numberOfPackages) : 1;
    values[25] = row.packageWeight ? Number(row.packageWeight) : 0;
    values[26] = row.weightUnits || 'KGS';
    values[27] = row.length ? Number(row.length) : null;
    values[28] = row.width ? Number(row.width) : null;
    values[29] = row.height ? Number(row.height) : null;
    values[30] = row.currencyType || 'EUR';
    values[31] = row.oneRatePricing || null;
    values[32] = row.commodityType || 'ITEMS';
    values[33] = row.itemDescription || 'elettronica';
    values[34] = row.harmonizedCode || null;
    values[35] = row.manufacturingCountry || null;
    values[36] = row.commodityQuantity || null;
    values[37] = row.commodityMeasureUnit || null;
    values[38] = row.commodityWeight || null;
    values[39] = row.customsValue || null;
    values[40] = row.documentType || null;
    values[41] = row.documentDescription || null;
    values[42] = row.purposeOfShipment || null;
    values[43] = row.generateInvoice || null;
    values[44] = row.etdEnabled || 'Y';
    values[45] = row.serviceType || 'FEDEX_REGIONAL_ECONOMY_FREIGHT';
    values[46] = row.soldToPartyCountry || null;
    values[47] = row.soldToPartyContactName || null;
    values[48] = row.soldToPartyCompany || null;
    values[49] = row.soldToPartyLine1 || null;
    values[50] = row.soldToPartyLine2 || null;
    values[51] = row.soldToPartyLine3 || null;
    values[52] = row.soldToPartyCity || null;
    values[53] = row.soldToPartyState || null;
    values[54] = row.soldToPartyPostcode || null;
    values[55] = row.soldToPartyPhoneExtension || null;
    values[56] = row.soldToPartyContactNumber || null;
    values[57] = row.soldToPartyTin || null;
    values[58] = row.soldToPartyEmail || null;
    values[59] = row.soldToPartyAccountNumber || null;
    
    // Recipient email notification fields mapped to columns 60 to 64
    values[60] = row.recipientDeliveryNotification || 'Y';
    values[61] = row.recipientExceptionNotification || 'Y';
    values[62] = row.recipientShipAlertNotification || 'Y';
    values[63] = row.recipientNotificationLanguageCode || 'en';
    values[64] = row.recipientNotificationLocaleCode || null;

    // Billing terms mapped to columns 65 and 66 (Sender pays duties/taxes and shipping by default)
    values[65] = row.taxPaymentType || 'SENDER';
    values[66] = row.paymentType || 'SENDER';

    ws.addRow(values);
  });

  return wb;
}

async function getFedExDefaults() {
  const wb = new ExcelJS.Workbook();
  const templatePath = path.join(__dirname, '../../personal-example-batch-upload.xlsx');
  
  if (!fs.existsSync(templatePath)) {
    throw new Error('Template file personal-example-batch-upload.xlsx not found in workspace root.');
  }

  await wb.xlsx.readFile(templatePath);
  const ws = wb.getWorksheet(1);
  const row = ws.getRow(2); // Row 2 is the first data row containing default shipper and goods settings
  
  const values = [];
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    values[colNumber] = cell.value;
  });

  return {
    reference: values[1] || '',
    serviceType: values[2] || 'FEDEX_REGIONAL_ECONOMY_FREIGHT',
    shipmentType: values[3] || 'OUTBOUND',
    source: values[4] || 'ECOMMERCE',
    senderContactName: values[5] || '',
    senderCompany: values[6] || '',
    senderContactNumber: values[7] || '',
    senderLine1: values[8] || '',
    senderPostcode: values[9] || '',
    senderCity: values[10] || '',
    senderCountry: values[11] || '',
    numberOfPackages: values[12] ? Number(values[12]) : 1,
    packageWeight: values[13] ? Number(values[13]) : 70,
    weightUnits: values[14] || 'KGS',
    length: values[15] ? Number(values[15]) : 80,
    width: values[16] ? Number(values[16]) : 60,
    height: values[17] ? Number(values[17]) : 100,
    etdEnabled: values[18] || 'Y',
    baseRate: values[19] ? Number(values[19]) : 478.80,
    packageType: values[20] || 'YOUR_PACKAGING',
    currencyType: values[21] || 'EUR',
    commodityType: values[22] || 'ITEMS',
    itemDescription: values[23] || 'elettronica'
  };
}

module.exports = { buildFedExExcel, getFedExDefaults };
