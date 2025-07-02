const express = require('express');
const axios = require('axios');
const session = require('express-session');
const cors = require('cors');
const NodeCache = require('node-cache');
require('dotenv').config();

// AI SDK imports
const { generateText, tool, streamText } = require('ai');
const { openai } = require('@ai-sdk/openai');
const { z } = require('zod');

const app = express();
const PORT = process.env.PORT || 3000;

// QuickBooks OAuth Configuration
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

// Token cache (in production, use a database)
const tokenCache = new NodeCache({ stdTTL: 3600 }); // 1 hour TTL

// ===== AI TOOLS DEFINITIONS =====

// Helper function to make internal API calls
async function makeInternalAPICall(endpoint, method = 'GET', data = null) {
  try {
    const accessToken = await getValidAccessToken();
    const tokens = tokenCache.get('quickbooks_tokens');
    
    if (!tokens) {
      throw new Error('Not authenticated with QuickBooks');
    }

    const baseURL = `${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}`;
    
    const config = {
      method,
      url: endpoint.startsWith('http') ? endpoint : `${baseURL}${endpoint}`,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    };

    if (data && (method === 'POST' || method === 'PUT')) {
      config.data = data;
      config.headers['Content-Type'] = 'application/json';
    }

    const response = await axios(config);
    return response.data;
  } catch (error) {
    console.error('Internal API call error:', error.response?.data || error.message);
    throw error;
  }
}

