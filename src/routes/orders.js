const express = require('express');
const router = express.Router();
const settingsStore = require('../services/settingsStore');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let orderStatesCache = null;

async function initializeOrderStatesCache(client) {
  if (orderStatesCache) return;
  try {
    const states = await client.getOrderStates();
    orderStatesCache = {};
    if (Array.isArray(states)) {
      states.forEach(s => {
        // Try to find the Italian name (lang ID '1'), fallback to the first available translation
        const nameObj = (s.name && Array.isArray(s.name)) ? (s.name.find(n => n.id === '1') || s.name[0]) : null;
        orderStatesCache[s.id] = {
          name: nameObj ? nameObj.value : `Stato ${s.id}`,
          color: s.color || '#3b82f6'
        };
      });
    }
  } catch (err) {
    console.error('Error fetching order states for cache:', err.message);
    orderStatesCache = {};
  }
}

async function getOrderStateName(stateId, client) {
  await initializeOrderStatesCache(client);
  return orderStatesCache[stateId] ? orderStatesCache[stateId].name : `Stato ${stateId}`;
}

router.get('/states', async (req, res) => {
  try {
    const psClient = settingsStore.getPrestaShopClient();
    await initializeOrderStatesCache(psClient);
    let statesList = Object.entries(orderStatesCache).map(([id, stateObj]) => ({
      id: parseInt(id, 10),
      name: stateObj.name,
      color: stateObj.color
    })).sort((a, b) => a.id - b.id);

    // Filtra gli stati abilitati se richiesto
    if (req.query.filter === 'enabled') {
      const settings = settingsStore.getSettings();
      const enabledStates = settings.prestashop.enabledOrderStates;
      if (Array.isArray(enabledStates) && enabledStates.length > 0) {
        statesList = statesList.filter(s => enabledStates.includes(s.id));
      }
    }

    res.json(statesList);
  } catch (error) {
    console.error('Error in GET /api/orders/states:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const psClient = settingsStore.getPrestaShopClient();
    await initializeOrderStatesCache(psClient);
    const { reference, state, date_from, date_to } = req.query;

    // Use a small limit of 5 on initial load for speed, but allow 100+ when active search filters are applied
    const hasFilters = reference || state || date_from || date_to;
    const filters = {
      sort: '[id_DESC]',
      limit: req.query.limit || (hasFilters ? '100' : '5')
    };

    if (reference) {
      filters['filter[reference]'] = `[${reference}]`;
    }

    if (state) {
      filters['filter[current_state]'] = `[${state}]`;
    }

    if (date_from || date_to) {
      const from = date_from ? `${date_from} 00:00:00` : '1970-01-01 00:00:00';
      const to = date_to ? `${date_to} 23:59:59` : '2099-12-31 23:59:59';
      filters['filter[date_add]'] = `[${from},${to}]`;
    }

    // Fetch matching orders
    const orders = await psClient.getOrders(filters);

    if (!orders || orders.length === 0) {
      return res.json([]);
    }

    const customerCache = {};
    const addressCache = {};
    const countryCache = {};
    const stateCache = {};

    // Ensure orders are sorted in descending order of ID
    const sortedOrders = orders.sort((a, b) => parseInt(b.id, 10) - parseInt(a.id, 10));

    // Resolve customer names and detailed addresses concurrently using Promise.all
    const resolvedOrders = await Promise.all(sortedOrders.map(async (order) => {
      const idCustomer = order.id_customer;
      const idAddress = order.id_address_delivery;

      // Helper function to resolve customer name with local caching
      const getCustomerDetails = async () => {
        if (!idCustomer || idCustomer === '0') {
          return { name: 'Unknown Customer', error: true };
        }
        if (customerCache[idCustomer]) {
          return customerCache[idCustomer];
        }
        try {
          const customer = await psClient.getCustomer(idCustomer);
          if (customer) {
            const fullName = `${customer.firstname || ''} ${customer.lastname || ''}`.trim() || 'Unknown Customer';
            const res = { name: fullName, error: false };
            customerCache[idCustomer] = res;
            return res;
          }
        } catch (err) {
          console.error(`Error resolving customer ${idCustomer}:`, err.message);
        }
        const res = { name: 'Unknown Customer', error: true };
        customerCache[idCustomer] = res;
        return res;
      };

      // Helper function to resolve detailed address with local caching
      const getDeliveryDetails = async () => {
        const fallback = {
          street: '—',
          city: '—',
          province: '—',
          country: '—',
          error: true
        };

        if (!idAddress || idAddress === '0') {
          return fallback;
        }

        try {
          let address = addressCache[idAddress];
          let fetchError = false;

          if (!address) {
            address = await psClient.getAddress(idAddress);
            if (address) {
              addressCache[idAddress] = address;
            } else {
              fetchError = true;
            }
          }

          if (address) {
            const street = address.address1 || '—';
            
            // Format city name: Capitalize first letters (Title Case)
            const rawCity = address.city || '—';
            const city = rawCity.replace(/\b\w/g, c => c.toUpperCase());

            // Resolve country code (abbreviation)
            let countryIso = '';
            if (address.id_country && address.id_country !== '0') {
              if (countryCache[address.id_country]) {
                countryIso = countryCache[address.id_country];
              } else {
                const country = await psClient.getCountry(address.id_country);
                if (country && country.iso_code) {
                  countryIso = country.iso_code;
                  countryCache[address.id_country] = countryIso;
                } else {
                  fetchError = true;
                }
              }
            }
            if (!countryIso) countryIso = 'IT';

            // Resolve state/province abbreviation
            let stateAbbr = '';
            if (address.id_state && address.id_state !== '0') {
              if (stateCache[address.id_state]) {
                stateAbbr = stateCache[address.id_state];
              } else {
                const state = await psClient.getState(address.id_state);
                if (state && state.iso_code) {
                  stateAbbr = state.iso_code;
                  stateCache[address.id_state] = stateAbbr;
                } else {
                  fetchError = true;
                }
              }
            }
            if (!stateAbbr) stateAbbr = '—';

            // Also check if any key field is missing
            const incomplete = !address.address1 || !address.city || !address.postcode || !countryIso;

            return {
              street,
              city,
              province: stateAbbr,
              country: countryIso,
              error: fetchError || incomplete
            };
          }
        } catch (err) {
          console.error(`Error resolving address details for ${idAddress}:`, err.message);
        }
        return fallback;
      };

      // Execute both API fetches concurrently for this order
      const [customerDetails, deliveryDetails] = await Promise.all([
        getCustomerDetails(),
        getDeliveryDetails()
      ]);

      // Resolve state name and color dynamically from cache
      const stateInfo = orderStatesCache[parseInt(order.current_state, 10)] || {
        name: `Stato ${order.current_state}`,
        color: '#3b82f6'
      };

      const products = (order.associations && Array.isArray(order.associations.order_rows))
        ? order.associations.order_rows.map(row => ({
            name: row.product_name || 'N/A',
            qty: parseInt(row.product_quantity, 10) || 1
          }))
        : [];

      return {
        id: parseInt(order.id, 10),
        reference: order.reference,
        date_add: order.date_add,
        total_paid_tax_incl: order.total_paid_tax_incl,
        customer_name: customerDetails.name,
        customer_error: customerDetails.error,
        delivery_address: deliveryDetails.street,
        delivery_city: deliveryDetails.city,
        delivery_province: deliveryDetails.province,
        delivery_country: deliveryDetails.country,
        address_error: deliveryDetails.error,
        current_state: parseInt(order.current_state, 10),
        state_name: stateInfo.name,
        state_color: stateInfo.color,
        products: products
      };
    }));

    res.json(resolvedOrders);
  } catch (error) {
    console.error('Error in GET /api/orders:', error);
    res.status(500).json({ error: error.message });
  }
});

// Esposta per invalidare la cache quando cambiano le credenziali
function resetOrderStatesCache() {
  orderStatesCache = null;
}

module.exports = router;
module.exports.resetOrderStatesCache = resetOrderStatesCache;
