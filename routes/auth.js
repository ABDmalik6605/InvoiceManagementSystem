const express = require('express');
const axios = require('axios');
const { tokenCache } = require('../config/cache');
const { QUICKBOOKS_CONFIG } = require('../config/quickbooks');
const { generateRandomString } = require('../utils/tokens');

const router = express.Router();

// QuickBooks OAuth initiation
router.get('/quickbooks', (req, res) => {
  const state = generateRandomString(32);
  const scope = 'com.intuit.quickbooks.accounting';
  
  const authUrl = `${QUICKBOOKS_CONFIG.authUrl}?` +
    `client_id=${QUICKBOOKS_CONFIG.clientId}&` +
    `scope=${scope}&` +
    `redirect_uri=${encodeURIComponent(QUICKBOOKS_CONFIG.redirectUri)}&` +
    `response_type=code&` +
    `access_type=offline&` +
    `state=${state}`;

  res.redirect(authUrl);
});

// OAuth callback handler
router.get('/callback', async (req, res) => {
  try {
    const { code, realmId, state } = req.query;

    if (!code) {
      return res.status(400).send('Authorization code not provided');
    }

    console.log('OAuth callback received:', { code: code.substring(0, 10) + '...', realmId, state });

    // Exchange authorization code for access token
    const tokenResponse = await axios.post(
      'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
      `grant_type=authorization_code&code=${code}&redirect_uri=${encodeURIComponent(QUICKBOOKS_CONFIG.redirectUri)}`,
      {
        headers: {
          'Authorization': `Basic ${Buffer.from(`${QUICKBOOKS_CONFIG.clientId}:${QUICKBOOKS_CONFIG.clientSecret}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const { 
      access_token, 
      refresh_token, 
      expires_in, 
      x_refresh_token_expires_in,
      token_type 
    } = tokenResponse.data;

    // Store tokens in cache
    const tokens = {
      accessToken: access_token,
      refreshToken: refresh_token,
      realmId: realmId,
      expiresAt: Date.now() + (expires_in * 1000),
      refreshExpiresAt: Date.now() + (x_refresh_token_expires_in * 1000)
    };

    tokenCache.set('quickbooks_tokens', tokens);
    console.log('Tokens stored successfully');

    // Success page
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>QuickBooks Connected!</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .success { color: #28a745; font-size: 24px; margin-bottom: 20px; }
          .endpoint { background: #f8f9fa; padding: 10px; margin: 5px 0; border-radius: 5px; font-family: monospace; }
          .info { background: #e3f2fd; padding: 15px; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1 class="success">✅ QuickBooks Connected Successfully!</h1>
          
          <div class="info">
            <h3>🔗 Connection Details:</h3>
            <p><strong>Company ID:</strong> ${realmId}</p>
            <p><strong>Token Type:</strong> ${token_type || 'bearer'}</p>
            <p><strong>Expires In:</strong> ${expires_in ? `${Math.round(expires_in / 3600)} hours` : 'Never'}</p>
            <p><strong>Storage:</strong> In-memory cache (tokens will be lost on server restart)</p>
          </div>
          
          <h3>🔗 API Endpoints:</h3>
          <div class="endpoint">GET /api/status - Check connection status</div>
          <div class="endpoint">GET /api/company - Get company information</div>
          <div class="endpoint">GET /api/invoices - List invoices</div>
          <div class="endpoint">POST /api/invoices - Create invoice</div>
          <div class="endpoint">GET /api/invoices/:id - Get specific invoice</div>
          <div class="endpoint">PUT /api/invoices/:id - Update invoice</div>
          <div class="endpoint">DELETE /api/invoices/:id - Delete invoice</div>
          
          <p><strong>Note:</strong> Tokens are stored in memory and will be lost on server restart. 
          For production, implement persistent storage.</p>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('OAuth callback error:', error.response?.data || error.message);
    res.status(500).send(`
      <h1>Error connecting to QuickBooks</h1>
      <p>Error: ${error.message}</p>
      <p>Please try again by visiting <a href="/auth/quickbooks">/auth/quickbooks</a></p>
    `);
  }
});

// Logout endpoint
router.post('/logout', (req, res) => {
  tokenCache.del('quickbooks_tokens');
  res.json({ 
    success: true, 
    message: 'Logged out successfully',
    action: 'Visit /auth/quickbooks to reconnect'
  });
});

module.exports = router; 