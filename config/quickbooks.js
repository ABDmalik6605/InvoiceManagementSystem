require('dotenv').config();

const QUICKBOOKS_CONFIG = {
  clientId: process.env.QUICKBOOKS_CLIENT_ID,
  clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET,
  redirectUri: process.env.QUICKBOOKS_REDIRECT_URI,
  environment: process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox',
  baseUrl: process.env.QUICKBOOKS_ENVIRONMENT === 'production' 
    ? 'https://quickbooks.api.intuit.com' 
    : 'https://sandbox-quickbooks.api.intuit.com',
  // OAuth authorization endpoint (same for both sandbox and production)
  authUrl: 'https://appcenter.intuit.com/connect/oauth2'
};

module.exports = { QUICKBOOKS_CONFIG }; 