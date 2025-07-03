const express = require('express');
const axios = require('axios');
const { tokenCache } = require('../config/cache');
const { QUICKBOOKS_CONFIG } = require('../config/quickbooks');
const { getValidAccessToken } = require('../utils/tokens');

const router = express.Router();

// Get connection status
router.get('/status', async (req, res) => {
  try {
    const tokens = tokenCache.get('quickbooks_tokens');
    
    if (!tokens) {
      return res.json({
        status: 'not_connected',
        message: 'Not connected to QuickBooks. Visit /auth/quickbooks to authenticate.',
        redirect_uri: `${QUICKBOOKS_CONFIG.redirectUri}`,
        tokens: {
          message: 'No valid tokens available. Visit /auth/quickbooks to authenticate.',
          info: ''
        }
      });
    }

    const accessToken = await getValidAccessToken();
    
    res.json({
      status: 'connected',
      message: 'Connected to QuickBooks',
      realmId: tokens.realmId,
      expiresAt: new Date(tokens.expiresAt).toISOString(),
      tokens: {
        message: 'Valid tokens available',
        info: 'Access token and refresh token are valid'
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error checking QuickBooks connection',
      error: error.message
    });
  }
});

// Get company info
router.get('/company', async (req, res) => {
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

// Get invoices
router.get('/invoices', async (req, res) => {
  try {
    const accessToken = await getValidAccessToken();
    const tokens = tokenCache.get('quickbooks_tokens');
    const { limit = 20, status, customer, minAmount, maxAmount } = req.query;

    let query = 'SELECT * FROM Invoice';
    const conditions = [];
    
    if (status) {
      if (status.toLowerCase() === 'paid') {
        conditions.push('Balance = 0');
      } else if (status.toLowerCase() === 'unpaid') {
        conditions.push('Balance > 0');
      }
    }
    
    if (customer) {
      conditions.push(`CustomerRef = '${customer}'`);
    }
    
    if (minAmount) {
      conditions.push(`TotalAmt >= ${minAmount}`);
    }
    
    if (maxAmount) {
      conditions.push(`TotalAmt <= ${maxAmount}`);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ` ORDER BY DocNumber ASC MAXRESULTS ${limit}`;

    console.log('Executing query:', query);

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
router.get('/invoices/:id', async (req, res) => {
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
    if (error.response?.status === 404) {
      res.status(404).json({ error: 'Invoice not found' });
    } else {
      res.status(500).json({ error: 'Failed to fetch invoice' });
    }
  }
});

// Get invoice by number
router.get('/invoice/number/:docNumber', async (req, res) => {
  try {
    const accessToken = await getValidAccessToken();
    const tokens = tokenCache.get('quickbooks_tokens');
    const { docNumber } = req.params;

    const query = `SELECT * FROM Invoice WHERE DocNumber = '${docNumber}' MAXRESULTS 1`;
    console.log('Executing query:', query);

    const response = await axios.get(
      `${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/query?query=${encodeURIComponent(query)}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      }
    );

    const invoice = response.data.QueryResponse?.Invoice?.[0];
    if (!invoice) {
      return res.status(404).json({ error: `Invoice with number ${docNumber} not found` });
    }

    res.json({ QueryResponse: { Invoice: [invoice] } });
  } catch (error) {
    console.error('Get invoice by number error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

// Query endpoint for flexible SQL-like queries
router.get('/query', async (req, res) => {
  try {
    const accessToken = await getValidAccessToken();
    const tokens = tokenCache.get('quickbooks_tokens');
    const { query } = req.query;

    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    console.log('Executing custom query:', query);

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
    console.error('Query error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to execute query' });
  }
});

// Create customer
router.post('/customer', async (req, res) => {
  try {
    console.log('🔨 Creating customer with data:', JSON.stringify(req.body, null, 2));
    
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

    console.log('✅ Customer created:', response.data);
    res.json(response.data);
  } catch (error) {
    console.error('❌ Create customer error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to create customer',
      details: error.response?.data || error.message 
    });
  }
});

// Create invoice
router.post('/invoice', async (req, res) => {
  try {
    const accessToken = await getValidAccessToken();
    const tokens = tokenCache.get('quickbooks_tokens');

    console.log('Creating invoice with data:', JSON.stringify(req.body, null, 2));

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

    console.log('Invoice created:', response.data);
    res.json(response.data);
  } catch (error) {
    console.error('Create invoice error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

// Update invoice (PUT endpoint that converts to POST for QuickBooks)
router.put('/invoice/:id', async (req, res) => {
  try {
    console.log('🔄 PUT invoice update received for ID:', req.params.id);
    console.log('🔄 Update data:', JSON.stringify(req.body, null, 2));
    
    const accessToken = await getValidAccessToken();
    const tokens = tokenCache.get('quickbooks_tokens');

    // QuickBooks requires POST for updates, not PUT
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

    console.log('✅ Invoice updated successfully:', response.data);
    res.json(response.data);
  } catch (error) {
    console.error('❌ Update invoice error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to update invoice',
      details: error.response?.data || error.message 
    });
  }
});


// Delete invoice (void)
router.delete('/invoices/:id', async (req, res) => {
  console.log(`\n🔥 EXPRESS DELETE ENDPOINT CALLED`);
  console.log(`📝 Invoice ID parameter: ${req.params.id}`);
  
  try {
    console.log(`🔐 Getting access token...`);
    const accessToken = await getValidAccessToken();
    console.log(`🎫 Access token obtained: ${accessToken ? 'YES' : 'NO'}`);
    
    const tokens = tokenCache.get('quickbooks_tokens');
    console.log(`💾 Tokens from cache:`, tokens ? 'PRESENT' : 'NOT FOUND');
    
    const { id } = req.params;
    console.log(`🔍 Processing invoice ID: ${id}`);

    // First, get the current invoice to retrieve SyncToken
    console.log(`📡 Making GET request to QuickBooks for invoice ${id}`);
    console.log(`🌐 URL: ${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/invoice/${id}`);
    
    const getResponse = await axios.get(
      `${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/invoice/${id}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      }
    );

    console.log(`📋 Get invoice response status: ${getResponse.status}`);
    console.log(`📋 Get invoice response data:`, JSON.stringify(getResponse.data, null, 2));

    const invoice = getResponse.data.QueryResponse?.Invoice?.[0] || getResponse.data.Invoice;
    console.log(`🔍 Found invoice:`, invoice ? `YES (ID: ${invoice.Id})` : 'NO');
    
    if (!invoice) {
      console.log(`❌ Invoice ${id} not found in QuickBooks`);
      return res.status(404).json({ error: 'Invoice not found' });
    }

    console.log(`💰 Invoice balance: ${invoice.Balance}, Total: ${invoice.TotalAmt}`);
    
    // Check if invoice can be voided (balance should equal total amount - no payments)
    if (parseFloat(invoice.Balance || 0) !== parseFloat(invoice.TotalAmt || 0)) {
      console.log(`❌ Invoice has payments applied - cannot void`);
      return res.status(400).json({ 
        error: 'Cannot void invoice that has payments applied. Only fully unpaid invoices can be voided.',
        details: {
          totalAmount: invoice.TotalAmt,
          balance: invoice.Balance,
          status: 'partially_paid'
        }
      });
    }

    // Now void the invoice
    console.log(`🚀 Attempting to void invoice ${id} with SyncToken: ${invoice.SyncToken}`);
    console.log(`🌐 Void URL: ${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/invoice?operation=void`);
    console.log(`📤 Void payload:`, JSON.stringify({ Id: id, SyncToken: invoice.SyncToken }, null, 2));
    
    const voidResponse = await axios.post(
      `${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/invoice?operation=void`,
      {
        Id: id,
        SyncToken: invoice.SyncToken
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );

    console.log(`✅ Void response status: ${voidResponse.status}`);
    console.log(`✅ Void response data:`, JSON.stringify(voidResponse.data, null, 2));

    console.log('Invoice voided:', {
      invoiceId: id,
      docNumber: invoice.DocNumber,
      syncToken: invoice.SyncToken
    });

    const successResponse = { 
      success: true, 
      message: `Invoice #${invoice.DocNumber} voided successfully`,
      voidedInvoice: voidResponse.data.QueryResponse?.Invoice?.[0]
    };
    
    console.log(`📤 Sending success response:`, JSON.stringify(successResponse, null, 2));
    res.json(successResponse);

  } catch (error) {
    console.log(`💥 EXPRESS DELETE ERROR occurred:`);
    console.log(`🔍 Error message:`, error.message);
    console.log(`🔍 Error response status:`, error.response?.status);
    console.log(`🔍 Error response data:`, JSON.stringify(error.response?.data, null, 2));
    console.log(`🔍 Full error:`, error);

    // Extract detailed error information
    let errorResponse = {
      error: 'Failed to void invoice',
      details: error.message
    };

    if (error.response?.data?.Fault) {
      const fault = error.response.data.Fault;
      console.log('Delete invoice error:', error.response.data);
      console.log('QuickBooks Fault Details:', {
        type: fault.type,
        code: fault.Error?.[0]?.code,
        detail: fault.Error?.[0]?.Detail,
        element: fault.Error?.[0]?.element
      });

      errorResponse = {
        error: 'QuickBooks validation error',
        details: {
          type: fault.type,
          code: fault.Error?.[0]?.code,
          message: fault.Error?.[0]?.Message || fault.Error?.[0]?.Detail,
          element: fault.Error?.[0]?.element
        }
      };
    }

    console.log(`📤 Sending error response:`, JSON.stringify(errorResponse, null, 2));
    res.status(400).json(errorResponse);
  }
});

// Permanent delete invoice
router.delete('/invoices/:id/permanent-delete', async (req, res) => {
  console.log(`\n🔥 EXPRESS PERMANENT DELETE ENDPOINT CALLED`);
  console.log(`📝 Invoice ID parameter: ${req.params.id}`);
  
  try {
    console.log(`🔐 Getting access token...`);
    const accessToken = await getValidAccessToken();
    console.log(`🎫 Access token obtained: ${accessToken ? 'YES' : 'NO'}`);
    
    const tokens = tokenCache.get('quickbooks_tokens');
    console.log(`💾 Tokens from cache:`, tokens ? 'PRESENT' : 'NOT FOUND');
    
    const { id } = req.params;
    console.log(`🔍 Processing invoice ID: ${id}`);

    // First, get the current invoice to retrieve SyncToken
    console.log(`📡 Making GET request to QuickBooks for invoice ${id}`);
    console.log(`🌐 URL: ${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/invoice/${id}`);
    
    const getResponse = await axios.get(
      `${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/invoice/${id}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      }
    );

    console.log(`📋 Get invoice response status: ${getResponse.status}`);
    console.log(`📋 Get invoice response data:`, JSON.stringify(getResponse.data, null, 2));

    const invoice = getResponse.data.QueryResponse?.Invoice?.[0] || getResponse.data.Invoice;
    console.log(`🔍 Found invoice:`, invoice ? `YES (ID: ${invoice.Id})` : 'NO');
    
    if (!invoice) {
      console.log(`❌ Invoice ${id} not found in QuickBooks`);
      return res.status(404).json({ error: 'Invoice not found' });
    }

    console.log(`💰 Invoice balance: ${invoice.Balance}, Total: ${invoice.TotalAmt}`);
    
    // Check if invoice can be deleted (same rules as voiding - no payments)
    if (parseFloat(invoice.Balance || 0) !== parseFloat(invoice.TotalAmt || 0)) {
      console.log(`❌ Invoice has payments applied - cannot delete`);
      return res.status(400).json({ 
        error: 'Cannot permanently delete invoice that has payments applied. Only fully unpaid invoices can be deleted.',
        details: {
          totalAmount: invoice.TotalAmt,
          balance: invoice.Balance,
          status: 'partially_paid'
        }
      });
    }

    // Now permanently delete the invoice using QuickBooks DELETE operation
    console.log(`🚀 Attempting to permanently delete invoice ${id}`);
    console.log(`🌐 Delete URL: ${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/invoice?operation=delete`);
    console.log(`📤 Delete payload:`, JSON.stringify({ Id: id, SyncToken: invoice.SyncToken }, null, 2));
    
    const deleteResponse = await axios.post(
      `${QUICKBOOKS_CONFIG.baseUrl}/v3/company/${tokens.realmId}/invoice?operation=delete`,
      {
        Id: id,
        SyncToken: invoice.SyncToken
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );

    console.log(`✅ Delete response status: ${deleteResponse.status}`);
    console.log(`✅ Delete response data:`, JSON.stringify(deleteResponse.data, null, 2));

    console.log('Invoice permanently deleted:', {
      invoiceId: id,
      docNumber: invoice.DocNumber,
      syncToken: invoice.SyncToken
    });

    const successResponse = { 
      success: true, 
      message: `Invoice #${invoice.DocNumber} permanently deleted from QuickBooks`,
      deletedInvoice: deleteResponse.data.QueryResponse?.Invoice?.[0]
    };
    
    console.log(`📤 Sending success response:`, JSON.stringify(successResponse, null, 2));
    res.json(successResponse);

  } catch (error) {
    console.log(`💥 EXPRESS PERMANENT DELETE ERROR occurred:`);
    console.log(`🔍 Error message:`, error.message);
    console.log(`🔍 Error response status:`, error.response?.status);
    console.log(`🔍 Error response data:`, JSON.stringify(error.response?.data, null, 2));
    console.log(`🔍 Full error:`, error);

    // Extract detailed error information
    let errorResponse = {
      error: 'Failed to permanently delete invoice',
      details: error.message
    };

    if (error.response?.data?.Fault) {
      const fault = error.response.data.Fault;
      console.log('Delete invoice error:', error.response.data);
      console.log('QuickBooks Fault Details:', {
        type: fault.type,
        code: fault.Error?.[0]?.code,
        detail: fault.Error?.[0]?.Detail,
        element: fault.Error?.[0]?.element
      });

      errorResponse = {
        error: 'QuickBooks validation error',
        details: {
          type: fault.type,
          code: fault.Error?.[0]?.code,
          message: fault.Error?.[0]?.Message || fault.Error?.[0]?.Detail,
          element: fault.Error?.[0]?.element
        }
      };
    }

    console.log(`📤 Sending error response:`, JSON.stringify(errorResponse, null, 2));
    res.status(400).json(errorResponse);
  }
});

module.exports = router; 