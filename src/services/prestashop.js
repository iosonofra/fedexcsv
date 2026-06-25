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
}

module.exports = PrestaShopClient;