// Define AI tools using Vercel AI SDK
const invoiceTools = {
  getInvoices: tool({
    description: 'Get a list of invoices with optional filtering by status, date range, or limit. Returns invoice data including amounts, customer info, and payment status.',
    parameters: z.object({
      limit: z.number().optional().describe('Maximum number of invoices to return (default: 20)'),
      status: z.string().optional().describe('Filter by invoice status'),
      dateFrom: z.string().optional().describe('Start date for filtering (YYYY-MM-DD format)'),
      dateTo: z.string().optional().describe('End date for filtering (YYYY-MM-DD format)'),
    }),
    execute: async ({ limit = 20, status, dateFrom, dateTo }) => {
      try {
        let query = 'SELECT * FROM Invoice';
        const conditions = [];
        
        if (status) {
          conditions.push(`DocNumber = '${status}'`);
        }
        if (dateFrom) {
          conditions.push(`TxnDate >= '${dateFrom}'`);
        }
        if (dateTo) {
          conditions.push(`TxnDate <= '${dateTo}'`);
        }
        
        if (conditions.length > 0) {
          query += ' WHERE ' + conditions.join(' AND ');
        }
        
        query += ` ORDER BY TxnDate DESC MAXRESULTS ${limit}`;
        
        const result = await makeInternalAPICall(`/query?query=${encodeURIComponent(query)}`);
        
        const invoices = result.QueryResponse?.Invoice || [];
        
        return {
          success: true,
          count: invoices.length,
          invoices: invoices.map(inv => ({
            id: inv.Id,
            number: inv.DocNumber,
            customer: inv.CustomerRef?.name || 'Unknown',
            amount: inv.TotalAmt,
            balance: inv.Balance,
            status: parseFloat(inv.Balance) > 0 ? 'unpaid' : 'paid',
            date: inv.TxnDate,
            dueDate: inv.DueDate
          }))
        };
      } catch (error) {
        return {
          success: false,
          error: 'Failed to fetch invoices: ' + error.message
        };
      }
    },
  }),

  getInvoiceById: tool({
    description: 'Get detailed information about a specific invoice by its ID. Returns complete invoice data including line items, customer details, and payment information. Provide a concise 3-6 line summary.',
    parameters: z.object({
      invoiceId: z.string().describe('The ID of the invoice to retrieve'),
    }),
    execute: async ({ invoiceId }) => {
      try {
        const result = await makeInternalAPICall(`/invoice/${invoiceId}`);
        const invoice = result.QueryResponse?.Invoice?.[0];
        
        if (!invoice) {
          return {
            success: false,
            error: 'Invoice not found'
          };
        }

        // Generate concise summary (3-6 lines)
        const customerName = invoice.CustomerRef?.name || 'Unknown';
        const status = parseFloat(invoice.Balance || 0) > 0 ? 'unpaid' : 'paid';
        const lineItems = invoice.Line?.filter(line => line.DetailType === 'SalesItemLineDetail') || [];
        
        let summary = `Invoice #${invoice.DocNumber} for ${customerName} is ${status}. `;
        summary += `Total amount: $${invoice.TotalAmt}, Balance due: $${invoice.Balance || '0.00'}. `;
        summary += `Invoice date: ${invoice.TxnDate}, Due date: ${invoice.DueDate || 'Not specified'}. `;
        
        if (lineItems.length > 0) {
          const mainItems = lineItems.slice(0, 2).map(item => item.Description || 'Item').join(', ');
          const moreText = lineItems.length > 2 ? ` and ${lineItems.length - 2} more items` : '';
          summary += `Items include: ${mainItems}${moreText}.`;
        }

        return {
          success: true,
          invoice: invoice,  // Return raw QuickBooks invoice object that frontend expects
          summary: summary   // Concise plain text summary for AI response
        };
      } catch (error) {
        return {
          success: false,
          error: 'Failed to fetch invoice: ' + error.message
        };
      }
    },
  }),

  getInvoiceByNumber: tool({
    description: 'Get detailed information about a specific invoice by its invoice number (DocNumber). Use this when someone asks for "invoice 1001" or "show me invoice number 1035". Provide a concise 3-6 line summary.',
    parameters: z.object({
      invoiceNumber: z.string().describe('The invoice number (DocNumber) to retrieve'),
    }),
    execute: async ({ invoiceNumber }) => {
      try {
        // Query QuickBooks directly for invoice by DocNumber
        const query = `SELECT * FROM Invoice WHERE DocNumber = '${invoiceNumber}' MAXRESULTS 1`;
        const result = await makeInternalAPICall(`/query?query=${encodeURIComponent(query)}`);
        const invoice = result.QueryResponse?.Invoice?.[0];
        
        if (!invoice) {
          return {
            success: false,
            error: `Invoice number ${invoiceNumber} not found`
          };
        }

        // Generate concise summary (3-6 lines)
        const customerName = invoice.CustomerRef?.name || 'Unknown';
        const status = parseFloat(invoice.Balance || 0) > 0 ? 'unpaid' : 'paid';
        const lineItems = invoice.Line?.filter(line => line.DetailType === 'SalesItemLineDetail') || [];
        
        let summary = `Invoice #${invoice.DocNumber} for ${customerName} is ${status}. `;
        summary += `Total amount: $${invoice.TotalAmt}, Balance due: $${invoice.Balance || '0.00'}. `;
        summary += `Invoice date: ${invoice.TxnDate}, Due date: ${invoice.DueDate || 'Not specified'}. `;
        
        if (lineItems.length > 0) {
          const mainItems = lineItems.slice(0, 2).map(item => item.Description || 'Item').join(', ');
          const moreText = lineItems.length > 2 ? ` and ${lineItems.length - 2} more items` : '';
          summary += `Items include: ${mainItems}${moreText}.`;
        }

        return {
          success: true,
          invoice: invoice,  // Return raw QuickBooks invoice object that frontend expects
          summary: summary   // Concise plain text summary for AI response
        };
      } catch (error) {
        return {
          success: false,
          error: 'Failed to fetch invoice: ' + error.message
        };
      }
    },
  }),

  createInvoice: tool({
    description: 'Create a new invoice for a customer. Requires customer ID and line items with amounts.',
    parameters: z.object({
      customerId: z.string().describe('The QuickBooks customer ID'),
      lineItems: z.array(z.object({
        amount: z.number().describe('Line item amount'),
        description: z.string().optional().describe('Line item description'),
        quantity: z.number().optional().describe('Quantity (default: 1)')
      })).describe('Array of line items for the invoice'),
      dueDate: z.string().optional().describe('Due date in YYYY-MM-DD format'),
    }),
    execute: async ({ customerId, lineItems, dueDate }) => {
      try {
        const invoiceData = {
          Line: lineItems.map((item, index) => ({
            Id: (index + 1).toString(),
            Amount: item.amount,
            Description: item.description || `Line item ${index + 1}`,
            DetailType: 'SalesItemLineDetail',
            SalesItemLineDetail: {
              Qty: item.quantity || 1
            }
          })),
          CustomerRef: {
            value: customerId
          }
        };

        if (dueDate) {
          invoiceData.DueDate = dueDate;
        }

        const result = await makeInternalAPICall('/invoice', 'POST', invoiceData);
        const invoice = result.QueryResponse?.Invoice?.[0];

        return {
          success: true,
          message: 'Invoice created successfully',
          invoice: {
            id: invoice.Id,
            number: invoice.DocNumber,
            amount: invoice.TotalAmt,
            customer: invoice.CustomerRef?.name
          }
        };
      } catch (error) {
        return {
          success: false,
          error: 'Failed to create invoice: ' + error.message
        };
      }
    },
  }),

  getCustomers: tool({
    description: 'Get a list of customers from QuickBooks. Useful for finding customer IDs when creating invoices.',
    parameters: z.object({
      limit: z.number().optional().describe('Maximum number of customers to return (default: 20)'),
      active: z.boolean().optional().describe('Filter by active customers only (default: true)')
    }),
    execute: async ({ limit = 20, active = true }) => {
      try {
        let query = 'SELECT * FROM Customer';
        if (active) {
          query += ' WHERE Active = true';
        }
        query += ` ORDER BY Name ASC MAXRESULTS ${limit}`;

        const result = await makeInternalAPICall(`/query?query=${encodeURIComponent(query)}`);
        const customers = result.QueryResponse?.Customer || [];

        return {
          success: true,
          count: customers.length,
          customers: customers.map(customer => ({
            id: customer.Id,
            name: customer.Name,
            companyName: customer.CompanyName,
            email: customer.PrimaryEmailAddr?.Address,
            phone: customer.PrimaryPhone?.FreeFormNumber,
            active: customer.Active
          }))
        };
      } catch (error) {
        return {
          success: false,
          error: 'Failed to fetch customers: ' + error.message
        };
      }
    },
  }),

  getCompanyInfo: tool({
    description: 'Get company information from QuickBooks including company name, address, and basic details.',
    parameters: z.object({}),
    execute: async () => {
      try {
        const result = await makeInternalAPICall('/companyinfo/1');
        const company = result.QueryResponse?.CompanyInfo?.[0];

        if (!company) {
          return {
            success: false,
            error: 'Company information not found'
          };
        }

        return {
          success: true,
          company: {
            name: company.CompanyName,
            legalName: company.LegalName,
            address: company.CompanyAddr ? {
              line1: company.CompanyAddr.Line1,
              city: company.CompanyAddr.City,
              state: company.CompanyAddr.CountrySubDivisionCode,
              postalCode: company.CompanyAddr.PostalCode,
              country: company.CompanyAddr.Country
            } : null,
            phone: company.PrimaryPhone?.FreeFormNumber,
            email: company.Email?.Address,
            website: company.WebAddr?.URI
          }
        };
      } catch (error) {
        return {
          success: false,
          error: 'Failed to fetch company info: ' + error.message
        };
      }
    },
  }),

  searchInvoices: tool({
    description: 'Search invoices using natural language criteria. Can search by customer name, amount ranges, dates, or status.',
    parameters: z.object({
      searchQuery: z.string().describe('Search criteria (e.g., "unpaid invoices", "invoices over $1000", "invoices from last month")')
    }),
    execute: async ({ searchQuery }) => {
      try {
        // Simple query parsing - in a real implementation, you'd use more sophisticated NLP
        let query = 'SELECT * FROM Invoice';
        const conditions = [];
        
        if (searchQuery.toLowerCase().includes('unpaid')) {
          conditions.push('Balance > 0');
        }
        
        if (searchQuery.toLowerCase().includes('paid')) {
          conditions.push('Balance = 0');
        }
        
        // Extract amount ranges
        const amountMatch = searchQuery.match(/(\$|over|above|more than)\s*(\d+)/i);
        if (amountMatch) {
          const amount = amountMatch[2];
          conditions.push(`TotalAmt > ${amount}`);
        }
        
        if (conditions.length > 0) {
          query += ' WHERE ' + conditions.join(' AND ');
        }
        
        query += ' ORDER BY TxnDate DESC MAXRESULTS 50';
        
        const result = await makeInternalAPICall(`/query?query=${encodeURIComponent(query)}`);
        const invoices = result.QueryResponse?.Invoice || [];

        return {
          success: true,
          searchQuery: searchQuery,
          count: invoices.length,
          invoices: invoices.map(inv => ({
            id: inv.Id,
            number: inv.DocNumber,
            customer: inv.CustomerRef?.name || 'Unknown',
            amount: inv.TotalAmt,
            balance: inv.Balance,
            status: parseFloat(inv.Balance) > 0 ? 'unpaid' : 'paid',
            date: inv.TxnDate,
            dueDate: inv.DueDate
          }))
        };
      } catch (error) {
        return {
          success: false,
          error: 'Failed to search invoices: ' + error.message
        };
      }
    },
  }),

  analyzeInvoices: tool({
    description: 'Analyze invoice data to provide business insights like total revenue, unpaid amounts, overdue invoices, and customer analysis.',
    parameters: z.object({
      analysisType: z.enum(['revenue', 'unpaid', 'overdue', 'customer_summary', 'all']).describe('Type of analysis to perform')
    }),
    execute: async ({ analysisType }) => {
      try {
        // Get recent invoices for analysis
        const result = await makeInternalAPICall('/query?query=' + encodeURIComponent('SELECT * FROM Invoice ORDER BY TxnDate DESC MAXRESULTS 100'));
        const invoices = result.QueryResponse?.Invoice || [];

        const analysis = {
          success: true,
          analysisType: analysisType,
          period: 'Last 100 invoices',
          data: {}
        };

        if (analysisType === 'revenue' || analysisType === 'all') {
          const totalRevenue = invoices.reduce((sum, inv) => sum + parseFloat(inv.TotalAmt || 0), 0);
          const paidRevenue = invoices.reduce((sum, inv) => {
            return parseFloat(inv.Balance || 0) === 0 ? sum + parseFloat(inv.TotalAmt || 0) : sum;
          }, 0);
          
          analysis.data.revenue = {
            total: totalRevenue,
            paid: paidRevenue,
            pending: totalRevenue - paidRevenue,
            averageInvoice: invoices.length > 0 ? totalRevenue / invoices.length : 0
          };
        }

        if (analysisType === 'unpaid' || analysisType === 'all') {
          const unpaidInvoices = invoices.filter(inv => parseFloat(inv.Balance || 0) > 0);
          const totalUnpaid = unpaidInvoices.reduce((sum, inv) => sum + parseFloat(inv.Balance || 0), 0);
          
          analysis.data.unpaid = {
            count: unpaidInvoices.length,
            totalAmount: totalUnpaid,
            invoices: unpaidInvoices.slice(0, 10).map(inv => ({
              id: inv.Id,
              number: inv.DocNumber,
              customer: inv.CustomerRef?.name,
              amount: inv.Balance,
              dueDate: inv.DueDate
            }))
          };
        }

        if (analysisType === 'overdue' || analysisType === 'all') {
          const today = new Date();
          const overdueInvoices = invoices.filter(inv => {
            if (parseFloat(inv.Balance || 0) <= 0) return false;
            if (!inv.DueDate) return false;
            return new Date(inv.DueDate) < today;
          });

          analysis.data.overdue = {
            count: overdueInvoices.length,
            totalAmount: overdueInvoices.reduce((sum, inv) => sum + parseFloat(inv.Balance || 0), 0),
            invoices: overdueInvoices.slice(0, 10).map(inv => ({
              id: inv.Id,
              number: inv.DocNumber,
              customer: inv.CustomerRef?.name,
              amount: inv.Balance,
              dueDate: inv.DueDate,
              daysOverdue: Math.ceil((today - new Date(inv.DueDate)) / (1000 * 60 * 60 * 24))
            }))
          };
        }

        return analysis;
      } catch (error) {
        return {
          success: false,
          error: 'Failed to analyze invoices: ' + error.message
        };
      }
    },
  })
};

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // Set to true in production with HTTPS
}));

