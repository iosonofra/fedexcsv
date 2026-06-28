const axios = require('axios');

/**
 * Generates an OAuth 2.0 access token from FedEx.
 * 
 * @param {string} clientId 
 * @param {string} clientSecret 
 * @param {boolean} useSandbox 
 * @returns {Promise<string>} Access Token
 */
async function getAccessToken(clientId, clientSecret, useSandbox = true) {
  const baseUrl = useSandbox ? 'https://apis-sandbox.fedex.com' : 'https://apis.fedex.com';
  const url = `${baseUrl}/oauth/token`;
  
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', clientId);
  params.append('client_secret', clientSecret);

  try {
    const response = await axios.post(url, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      timeout: 10000 // 10s timeout
    });

    if (response.data && response.data.access_token) {
      return response.data.access_token;
    }
    throw new Error('La risposta di FedEx non contiene un token di accesso valido.');
  } catch (error) {
    console.error('FedEx OAuth authentication error:', error.message);
    if (error.response && error.response.data) {
      console.error('FedEx Response Data:', JSON.stringify(error.response.data));
      const fedexErr = error.response.data.errors || error.response.data.error_description;
      throw new Error(fedexErr ? JSON.stringify(fedexErr) : error.message);
    }
    throw error;
  }
}

/**
 * Helper to format date as YYYY-MM-DD
 */
function formatDate(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Searches FedEx for tracking number by shipment reference.
 * 
 * @param {string} reference PrestaShop order reference (Reference 1)
 * @param {object} credentials FedEx credentials { clientId, clientSecret, accountNumber, useSandbox }
 * @returns {Promise<string|null>} Tracking Number or null if not found
 */
async function getTrackingByReference(reference, credentials) {
  const { clientId, clientSecret, accountNumber, useSandbox } = credentials;
  
  const token = await getAccessToken(clientId, clientSecret, useSandbox);
  
  const baseUrl = useSandbox ? 'https://apis-sandbox.fedex.com' : 'https://apis.fedex.com';
  const url = `${baseUrl}/track/v1/referencenumbers`;
  
  const today = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(today.getDate() - 30);

  const referenceTypes = ['CUSTOMER_REFERENCE', 'SHIPPER_REFERENCE'];

  for (const refType of referenceTypes) {
    const payload = {
      referencesInformation: {
        type: refType,
        value: reference,
        accountNumber: accountNumber,
        shipDateBegin: formatDate(thirtyDaysAgo),
        shipDateEnd: formatDate(today)
      }
    };

    try {
      const response = await axios.post(url, payload, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'x-locale': 'it_IT'
        },
        timeout: 10000 // 10s timeout
      });

      const completeResults = response.data.output && response.data.output.completeTrackResults;
      if (Array.isArray(completeResults) && completeResults.length > 0) {
        const result = completeResults[0];
        const trackingNumber = result.trackingNumber || 
          (result.trackResults && result.trackResults[0] && result.trackResults[0].trackingNumberInfo && result.trackResults[0].trackingNumberInfo.trackingNumber);
        
        const hasErrors = result.trackResults && result.trackResults.some(tr => 
          tr.error && tr.error.code && tr.error.code !== 'TRACKING.REFERENCENUMBER.NOTFOUND'
        );
        if (hasErrors) {
          console.warn(`FedEx track result contains internal errors for reference "${reference}" (Type: ${refType})`);
          continue;
        }
        
        if (trackingNumber) {
          // If FedEx API returns the reference code itself as the tracking number, it is a dummy value (failed search)
          if (trackingNumber.trim().toUpperCase() === reference.trim().toUpperCase()) {
            continue;
          }
          return trackingNumber;
        }
      }
    } catch (error) {
      // If FedEx returns 404/NotFound or similar, continue to check next type or skip
      if (error.response && (error.response.status === 404 || (error.response.data && error.response.data.errors && error.response.data.errors.some(e => e.code === 'NOT.FOUND' || e.code === 'TRACKING.REFERENCENUMBER.NOTFOUND')))) {
        continue;
      }
      
      console.error(`FedEx Track by Reference error for "${reference}" (Type: ${refType}):`, error.message);
      if (error.response && error.response.data) {
        console.error('FedEx Response Detail:', JSON.stringify(error.response.data));
      }
      // If it is a bad request error due to reference type, continue to next type
      if (error.response && error.response.status === 400) {
        continue;
      }
      throw error;
    }
  }
  
  return null;
}

module.exports = {
  getAccessToken,
  getTrackingByReference
};
