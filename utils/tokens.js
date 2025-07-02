const axios = require('axios');
const { tokenCache } = require('../config/cache');
const { QUICKBOOKS_CONFIG } = require('../config/quickbooks');

// Helper function to refresh access token
async function refreshAccessToken(refreshToken) {
  try {
    console.log('Refreshing access token...');
    
    const response = await axios.post('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', 
      `grant_type=refresh_token&refresh_token=${refreshToken}`,
      {
        headers: {
          'Authorization': `Basic ${Buffer.from(`${QUICKBOOKS_CONFIG.clientId}:${QUICKBOOKS_CONFIG.clientSecret}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const { access_token, expires_in, refresh_token, x_refresh_token_expires_in } = response.data;
    
    const tokens = {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: Date.now() + (expires_in * 1000),
      refreshExpiresAt: Date.now() + (x_refresh_token_expires_in * 1000),
      realmId: tokenCache.get('quickbooks_tokens')?.realmId
    };

    tokenCache.set('quickbooks_tokens', tokens);
    console.log('Access token refreshed successfully');
    
    return access_token;
  } catch (error) {
    console.error('Token refresh error:', error.response?.data || error.message);
    throw new Error('Failed to refresh access token');
  }
}

// Helper function to get valid access token
async function getValidAccessToken() {
  const tokens = tokenCache.get('quickbooks_tokens');
  
  if (!tokens) {
    throw new Error('No tokens found. Please authenticate with QuickBooks first.');
  }

  // Check if token is expired (with 5 minute buffer)
  if (Date.now() > (tokens.expiresAt - 300000)) {
    return await refreshAccessToken(tokens.refreshToken);
  }

  return tokens.accessToken;
}

// Utility function
function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

module.exports = {
  refreshAccessToken,
  getValidAccessToken,
  generateRandomString
}; 