// QuickBooks OAuth Routes

// Step 1: Initiate OAuth flow
app.get('/auth/quickbooks', (req, res) => {
  const state = generateRandomString(32);
  const authUrl = `${QUICKBOOKS_CONFIG.authUrl}` +
    `?client_id=${QUICKBOOKS_CONFIG.clientId}` +
    `&response_type=code` +
    `&scope=com.intuit.quickbooks.accounting` +
    `&redirect_uri=${encodeURIComponent(QUICKBOOKS_CONFIG.redirectUri)}` +
    `&state=${state}`;

  console.log('Initiating OAuth flow:', {
    authUrl: QUICKBOOKS_CONFIG.authUrl,
    clientId: QUICKBOOKS_CONFIG.clientId ? 'present' : 'missing',
    redirectUri: QUICKBOOKS_CONFIG.redirectUri,
    state: state,
    fullAuthUrl: authUrl
  });

  res.redirect(authUrl);
});

// Step 2: Handle OAuth callback
app.get('/auth/callback', async (req, res) => {
  // Extract all OAuth parameters from the callback
  const { 
    code, 
    state, 
    realmId, 
    scope,
    error: oauthError,
    error_description 
  } = req.query;

  // Enhanced debug logging
  console.log('=== OAuth Callback Debug ===');
  console.log('Full URL:', req.url);
  console.log('All Query Parameters:', req.query);
  console.log('Individual Parameters:');
  console.log('  - Authorization Code:', code ? `✅ ${code.substring(0, 20)}...` : '❌ Missing');
  console.log('  - State:', state ? `✅ ${state}` : '❌ Missing');
  console.log('  - Realm ID:', realmId ? `✅ ${realmId}` : '❌ Missing');
  console.log('  - Scope:', scope ? `✅ ${scope}` : '❌ Missing');
  console.log('  - OAuth Error:', oauthError ? `❌ ${oauthError}` : '✅ None');
  console.log('  - Error Description:', error_description ? `❌ ${error_description}` : '✅ None');
  console.log('==========================');

  // Check for OAuth errors first
  if (oauthError) {
    console.log('❌ OAuth Error received:', oauthError);
    console.log('❌ Error Description:', error_description);
    return res.status(400).json({
      error: 'OAuth authorization failed',
      oauth_error: oauthError,
      error_description: error_description,
      message: 'QuickBooks returned an error during authorization'
    });
  }

  // Check if this is a direct visit to callback URL (no parameters)
  if (Object.keys(req.query).length === 0) {
    console.log('ℹ️ Direct visit to callback URL detected (no OAuth parameters)');
    
    // Check if user is already authenticated
    const existingTokens = tokenCache.get('quickbooks_tokens');
    if (existingTokens && req.session.quickbooksConnected) {
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>QuickBooks Already Connected</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
            .success { color: #28a745; }
            .info { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 10px 0; }
            a { color: #007bff; text-decoration: none; }
            a:hover { text-decoration: underline; }
          </style>
        </head>
        <body>
          <h2 class="success">✅ Already Connected to QuickBooks!</h2>
          <p>You are already authenticated with QuickBooks.</p>
          
          <div class="info">
            <p><strong>Realm ID:</strong> ${existingTokens.realmId}</p>
            <p><strong>Status:</strong> Connected and ready</p>
          </div>
          
          <h3>🚀 Available Actions:</h3>
          <ul>
            <li><a href="/api/status" target="_blank">Check Auth Status</a></li>
            <li><a href="/api/company" target="_blank">Get Company Info</a></li>
            <li><a href="/api/invoices" target="_blank">List Invoices</a></li>
            <li><a href="/" target="_blank">View API Documentation</a></li>
          </ul>
          
          <p><a href="/auth/quickbooks">Start New Authorization</a> | <a href="/">Back to Home</a></p>
        </body>
        </html>
      `);
    } else {
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>QuickBooks OAuth Callback</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
            .info { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 10px 0; }
            a { color: #007bff; text-decoration: none; }
            a:hover { text-decoration: underline; }
          </style>
        </head>
        <body>
          <h2>QuickBooks OAuth Callback</h2>
          <div class="info">
            <p>This is the QuickBooks OAuth callback endpoint.</p>
            <p>You shouldn't visit this URL directly.</p>
          </div>
          
          <p><a href="/auth/quickbooks">Start QuickBooks Authorization</a> | <a href="/">Back to Home</a></p>
        </body>
        </html>
      `);
    }
  }

  // Validate required parameters
  if (!code) {
    console.log('❌ No authorization code received. Full query:', req.query);
    console.log('❌ This usually means:');
    console.log('   - Authorization was cancelled');
    console.log('   - Redirect URI mismatch');
    console.log('   - App not properly configured');
    return res.status(400).json({ 
      error: 'Authorization code missing',
      message: 'No authorization code received from QuickBooks',
      receivedParams: Object.keys(req.query),
      expectedParams: ['code', 'state', 'realmId'],
      fullQuery: req.query,
      debug: {
        url: req.url,
        query: req.query
      }
    });
  }

  if (!realmId) {
    console.log('❌ No realmId received. This is required for QuickBooks API calls.');
    return res.status(400).json({
      error: 'RealmId missing',
      message: 'No realmId received from QuickBooks. This is required for API access.',
      receivedParams: Object.keys(req.query),
      fullQuery: req.query
    });
  }

  try {
    // Exchange authorization code for access token
    console.log('Exchanging authorization code for tokens...');
    console.log('Token exchange URL:', 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer');
    console.log('Client ID:', QUICKBOOKS_CONFIG.clientId ? 'present' : 'missing');
    console.log('Client Secret:', QUICKBOOKS_CONFIG.clientSecret ? 'present' : 'missing');
    console.log('Redirect URI:', QUICKBOOKS_CONFIG.redirectUri);
    
    const tokenResponse = await axios.post(
      'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: QUICKBOOKS_CONFIG.redirectUri
      }).toString(),
      {
        headers: {
          'Authorization': `Basic ${Buffer.from(`${QUICKBOOKS_CONFIG.clientId}:${QUICKBOOKS_CONFIG.clientSecret}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const { access_token, refresh_token, expires_in, token_type } = tokenResponse.data;
    const now = new Date();
    const expires_at = Date.now() + (expires_in * 1000);

    // Store tokens (in production, save to database)
    const tokenData = {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresIn: expires_in,
      realmId: realmId,
      expiresAt: expires_at
    };

    tokenCache.set('quickbooks_tokens', tokenData);
    req.session.quickbooksConnected = true;
    req.session.realmId = realmId;

    console.log('=== QUICKBOOKS AUTHENTICATION SUCCESS ===');
    console.log('Access Token:', access_token ? '✅ Stored' : '❌ Missing');
    console.log('Refresh Token:', refresh_token ? '✅ Stored' : '❌ Missing');
    console.log('Realm ID:', realmId);
    console.log('Token Type:', token_type || 'bearer');
    console.log('Expires In:', expires_in ? `${expires_in} seconds` : 'Never');
    console.log('Storage: In-memory cache');
    console.log('==========================================');

    // Return success HTML page
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>QuickBooks Authorization Success</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
          .success { color: #28a745; }
          .error { color: #dc3545; }
          .info { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 10px 0; }
          .endpoint { background: #e9ecef; padding: 10px; border-radius: 3px; font-family: monospace; }
          a { color: #007bff; text-decoration: none; }
          a:hover { text-decoration: underline; }
        </style>
      </head>
      <body>
        <h2 class="success">🎉 Authorization Success!</h2>
        <p>Your QuickBooks access token has been stored and is ready to use!</p>
        
        <h3>✅ What's Ready:</h3>
        <ul>
          <li>✅ Access Token: Stored in memory</li>
          <li>✅ Refresh Token: Stored for automatic renewal</li>
          <li>✅ Realm ID: ${realmId}</li>
          <li>✅ Auto-refresh: Available</li>
          <li>✅ QBO Client: Ready to use</li>
        </ul>
        
        <h3>🚀 Test Your Integration:</h3>
        <ul>
          <li><a href="/api/status" target="_blank">Check Auth Status</a></li>
          <li><a href="/api/company" target="_blank">Get Company Info</a></li>
          <li><a href="/api/invoices" target="_blank">List Invoices</a></li>
          <li><a href="/" target="_blank">View API Documentation</a></li>
        </ul>
        
        <h3>💾 Token Information:</h3>
        <div class="info">
          <p><strong>Access Token:</strong> ${access_token ? '✅ Stored' : '❌ Missing'}</p>
          <p><strong>Refresh Token:</strong> ${refresh_token ? '✅ Stored' : '❌ Missing'}</p>
          <p><strong>Realm ID:</strong> ${realmId}</p>
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
      </body>
      </html>
    `);
  } catch (error) {
    console.error('=== OAuth Token Exchange Error ===');
    console.error('Error message:', error.message);
    console.error('Status code:', error.response?.status);
    console.error('Response data:', error.response?.data);
    console.error('Request config:', {
      url: error.config?.url,
      method: error.config?.method,
      headers: error.config?.headers
    });
    console.error('===================================');
    
    res.status(500).json({ 
      error: 'Authentication failed',
      message: error.message,
      details: error.response?.data || error.message,
      statusCode: error.response?.status,
      debug: {
        clientId: QUICKBOOKS_CONFIG.clientId ? 'present' : 'missing',
        clientSecret: QUICKBOOKS_CONFIG.clientSecret ? 'present' : 'missing',
        redirectUri: QUICKBOOKS_CONFIG.redirectUri,
        baseUrl: QUICKBOOKS_CONFIG.baseUrl
      }
    });
  }
});

// Step 3: Refresh token when expired
async function refreshAccessToken(refreshToken) {
  try {
    const response = await axios.post(
      `${QUICKBOOKS_CONFIG.baseUrl}/oauth2/v1/tokens/bearer`,
      {
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      },
      {
        headers: {
          'Authorization': `Basic ${Buffer.from(`${QUICKBOOKS_CONFIG.clientId}:${QUICKBOOKS_CONFIG.clientSecret}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const { access_token, refresh_token, expires_in } = response.data;
    
    // Update stored tokens
    const tokenData = {
      accessToken: access_token,
      refreshToken: refresh_token || refreshToken, // Use new refresh token if provided
      expiresIn: expires_in,
      expiresAt: Date.now() + (expires_in * 1000)
    };

    tokenCache.set('quickbooks_tokens', tokenData);
    return access_token;
  } catch (error) {
    console.error('Token refresh error:', error.response?.data || error.message);
    throw error;
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

// API Routes for QuickBooks operations

// Get company info
app.get('/api/company', async (req, res) => {
  try {
    const accessToken = await getValidAccessToken();
    const tokens = tokenCache.get('quickbooks_tokens');

    const response = await axios.get(
      `${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/companyinfo/${tokens.realmId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Company info error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch company info' });
  }
});

// ===== INVOICE READ OPERATIONS =====

// Get all invoices with optional filtering
app.get('/api/invoices', async (req, res) => {
  try {
    const accessToken = await getValidAccessToken();
    const tokens = tokenCache.get('quickbooks_tokens');
    
    const { limit = 100, offset = 0, status, dateFrom, dateTo } = req.query;
    
    let query = 'SELECT * FROM Invoice';
    const conditions = [];
    
    if (status) {
      conditions.push(`DocNumber = '${status}'`);
    }
    if (dateFrom) {
      conditions.push(`TxnDate >= '${dateFrom}'`);
    }
    if (dateTo) {
      conditions.push(`TxnDate <= '${dateTo}'`);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ` ORDER BY DocNumber ASC MAXRESULTS ${limit} STARTPOSITION ${offset}`;

    const response = await axios.get(
      `${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/query?query=${encodeURIComponent(query)}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Get invoices error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

// Get specific invoice by ID
app.get('/api/invoices/:id', async (req, res) => {
  try {
    const accessToken = await getValidAccessToken();
    const tokens = tokenCache.get('quickbooks_tokens');
    const { id } = req.params;

    const response = await axios.get(
      `${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/invoice/${id}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Get invoice error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

// Search invoices with custom criteria
app.post('/api/invoices/search', async (req, res) => {
  try {
    const accessToken = await getValidAccessToken();
    const tokens = tokenCache.get('quickbooks_tokens');
    const { query, limit = 100, offset = 0 } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    const encodedQuery = encodeURIComponent(query);
    const response = await axios.get(
      `${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/query?query=${encodedQuery}&MAXRESULTS=${limit}&STARTPOSITION=${offset}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Search invoices error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to search invoices' });
  }
});

// ===== INVOICE CREATE OPERATIONS =====

// Create new invoice
app.post('/api/invoices', async (req, res) => {
  try {
    const accessToken = await getValidAccessToken();
    const tokens = tokenCache.get('quickbooks_tokens');

    const response = await axios.post(
      `${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/invoice`,
      req.body,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Create invoice error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

// ===== INVOICE UPDATE OPERATIONS =====

// Update existing invoice
app.put('/api/invoices/:id', async (req, res) => {
  try {
    const accessToken = await getValidAccessToken();
    const tokens = tokenCache.get('quickbooks_tokens');
    const { id } = req.params;

    const response = await axios.post(
      `${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/invoice`,
      {
        ...req.body,
        Id: id,
        sparse: true
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Update invoice error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to update invoice' });
  }
});

// Void invoice
app.post('/api/invoices/:id/void', async (req, res) => {
  try {
    const accessToken = await getValidAccessToken();
    const tokens = tokenCache.get('quickbooks_tokens');
    const { id } = req.params;

    const response = await axios.post(
      `${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/invoice`,
      {
        Id: id,
        sparse: true,
        Void: true
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Void invoice error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to void invoice' });
  }
});

// ===== INVOICE DELETE OPERATIONS =====

// Delete invoice
app.delete('/api/invoices/:id', async (req, res) => {
  try {
    const accessToken = await getValidAccessToken();
    const tokens = tokenCache.get('quickbooks_tokens');
    const { id } = req.params;

    const response = await axios.post(
      `${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/invoice`,
      {
        Id: id,
        sparse: true,
        Void: true
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );

    res.json({ success: true, message: 'Invoice deleted successfully' });
  } catch (error) {
    console.error('Delete invoice error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to delete invoice' });
  }
});

// ===== INVOICE EMAIL OPERATIONS =====

// Send invoice PDF via email
app.post('/api/invoices/:id/send', async (req, res) => {
  try {
    const accessToken = await getValidAccessToken();
    const tokens = tokenCache.get('quickbooks_tokens');
    const { id } = req.params;
    const { email, subject, message } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email address is required' });
    }

    const response = await axios.post(
      `${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/invoice/${id}/send`,
      {
        EmailAddress: email,
        EmailMessage: message || 'Please find the attached invoice.',
        Subject: subject || 'Invoice from QuickBooks'
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Send invoice error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to send invoice' });
  }
});

// Download invoice PDF
app.get('/api/invoices/:id/pdf', async (req, res) => {
  try {
    const accessToken = await getValidAccessToken();
    const tokens = tokenCache.get('quickbooks_tokens');
    const { id } = req.params;

    const response = await axios.get(
      `${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/invoice/${id}/pdf`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/pdf'
        },
        responseType: 'stream'
      }
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${id}.pdf"`);
    response.data.pipe(res);
  } catch (error) {
    console.error('Download PDF error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to download invoice PDF' });
  }
});

// ===== CUSTOMERS API =====

// Get all customers
app.get('/api/customers', async (req, res) => {
  try {
    const accessToken = await getValidAccessToken();
    const tokens = tokenCache.get('quickbooks_tokens');
    const { limit = 100, offset = 0, active = 'true' } = req.query;

    let query = 'SELECT * FROM Customer';
    if (active === 'true') {
      query += " WHERE Active = true";
    }
    query += ` ORDER BY Name ASC MAXRESULTS ${limit} STARTPOSITION ${offset}`;

    const response = await axios.get(
      `${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/query?query=${encodeURIComponent(query)}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Get customers error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// Get specific customer by ID
app.get('/api/customers/:id', async (req, res) => {
  try {
    const accessToken = await getValidAccessToken();
    const tokens = tokenCache.get('quickbooks_tokens');
    const { id } = req.params;

    const response = await axios.get(
      `${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/customer/${id}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Get customer error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch customer' });
  }
});

// Create new customer
app.post('/api/customers', async (req, res) => {
  try {
    const accessToken = await getValidAccessToken();
    const tokens = tokenCache.get('quickbooks_tokens');

    const response = await axios.post(
      `${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/customer`,
      req.body,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Create customer error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

// Update customer
app.put('/api/customers/:id', async (req, res) => {
  try {
    const accessToken = await getValidAccessToken();
    const tokens = tokenCache.get('quickbooks_tokens');
    const { id } = req.params;

    const response = await axios.post(
      `${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/customer`,
      {
        ...req.body,
        Id: id,
        sparse: true
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Update customer error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

// ===== ITEMS/PRODUCTS API =====

// Get all items
app.get('/api/items', async (req, res) => {
  try {
    const accessToken = await getValidAccessToken();
    const tokens = tokenCache.get('quickbooks_tokens');
    const { limit = 100, offset = 0, type = 'all' } = req.query;

    let query = 'SELECT * FROM Item';
    if (type !== 'all') {
      query += ` WHERE Type = '${type}'`;
    }
    query += ` ORDER BY Name ASC MAXRESULTS ${limit} STARTPOSITION ${offset}`;

    const response = await axios.get(
      `${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/query?query=${encodeURIComponent(query)}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Get items error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

// Get specific item by ID
app.get('/api/items/:id', async (req, res) => {
  try {
    const accessToken = await getValidAccessToken();
    const tokens = tokenCache.get('quickbooks_tokens');
    const { id } = req.params;

    const response = await axios.get(
      `${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/item/${id}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Get item error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch item' });
  }
});

// Create new item
app.post('/api/items', async (req, res) => {
  try {
    const accessToken = await getValidAccessToken();
    const tokens = tokenCache.get('quickbooks_tokens');

    const response = await axios.post(
      `${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/item`,
      req.body,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Create item error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to create item' });
  }
});

// ===== PAYMENTS API =====

// Get all payments
app.get('/api/payments', async (req, res) => {
  try {
    const accessToken = await getValidAccessToken();
    const tokens = tokenCache.get('quickbooks_tokens');
    const { limit = 100, offset = 0, dateFrom, dateTo } = req.query;

    let query = 'SELECT * FROM Payment';
    const conditions = [];
    
    if (dateFrom) {
      conditions.push(`TxnDate >= '${dateFrom}'`);
    }
    if (dateTo) {
      conditions.push(`TxnDate <= '${dateTo}'`);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ` ORDER BY TxnDate DESC MAXRESULTS ${limit} STARTPOSITION ${offset}`;

    const response = await axios.get(
      `${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/query?query=${encodeURIComponent(query)}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Get payments error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

// Get specific payment by ID
app.get('/api/payments/:id', async (req, res) => {
  try {
    const accessToken = await getValidAccessToken();
    const tokens = tokenCache.get('quickbooks_tokens');
    const { id } = req.params;

    const response = await axios.get(
      `${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/payment/${id}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Get payment error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch payment' });
  }
});

// Create payment
app.post('/api/payments', async (req, res) => {
  try {
    const accessToken = await getValidAccessToken();
    const tokens = tokenCache.get('quickbooks_tokens');

    const response = await axios.post(
      `${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/payment`,
      req.body,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Create payment error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to create payment' });
  }
});

// ===== REPORTS & ANALYTICS API =====

// Get dashboard summary
app.get('/api/dashboard/summary', async (req, res) => {
  try {
    const accessToken = await getValidAccessToken();
    const tokens = tokenCache.get('quickbooks_tokens');

    // Get multiple data points in parallel
    const [invoicesResponse, customersResponse, paymentsResponse, itemsResponse] = await Promise.all([
      axios.get(
        `${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/query?query=${encodeURIComponent('SELECT COUNT(*) FROM Invoice')}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        }
      ),
      axios.get(
        `${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/query?query=${encodeURIComponent('SELECT COUNT(*) FROM Customer WHERE Active = true')}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        }
      ),
      axios.get(
        `${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/query?query=${encodeURIComponent('SELECT COUNT(*) FROM Payment')}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        }
      ),
      axios.get(
        `${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/query?query=${encodeURIComponent('SELECT COUNT(*) FROM Item WHERE Active = true')}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        }
      )
    ]);

    // Get recent invoices for trend analysis
    const recentInvoicesResponse = await axios.get(
      `${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/query?query=${encodeURIComponent('SELECT * FROM Invoice ORDER BY TxnDate DESC MAXRESULTS 10')}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      }
    );

    const summary = {
      totals: {
        invoices: invoicesResponse.data.QueryResponse?.totalCount || 0,
        customers: customersResponse.data.QueryResponse?.totalCount || 0,
        payments: paymentsResponse.data.QueryResponse?.totalCount || 0,
        items: itemsResponse.data.QueryResponse?.totalCount || 0
      },
      recentInvoices: recentInvoicesResponse.data.QueryResponse?.Invoice || [],
      lastUpdated: new Date().toISOString()
    };

    res.json(summary);
  } catch (error) {
    console.error('Dashboard summary error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch dashboard summary' });
  }
});

// Get invoice analytics
app.get('/api/analytics/invoices', async (req, res) => {
  try {
    const accessToken = await getValidAccessToken();
    const tokens = tokenCache.get('quickbooks_tokens');
    const { dateFrom, dateTo, groupBy = 'month' } = req.query;

    let query = 'SELECT * FROM Invoice';
    const conditions = [];
    
    if (dateFrom) {
      conditions.push(`TxnDate >= '${dateFrom}'`);
    }
    if (dateTo) {
      conditions.push(`TxnDate <= '${dateTo}'`);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY TxnDate DESC MAXRESULTS 500';

    const response = await axios.get(
      `${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/query?query=${encodeURIComponent(query)}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      }
    );

    const invoices = response.data.QueryResponse?.Invoice || [];
    
    // Process analytics
    const analytics = {
      totalInvoices: invoices.length,
      totalAmount: invoices.reduce((sum, inv) => sum + (parseFloat(inv.TotalAmt) || 0), 0),
      paidInvoices: invoices.filter(inv => inv.Balance === '0').length,
      unpaidInvoices: invoices.filter(inv => parseFloat(inv.Balance) > 0).length,
      overdue: invoices.filter(inv => {
        const dueDate = new Date(inv.DueDate);
        return parseFloat(inv.Balance) > 0 && dueDate < new Date();
      }).length,
      averageAmount: invoices.length > 0 ? 
        invoices.reduce((sum, inv) => sum + (parseFloat(inv.TotalAmt) || 0), 0) / invoices.length : 0,
      byStatus: {
        paid: invoices.filter(inv => inv.Balance === '0').length,
        unpaid: invoices.filter(inv => parseFloat(inv.Balance) > 0).length,
        draft: invoices.filter(inv => inv.EmailStatus === 'NotSet').length
      }
    };

    res.json(analytics);
  } catch (error) {
    console.error('Invoice analytics error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch invoice analytics' });
  }
});

// Get customer analytics
app.get('/api/analytics/customers', async (req, res) => {
  try {
    const accessToken = await getValidAccessToken();
    const tokens = tokenCache.get('quickbooks_tokens');

    const [customersResponse, invoicesResponse] = await Promise.all([
      axios.get(
        `${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/query?query=${encodeURIComponent('SELECT * FROM Customer WHERE Active = true ORDER BY Name ASC MAXRESULTS 100')}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        }
      ),
      axios.get(
        `${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/query?query=${encodeURIComponent('SELECT * FROM Invoice ORDER BY TxnDate DESC MAXRESULTS 500')}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        }
      )
    ]);

    const customers = customersResponse.data.QueryResponse?.Customer || [];
    const invoices = invoicesResponse.data.QueryResponse?.Invoice || [];

    // Calculate customer analytics
    const customerAnalytics = customers.map(customer => {
      const customerInvoices = invoices.filter(inv => inv.CustomerRef?.value === customer.Id);
      const totalAmount = customerInvoices.reduce((sum, inv) => sum + (parseFloat(inv.TotalAmt) || 0), 0);
      const unpaidAmount = customerInvoices.reduce((sum, inv) => sum + (parseFloat(inv.Balance) || 0), 0);

      return {
        id: customer.Id,
        name: customer.Name,
        email: customer.PrimaryEmailAddr?.Address,
        totalInvoices: customerInvoices.length,
        totalAmount,
        unpaidAmount,
        lastInvoiceDate: customerInvoices.length > 0 ? 
          customerInvoices.sort((a, b) => new Date(b.TxnDate) - new Date(a.TxnDate))[0].TxnDate : null
      };
    });

    res.json({
      totalCustomers: customers.length,
      topCustomers: customerAnalytics
        .sort((a, b) => b.totalAmount - a.totalAmount)
        .slice(0, 10),
      customersWithUnpaid: customerAnalytics.filter(c => c.unpaidAmount > 0).length,
      analytics: customerAnalytics
    });
  } catch (error) {
    console.error('Customer analytics error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch customer analytics' });
  }
});

// ===== BULK DATA OPERATIONS =====

// Bulk data fetch for AI processing
app.get('/api/bulk/all-data', async (req, res) => {
  try {
    const accessToken = await getValidAccessToken();
    const tokens = tokenCache.get('quickbooks_tokens');
    const { limit = 100 } = req.query;

    console.log('Fetching bulk data for AI processing...');

    // Fetch all main entities in parallel
    const [invoicesResponse, customersResponse, itemsResponse, paymentsResponse] = await Promise.all([
      axios.get(
        `${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/query?query=${encodeURIComponent(`SELECT * FROM Invoice ORDER BY TxnDate DESC MAXRESULTS ${limit}`)}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        }
      ),
      axios.get(
        `${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/query?query=${encodeURIComponent(`SELECT * FROM Customer WHERE Active = true ORDER BY Name ASC MAXRESULTS ${limit}`)}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        }
      ),
      axios.get(
        `${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/query?query=${encodeURIComponent(`SELECT * FROM Item WHERE Active = true ORDER BY Name ASC MAXRESULTS ${limit}`)}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        }
      ),
      axios.get(
        `${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/query?query=${encodeURIComponent(`SELECT * FROM Payment ORDER BY TxnDate DESC MAXRESULTS ${limit}`)}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        }
      )
    ]);

    const bulkData = {
      invoices: invoicesResponse.data.QueryResponse?.Invoice || [],
      customers: customersResponse.data.QueryResponse?.Customer || [],
      items: itemsResponse.data.QueryResponse?.Item || [],
      payments: paymentsResponse.data.QueryResponse?.Payment || [],
      metadata: {
        fetchedAt: new Date().toISOString(),
        realmId: tokens.realmId,
        recordCounts: {
          invoices: invoicesResponse.data.QueryResponse?.Invoice?.length || 0,
          customers: customersResponse.data.QueryResponse?.Customer?.length || 0,
          items: itemsResponse.data.QueryResponse?.Item?.length || 0,
          payments: paymentsResponse.data.QueryResponse?.Payment?.length || 0
        }
      }
    };

    console.log('Bulk data fetched successfully:', bulkData.metadata.recordCounts);
    res.json(bulkData);
  } catch (error) {
    console.error('Bulk data fetch error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch bulk data' });
  }
});

// ===== AI ENDPOINTS (Ready for Vercel AI SDK Integration) =====

// Natural language query endpoint (placeholder for AI integration)
app.post('/api/ai/query', async (req, res) => {
  try {
    const { query, context } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Placeholder response - to be replaced with Vercel AI SDK implementation
    res.json({
      query: query,
      intent: 'invoice_analysis', // Will be determined by AI
      response: 'AI endpoint ready for Vercel AI SDK integration',
      suggestions: [
        'Show me invoices from last month',
        'Which customers have unpaid invoices?',
        'What\'s my total revenue this year?',
        'Create an invoice for customer X'
      ],
      aiReady: true,
      nextSteps: 'Integrate with Vercel AI SDK for natural language processing'
    });
  } catch (error) {
    console.error('AI query error:', error.message);
    res.status(500).json({ error: 'Failed to process AI query' });
  }
});

// Invoice analysis endpoint (placeholder for AI analysis)
app.post('/api/ai/analyze-invoice/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { analysisType = 'full' } = req.body;

    // Get invoice data first
    const accessToken = await getValidAccessToken();
    const tokens = tokenCache.get('quickbooks_tokens');

    const response = await axios.get(
      `${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/invoice/${id}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      }
    );

    const invoice = response.data.QueryResponse.Invoice[0];

    // Placeholder AI analysis - to be replaced with actual AI processing
    const analysis = {
      invoiceId: id,
      summary: `Invoice ${invoice.DocNumber} for ${invoice.CustomerRef.name}`,
      amount: invoice.TotalAmt,
      status: parseFloat(invoice.Balance) > 0 ? 'unpaid' : 'paid',
      daysOutstanding: invoice.DueDate ? 
        Math.ceil((new Date() - new Date(invoice.DueDate)) / (1000 * 60 * 60 * 24)) : 0,
      riskFactors: [],
      recommendations: [],
      aiInsights: 'AI analysis ready for implementation with Vercel AI SDK',
      rawData: invoice
    };

    // Add risk factors based on business logic
    if (parseFloat(invoice.Balance) > 0 && analysis.daysOutstanding > 30) {
      analysis.riskFactors.push('Overdue payment');
      analysis.recommendations.push('Send payment reminder');
    }

    if (parseFloat(invoice.TotalAmt) > 10000) {
      analysis.riskFactors.push('High-value invoice');
      analysis.recommendations.push('Follow up personally with customer');
    }

    res.json(analysis);
  } catch (error) {
    console.error('Invoice analysis error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to analyze invoice' });
  }
});

// AI Chat endpoint with actual AI and tool integration
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Check if user is authenticated with QuickBooks
    const tokens = tokenCache.get('quickbooks_tokens');
    if (!tokens) {
      return res.json({
        sessionId: sessionId || 'default',
        message: message,
        response: 'I need to connect to QuickBooks first to help you with invoice management. Please visit /auth/quickbooks to authenticate.',
        authRequired: true,
        authUrl: '/auth/quickbooks'
      });
    }

    console.log('Processing AI chat request:', { message, sessionId });

    // Use OpenAI with tools
    const result = await generateText({
      model: openai('gpt-4o-mini'),
      tools: invoiceTools,
      maxSteps: 5,
              messages: [
          {
            role: 'system',
            content: `You are an AI assistant for QuickBooks invoice management. You help users manage their invoices, customers, and business analytics through natural language.

Key capabilities:
- Get and search invoices
- Analyze invoice data and provide business insights
- Get customer information
- Retrieve company details
- Answer questions about business performance

CRITICAL RESPONSE RULES:
- When tools return a 'summary' field, use ONLY that summary text as your response
- NEVER generate your own detailed breakdown or formatting
- Use NO asterisks, dashes, bold, italic, underlines, emojis, or markdown
- Provide only 3-6 lines of plain conversational text
- Do NOT add headers, bullet points, or structured formatting
- Be natural and conversational, not formal or structured

Example: "Invoice #1037 for Sonnenschein Family Store is unpaid. Total amount: $362.07, Balance due: $362.07. Invoice date: 2025-06-05, Due date: 2025-07-05. Items include: Rock Fountain, Fountain Pump and 1 more items."

Current context: User is authenticated with QuickBooks and ready to use all features.`
          },
        {
          role: 'user',
          content: message
        }
      ]
    });

    console.log('AI response generated:', { 
      text: result.text.substring(0, 100) + '...', 
      toolCallCount: result.steps?.length || 0 
    });

    const response = {
      sessionId: sessionId || 'default',
      message: message,
      response: result.text,
      toolCalls: result.steps?.map(step => ({
        toolName: step.toolCalls?.[0]?.toolName,
        args: step.toolCalls?.[0]?.args,
        result: step.toolResults?.[0]?.result
      })).filter(Boolean) || [],
      timestamp: new Date().toISOString(),
      suggestions: [
        'Show me recent invoices',
        'What are my unpaid invoices?',
        'Analyze my revenue',
        'Get customer list',
        'Show overdue invoices'
      ]
    };

    res.json(response);
  } catch (error) {
    console.error('AI chat error:', error.message);
    
    // Handle specific AI SDK errors
    if (error.name === 'NoSuchToolError') {
      res.status(400).json({ error: 'Invalid tool request' });
    } else if (error.name === 'InvalidToolArgumentsError') {
      res.status(400).json({ error: 'Invalid tool arguments' });
    } else if (error.name === 'ToolExecutionError') {
      res.status(500).json({ error: 'Tool execution failed: ' + error.message });
    } else {
      res.status(500).json({ error: 'Failed to process chat message' });
    }
  }
});

// AI Chat streaming endpoint for real-time responses
app.post('/api/ai/chat/stream', async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Check if user is authenticated with QuickBooks
    const tokens = tokenCache.get('quickbooks_tokens');
    if (!tokens) {
      return res.json({
        sessionId: sessionId || 'default',
        message: message,
        response: 'I need to connect to QuickBooks first to help you with invoice management. Please visit /auth/quickbooks to authenticate.',
        authRequired: true,
        authUrl: '/auth/quickbooks'
      });
    }

    console.log('Processing streaming AI chat request:', { message, sessionId });

    // Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    try {
      // Use OpenAI with streaming
      const stream = streamText({
        model: openai('gpt-4o-mini'),
        tools: invoiceTools,
        maxSteps: 5,
        messages: [
          {
            role: 'system',
            content: `You are an AI assistant for QuickBooks invoice management. You help users manage their invoices, customers, and business analytics through natural language.

Key capabilities:
- Get and search invoices
- Analyze invoice data and provide business insights
- Get customer information
- Retrieve company details
- Answer questions about business performance

CRITICAL RESPONSE RULES:
- When tools return a 'summary' field, use ONLY that summary text as your response
- NEVER generate your own detailed breakdown or formatting
- Use NO asterisks, dashes, bold, italic, underlines, emojis, or markdown
- Provide only 3-6 lines of plain conversational text
- Do NOT add headers, bullet points, or structured formatting
- Be natural and conversational, not formal or structured

Example: "Invoice #1037 for Sonnenschein Family Store is unpaid. Total amount: $362.07, Balance due: $362.07. Invoice date: 2025-06-05, Due date: 2025-07-05. Items include: Rock Fountain, Fountain Pump and 1 more items."

Current context: User is authenticated with QuickBooks and ready to use all features.`
          },
          {
            role: 'user',
            content: message
          }
        ]
      });

      // Handle streaming response
      for await (const chunk of stream.textStream) {
        res.write(chunk);
      }

      res.end();
    } catch (streamError) {
      console.error('Streaming error:', streamError.message);
      res.write(`Error: ${streamError.message}`);
      res.end();
    }

  } catch (error) {
    console.error('AI streaming chat error:', error.message);
    res.status(500).json({ error: 'Failed to process streaming chat message' });
  }
});

// Get AI context data for better responses
app.get('/api/ai/context', async (req, res) => {
  try {
    const accessToken = await getValidAccessToken();
    const tokens = tokenCache.get('quickbooks_tokens');

    // Get summarized data for AI context
    const [recentInvoices, topCustomers, summaryStats] = await Promise.all([
      axios.get(
        `${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/query?query=${encodeURIComponent('SELECT * FROM Invoice ORDER BY TxnDate DESC MAXRESULTS 20')}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        }
      ),
      axios.get(
        `${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/query?query=${encodeURIComponent('SELECT * FROM Customer WHERE Active = true ORDER BY Name ASC MAXRESULTS 10')}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        }
      ),
      axios.get(
        `${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/query?query=${encodeURIComponent('SELECT COUNT(*) FROM Invoice')}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        }
      )
    ]);

    const context = {
      recentInvoices: recentInvoices.data.QueryResponse?.Invoice || [],
      topCustomers: topCustomers.data.QueryResponse?.Customer || [],
      totalInvoices: summaryStats.data.QueryResponse?.totalCount || 0,
      businessName: 'Your Business', // Will be replaced with actual company name
      currentDate: new Date().toISOString(),
      capabilities: [
        'Invoice management',
        'Customer analytics',
        'Payment tracking',
        'Business reporting',
        'Natural language queries'
      ]
    };

    res.json(context);
  } catch (error) {
    console.error('AI context error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch AI context' });
  }
});

// Disconnect QuickBooks
app.post('/auth/disconnect', (req, res) => {
  tokenCache.del('quickbooks_tokens');
  req.session.quickbooksConnected = false;
  req.session.realmId = null;
  res.json({ success: true, message: 'Disconnected from QuickBooks' });
});

// Enhanced status endpoint with token information
app.get('/api/status', (req, res) => {
  try {
    const tokens = tokenCache.get('quickbooks_tokens');
    const isConnected = !!tokens && req.session.quickbooksConnected;
    
    res.json({
      status: isConnected ? 'connected' : 'not_connected',
      message: isConnected ? 'QuickBooks is connected and ready' : 'Not connected to QuickBooks. Visit /auth/quickbooks to authenticate.',
      redirect_uri: QUICKBOOKS_CONFIG.redirectUri,
      tokens: {
        available: isConnected,
        message: isConnected ? 'Tokens are available and valid' : 'No valid tokens available. Visit /auth/quickbooks to authenticate.',
        info: tokens ? {
          realmId: tokens.realmId,
          expiresAt: tokens.expiresAt,
          expiresIn: tokens.expiresIn
        } : null
      },
      environment: QUICKBOOKS_CONFIG.environment
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// New endpoint to view detailed token information
app.get('/api/tokens', (req, res) => {
  try {
    const tokens = tokenCache.get('quickbooks_tokens');
    
    if (!tokens) {
      return res.status(404).json({
        success: false,
        error: 'No tokens found. Please authenticate first.'
      });
    }
    
    res.json({
      success: true,
      tokens: {
        accessToken: tokens.accessToken ? '✅ Stored' : '❌ Missing',
        refreshToken: tokens.refreshToken ? '✅ Stored' : '❌ Missing',
        realmId: tokens.realmId,
        expiresAt: tokens.expiresAt,
        expiresIn: tokens.expiresIn
      },
      storage: {
        type: 'In-memory cache',
        note: 'Tokens will be lost on server restart'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// New endpoint to test QBO connection
app.get('/api/test', async (req, res) => {
  try {
    const accessToken = await getValidAccessToken();
    const tokens = tokenCache.get('quickbooks_tokens');

    const response = await axios.get(
      `${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/companyinfo/${tokens.realmId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      }
    );

    res.json({
      success: true,
      connection: {
        status: 'connected',
        company: response.data.CompanyInfo.CompanyName,
        realmId: tokens.realmId,
        environment: QUICKBOOKS_CONFIG.environment
      },
      message: 'QBO connection test successful'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'QBO connection test failed'
    });
  }
});

// New endpoint to clear tokens (logout)
app.post('/auth/logout', (req, res) => {
  try {
    tokenCache.del('quickbooks_tokens');
    req.session.quickbooksConnected = false;
    req.session.realmId = null;
    
    res.json({
      success: true,
      message: 'Tokens cleared successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Logout failed'
    });
  }
});

// Utility function
function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Basic routes
app.get('/', (req, res) => {
  res.json({
    message: 'QuickBooks AI-Powered Invoice Management Backend',
    description: 'Complete QuickBooks integration with AI-ready endpoints for dual-panel interface',
    endpoints: {
      oauth: {
        connect: '/auth/quickbooks',
        callback: '/auth/callback',
        logout: 'POST /auth/logout'
      },
      quickbooks: {
        status: '/api/status',
        tokens: '/api/tokens',
        test: '/api/test',
        company: '/api/company',
        invoices: {
          list: 'GET /api/invoices',
          getById: 'GET /api/invoices/:id',
          search: 'POST /api/invoices/search',
          create: 'POST /api/invoices',
          update: 'PUT /api/invoices/:id',
          void: 'POST /api/invoices/:id/void',
          delete: 'DELETE /api/invoices/:id',
          sendEmail: 'POST /api/invoices/:id/send',
          downloadPdf: 'GET /api/invoices/:id/pdf'
        },
        customers: {
          list: 'GET /api/customers',
          getById: 'GET /api/customers/:id',
          create: 'POST /api/customers',
          update: 'PUT /api/customers/:id'
        },
        items: {
          list: 'GET /api/items',
          getById: 'GET /api/items/:id',
          create: 'POST /api/items'
        },
        payments: {
          list: 'GET /api/payments',
          getById: 'GET /api/payments/:id',
          create: 'POST /api/payments'
        }
      },
      analytics: {
        dashboard: '/api/dashboard/summary',
        invoices: '/api/analytics/invoices',
        customers: '/api/analytics/customers'
      },
      ai_ready: {
        bulkData: '/api/bulk/all-data',
        naturalLanguageQuery: '/api/ai/query (Coming Soon)',
        invoiceAnalysis: '/api/ai/analyze-invoice (Coming Soon)',
        chatInterface: '/api/ai/chat (Coming Soon)'
      }
    },
    architecture: {
      frontend: 'React dual-panel interface',
      ai: 'Vercel AI SDK integration',
      backend: 'Node.js + Express + QuickBooks API',
      features: ['Natural language queries', 'Invoice analysis', 'Real-time data', 'AI chat interface']
    },
    instructions: 'Visit /auth/quickbooks to start OAuth flow'
  });
});

app.get('/dashboard', (req, res) => {
  res.json({
    message: 'Dashboard endpoint',
    status: 'Connected to QuickBooks OAuth backend',
    nextSteps: 'Use the API endpoints to interact with QuickBooks'
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('QuickBooks OAuth endpoints:');
  console.log(`- Connect: http://localhost:${PORT}/auth/quickbooks`);
  console.log(`- Callback: http://localhost:${PORT}/auth/callback`);
}); 

// Add this new endpoint before the existing /invoice/:id endpoint (around line 1280)
app.get('/invoice/number/:docNumber', async (req, res) => {
  try {
    const { docNumber } = req.params;
    
    if (!docNumber) {
      return res.status(400).json({ error: 'DocNumber is required' });
    }

    const accessToken = await getValidAccessToken();
    const tokens = tokenCache.get('quickbooks_tokens');
    
    // Query invoice by DocNumber
    const query = `SELECT * FROM Invoice WHERE DocNumber = '${docNumber}' MAXRESULTS 1`;
    const response = await axios.get(`${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/query`, {
      params: { query },
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    const invoice = response.data.QueryResponse?.Invoice?.[0];
    
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found with that number' });
    }

    res.json({ QueryResponse: { Invoice: [invoice] } });
  } catch (error) {
    console.error('Error fetching invoice by number:', error);
    if (error.response?.status === 401) {
      res.status(401).json({ error: 'Invalid or expired access token' });
    } else {
      res.status(500).json({ error: 'Failed to fetch invoice by number' });
    }
  }
}); 