const axios = require('axios');
const { tokenCache } = require('../config/cache');
const { QUICKBOOKS_CONFIG } = require('../config/quickbooks');
const { getValidAccessToken } = require('../utils/tokens');

// Helper function to make internal API calls
async function makeInternalAPICall(endpoint, method = 'GET', data = null) {
  console.log(`\n🔥 MAKE INTERNAL API CALL STARTED`);
  console.log(`📡 Endpoint: ${endpoint}`);
  console.log(`🔧 Method: ${method}`);
        // TEMPORARILY DISABLED: console.log(`📤 Data:`, data ? JSON.stringify(data, null, 2) : 'None');
  
  try {
    console.log(`🔐 Getting access token...`);
    const accessToken = await getValidAccessToken();
    console.log(`🎫 Access token obtained: ${accessToken ? 'YES' : 'NO'}`);
    
    const tokens = tokenCache.get('quickbooks_tokens');
    console.log(`💾 Tokens from cache:`, tokens ? 'PRESENT' : 'NOT FOUND');
    console.log(`🏢 Realm ID:`, tokens?.realmId || 'NOT FOUND');
    
    if (!tokens) {
      console.log(`❌ Not authenticated with QuickBooks - no tokens found`);
      throw new Error('Not authenticated with QuickBooks');
    }

    const baseURL = `${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}`;
    console.log(`🏗️ Base URL: ${baseURL}`);
    
    // Special handling for PUT requests to /invoice/:id - QuickBooks only accepts POST for updates
    let actualMethod = method;
    let actualEndpoint = endpoint;
    
    if (method === 'PUT' && endpoint.match(/^\/invoice\/\d+$/)) {
      console.log(`🔄 Converting PUT to POST for QuickBooks invoice update`);
      actualMethod = 'POST';
      actualEndpoint = '/invoice'; // QuickBooks expects POST to /invoice for updates
    }
    
    const config = {
      method: actualMethod,
      url: actualEndpoint.startsWith('http') ? actualEndpoint : `${baseURL}${actualEndpoint}`,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    };

    console.log(`🌐 Full URL: ${config.url}`);

    if (data && (actualMethod === 'POST' || actualMethod === 'PUT')) {
      config.data = data;
      config.headers['Content-Type'] = 'application/json';
    }

          // TEMPORARILY DISABLED: console.log(`📤 Request config:`, JSON.stringify(config, null, 2));
    console.log(`🚀 Making QuickBooks API request...`);

    const response = await axios(config);
    console.log(`✅ Response status: ${response.status}`);
          // TEMPORARILY DISABLED: console.log(`📋 Response data:`, JSON.stringify(response.data, null, 2));
    
    return response.data;
  } catch (error) {
    console.log(`💥 INTERNAL API CALL ERROR:`);
    console.log(`🔍 Error message:`, error.message);
    console.log(`🔍 Error response status:`, error.response?.status);
    console.log(`🔍 Error response data:`, JSON.stringify(error.response?.data, null, 2));
    
    console.error('Internal API call error:', error.response?.data || error.message);
    throw error;
  }
}

module.exports = {
  makeInternalAPICall
}; 