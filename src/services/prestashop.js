const axios = require('axios');

// Escape special XML characters to prevent injection
function escapeXML(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[<>&'"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'}[c]));
}

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
    return this.getOrders({ 'filter[reference]': `[${reference}]` });
  }

  async getCarriers({ onlyActive = false } = {}) {
    try {
      const params = {
        display: '[id,id_reference,name,deleted,active]',
        'filter[deleted]': '0'
      };
      if (onlyActive) {
        params['filter[active]'] = '1';
      }
      const { data } = await this.client.get('/carriers', { params });
      if (!data || !data.carriers) return [];
      const list = Array.isArray(data.carriers) ? data.carriers : [data.carriers];
      return list
        .filter(c => String(c.deleted ?? '0') !== '1' && (!onlyActive || String(c.active ?? '1') !== '0'))
        .map(c => ({
          id: String(c.id),
          ref: String(c.id_reference ?? c.id),
          name: String(c.name || `Corriere #${c.id}`).trim(),
          active: String(c.active ?? '1') !== '0'
        }));
    } catch (error) {
      console.error('PrestaShop getCarriers error:', error.message);
      return [];
    }
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
      const list = Array.isArray(data.order_carriers) ? data.order_carriers : [data.order_carriers];
      // Seleziona la spedizione con ID più recente (più alto)
      list.sort((a, b) => Number(b.id) - Number(a.id));
      return list[0];
    } catch (error) {
      console.error(`PrestaShop getOrderCarrierForOrder(${orderId}) error:`, error.message);
      return null;
    }
  }

  async updateOrderCarrierTracking(orderCarrierId, orderCarrierData, trackingNumber, newCarrierId = null) {
    try {
      const targetCarrierId = newCarrierId || orderCarrierData.id_carrier;
      // Costruisce l'XML con tracking_number e, se specificato, il nuovo id_carrier
      const xmlPayload = `
<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
  <order_carrier>
    <id>${escapeXML(orderCarrierId)}</id>
    <id_order>${escapeXML(orderCarrierData.id_order)}</id_order>
    <id_carrier>${escapeXML(targetCarrierId)}</id_carrier>
    <id_order_invoice>${escapeXML(orderCarrierData.id_order_invoice)}</id_order_invoice>
    <weight>${escapeXML(orderCarrierData.weight)}</weight>
    <shipping_cost_tax_excl>${escapeXML(orderCarrierData.shipping_cost_tax_excl)}</shipping_cost_tax_excl>
    <shipping_cost_tax_incl>${escapeXML(orderCarrierData.shipping_cost_tax_incl)}</shipping_cost_tax_incl>
    <tracking_number>${escapeXML(trackingNumber)}</tracking_number>
    <date_add>${escapeXML(orderCarrierData.date_add)}</date_add>
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

