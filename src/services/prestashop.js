const axios = require('axios');

class PrestaShopClient {
  constructor(baseUrl, apiKey) {
    // Ensure clean base URL without trailing slash before adding /api
    const cleanedBaseUrl = baseUrl.replace(/\/+$/, '');
    this.client = axios.create({
      baseURL: `${cleanedBaseUrl}/api`,
      auth: { username: apiKey, password: '' },
      params: { output_format: 'JSON' }
    });
  }

  async getOrders(filters = {}) {
    try {
      const params = { display: 'full', ...filters };
      const { data } = await this.client.get('/orders', { params });
      if (!data) return [];
      return data.orders || [];
    } catch (error) {
      console.error('PrestaShop getOrders error:', error.message);
      if (error.response && error.response.status === 404) {
        // PrestaShop API can return 404 if no orders match filters
        return [];
      }
      throw new Error(`Failed to fetch orders from PrestaShop: ${error.message}`);
    }
  }

  async getOrder(id) {
    try {
      const { data } = await this.client.get(`/orders/${id}`);
      return data ? data.order : null;
    } catch (error) {
      console.error(`PrestaShop getOrder(${id}) error:`, error.message);
      throw new Error(`Failed to fetch order ${id} from PrestaShop: ${error.message}`);
    }
  }

  async getAddress(id) {
    try {
      const { data } = await this.client.get(`/addresses/${id}`);
      return data ? data.address : null;
    } catch (error) {
      console.error(`PrestaShop getAddress(${id}) error:`, error.message);
      return null;
    }
  }

  async getCustomer(id) {
    try {
      const { data } = await this.client.get(`/customers/${id}`);
      return data ? data.customer : null;
    } catch (error) {
      console.error(`PrestaShop getCustomer(${id}) error:`, error.message);
      return null;
    }
  }

  async getCountry(id) {
    try {
      const { data } = await this.client.get(`/countries/${id}`);
      return data ? data.country : null;
    } catch (error) {
      console.error(`PrestaShop getCountry(${id}) error:`, error.message);
      return null;
    }
  }

  async getState(id) {
    try {
      const { data } = await this.client.get(`/states/${id}`);
      return data ? data.state : null;
    } catch (error) {
      console.error(`PrestaShop getState(${id}) error:`, error.message);
      return null;
    }
  }

  async getOrderStates() {
    try {
      const { data } = await this.client.get('/order_states', {
        params: { display: 'full' }
      });
      return data ? data.order_states : [];
    } catch (error) {
      console.error('PrestaShop getOrderStates error:', error.message);
      return [];
    }
  }

  async getOrdersByReference(reference) {
    return this.getOrders({ 'filter[reference]': reference });
  }

  async getOrderCarrierForOrder(orderId) {
    try {
      const { data } = await this.client.get('/order_carriers', {
        params: {
          'filter[id_order]': orderId,
          display: 'full'
        }
      });
      if (!data || !data.order_carriers || data.order_carriers.length === 0) {
        return null;
      }
      return data.order_carriers[0];
    } catch (error) {
      console.error(`PrestaShop getOrderCarrierForOrder(${orderId}) error:`, error.message);
      return null;
    }
  }

  async updateOrderCarrierTracking(orderCarrierId, orderCarrierData, trackingNumber) {
    try {
      // Build the XML payload from the existing order carrier data, updating only tracking_number.
      const xmlPayload = `
<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
  <order_carrier>
    <id>${orderCarrierId}</id>
    <id_order>${orderCarrierData.id_order || ''}</id_order>
    <id_carrier>${orderCarrierData.id_carrier || ''}</id_carrier>
    <id_order_invoice>${orderCarrierData.id_order_invoice || ''}</id_order_invoice>
    <weight>${orderCarrierData.weight || ''}</weight>
    <shipping_cost_tax_excl>${orderCarrierData.shipping_cost_tax_excl || ''}</shipping_cost_tax_excl>
    <shipping_cost_tax_incl>${orderCarrierData.shipping_cost_tax_incl || ''}</shipping_cost_tax_incl>
    <tracking_number>${trackingNumber}</tracking_number>
    <date_add>${orderCarrierData.date_add || ''}</date_add>
  </order_carrier>
</prestashop>
      `.trim();

      const { data } = await this.client.put(`/order_carriers/${orderCarrierId}`, xmlPayload, {
        headers: {
          'Content-Type': 'application/xml'
        },
        params: {
          output_format: 'JSON'
        }
      });
      
      return data ? data.order_carrier : null;
    } catch (error) {
      console.error(`PrestaShop updateOrderCarrierTracking(${orderCarrierId}) error:`, error.message);
      if (error.response && error.response.data) {
        console.error('Response details:', JSON.stringify(error.response.data));
      }
      throw error;
    }
  }
}

module.exports = PrestaShopClient;

