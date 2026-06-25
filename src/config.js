require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  prestashop: {
    baseUrl: process.env.PRESTASHOP_BASE_URL || 'https://www.dagimarket.com',
    apiKey: process.env.PRESTASHOP_API_KEY || ''
  },
  shipper: {
    name: process.env.SHIPPER_NAME || 'dvg commerce c/o logitech',
    company: process.env.SHIPPER_COMPANY || 'dvg commerce c/o logitech',
    address1: process.env.SHIPPER_ADDRESS1 || 'VIA DELLE INDUSTRIE 14',
    city: process.env.SHIPPER_CITY || 'ROSATE',
    state: process.env.SHIPPER_STATE || 'MI',
    zip: process.env.SHIPPER_ZIP || '20088',
    country: process.env.SHIPPER_COUNTRY || 'IT',
    phone: process.env.SHIPPER_PHONE || '0290834163'
  },
  package: {
    weight: process.env.DEFAULT_WEIGHT || '70',
    length: process.env.DEFAULT_LENGTH || '80',
    width: process.env.DEFAULT_WIDTH || '60',
    height: process.env.DEFAULT_HEIGHT || '100',
    service: process.env.DEFAULT_SERVICE || 'FEDEX_REGIONAL_ECONOMY_FREIGHT',
    packageType: process.env.DEFAULT_PACKAGE || 'YOUR_PACKAGING'
  }
};
