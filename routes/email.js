const express = require('express');
const QuickBooksEmailService = require('../services/email');
const { makeInternalAPICall } = require('../services/quickbooks');

const router = express.Router();
const emailService = new QuickBooksEmailService();

// Send invoice PDF email using QuickBooks direct API
router.post('/send-invoice', async (req, res) => {
  try {
    console.log('📧 QuickBooks PDF email request received:', req.body);
    
    const { invoiceId, invoiceNumber, customerEmail, subject } = req.body;
    
    // Validate input
    if (!invoiceId && !invoiceNumber) {
      return res.status(400).json({ 
        success: false, 
        error: 'Either invoiceId or invoiceNumber is required' 
      });
    }

    // Check if QuickBooks is configured
    if (!(await emailService.isConfigured())) {
      return res.status(500).json({
        success: false,
        error: 'QuickBooks not authenticated. Please connect to QuickBooks first.'
      });
    }

    // Get invoice ID if only number provided
    let finalInvoiceId = invoiceId;
    if (!finalInvoiceId && invoiceNumber) {
      console.log(`🔍 Looking up invoice by number: ${invoiceNumber}`);
      const query = `SELECT * FROM Invoice WHERE DocNumber = '${invoiceNumber}' MAXRESULTS 1`;
      const result = await makeInternalAPICall(`/query?query=${encodeURIComponent(query)}`);
      const invoice = result.QueryResponse?.Invoice?.[0];
      
      if (!invoice) {
        return res.status(404).json({
          success: false,
          error: `Invoice ${invoiceNumber} not found`
        });
      }
      finalInvoiceId = invoice.Id;
      console.log(`✅ Found invoice ID: ${finalInvoiceId} for number ${invoiceNumber}`);
    }

    // Get customer email if not provided
    let finalEmail = customerEmail;
    if (!finalEmail) {
      console.log(`📧 No email provided, trying to get customer email for invoice ${finalInvoiceId}`);
      try {
        const emailInfo = await emailService.getInvoiceCustomerEmail(finalInvoiceId);
        finalEmail = emailInfo.customerEmail;
        console.log(`✅ Found customer email: ${finalEmail} for ${emailInfo.customerName}`);
      } catch (error) {
        return res.status(400).json({
          success: false,
          error: `Customer email address is required. ${error.message}`
        });
      }
    }

    // Validate email format
    if (!emailService.isValidEmail(finalEmail)) {
      return res.status(400).json({
        success: false,
        error: `Invalid email format: ${finalEmail}`
      });
    }

    // Create subject if not provided
    const finalSubject = subject || `Invoice ${invoiceNumber || finalInvoiceId}`;

    // Send PDF email via QuickBooks API
    console.log(`📤 Sending invoice ${finalInvoiceId} to ${finalEmail} with subject "${finalSubject}"`);
    const result = await emailService.sendInvoicePdf(finalInvoiceId, finalEmail, finalSubject);
    
    if (result.success) {
      console.log('✅ QuickBooks PDF email sent successfully:', result);
      
      res.json({
        success: true,
        message: `Invoice PDF emailed successfully to ${finalEmail}`,
        details: {
          invoiceId: finalInvoiceId,
          invoiceNumber: invoiceNumber,
          customerEmail: finalEmail,
          subject: finalSubject,
          result: result.result
        }
      });
    } else {
      console.error('❌ QuickBooks PDF email failed:', result.message);
      return res.status(500).json({
        success: false,
        error: `Failed to send invoice PDF: ${result.message}`,
        details: result.message
      });
    }

  } catch (error) {
    console.error('❌ QuickBooks PDF email failed:', error);
    res.status(500).json({
      success: false,
      error: `Failed to send invoice PDF: ${error.message}`,
      details: error.message
    });
  }
});

// Send multiple invoice PDFs using QuickBooks API
router.post('/send-multiple-invoices', async (req, res) => {
  try {
    console.log('📧 Multiple QuickBooks PDF email request received:', req.body);
    
    const { invoices, defaultSubject } = req.body;
    
    if (!invoices || !Array.isArray(invoices) || invoices.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invoices array is required and must contain at least one invoice'
      });
    }

    // Check if QuickBooks is configured
    if (!(await emailService.isConfigured())) {
      return res.status(500).json({
        success: false,
        error: 'QuickBooks not authenticated. Please connect to QuickBooks first.'
      });
    }

    const invoicesWithEmails = [];
    const errors = [];

    // Process each invoice and resolve IDs/emails
    for (const item of invoices) {
      try {
        const { invoiceId, invoiceNumber, customerEmail, subject } = item;

        // Get invoice ID if only number provided
        let finalInvoiceId = invoiceId;
        let finalInvoiceNumber = invoiceNumber;
        
        if (!finalInvoiceId && invoiceNumber) {
          console.log(`🔍 Looking up invoice by number: ${invoiceNumber}`);
          const query = `SELECT * FROM Invoice WHERE DocNumber = '${invoiceNumber}' MAXRESULTS 1`;
          const result = await makeInternalAPICall(`/query?query=${encodeURIComponent(query)}`);
          const invoice = result.QueryResponse?.Invoice?.[0];
          
          if (!invoice) {
            errors.push({
              invoice: invoiceNumber,
              error: 'Invoice not found'
            });
            continue;
          }
          finalInvoiceId = invoice.Id;
          finalInvoiceNumber = invoice.DocNumber;
        }

        // Get customer email if not provided
        let finalEmail = customerEmail;
        if (!finalEmail) {
          try {
            const emailInfo = await emailService.getInvoiceCustomerEmail(finalInvoiceId);
            finalEmail = emailInfo.customerEmail;
            console.log(`✅ Found customer email: ${finalEmail} for invoice ${finalInvoiceNumber}`);
          } catch (error) {
            errors.push({
              invoice: finalInvoiceNumber || finalInvoiceId,
              error: `No customer email found: ${error.message}`
            });
            continue;
          }
        }

        // Validate email format
        if (!emailService.isValidEmail(finalEmail)) {
          errors.push({
            invoice: finalInvoiceNumber || finalInvoiceId,
            error: `Invalid email format: ${finalEmail}`
          });
          continue;
        }

        invoicesWithEmails.push({
          invoiceId: finalInvoiceId,
          email: finalEmail,
          subject: subject || defaultSubject || `Invoice ${finalInvoiceNumber || finalInvoiceId}`
        });

      } catch (error) {
        errors.push({
          invoice: item.invoiceNumber || item.invoiceId,
          error: error.message
        });
      }
    }

    if (invoicesWithEmails.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid invoices to email',
        errors: errors
      });
    }

    // Send PDFs via QuickBooks API
    console.log(`📤 Sending ${invoicesWithEmails.length} invoice PDFs via QuickBooks API`);
    const emailResults = await emailService.sendMultipleInvoicePdfs(invoicesWithEmails);
    
    const successCount = emailResults.filter(r => r.success).length;
    const failureCount = emailResults.filter(r => !r.success).length;
    
    console.log('📊 QuickBooks PDF email batch results:', {
      total: emailResults.length,
      successful: successCount,
      failed: failureCount
    });

    res.json({
      success: successCount > 0,
      message: `QuickBooks PDF email batch completed: ${successCount} successful, ${failureCount + errors.length} failed`,
      results: emailResults,
      errors: errors,
      summary: {
        total: invoices.length,
        successful: successCount,
        failed: failureCount + errors.length
      }
    });

  } catch (error) {
    console.error('❌ QuickBooks batch PDF email failed:', error);
    res.status(500).json({
      success: false,
      error: `Failed to send batch PDF emails: ${error.message}`,
      details: error.message
    });
  }
});

// Test QuickBooks email configuration
router.get('/test-config', async (req, res) => {
  try {
    const isConfigured = await emailService.isConfigured();
    
    res.json({
      configured: isConfigured,
      message: isConfigured 
        ? 'QuickBooks email service is ready - using direct API calls' 
        : 'QuickBooks not authenticated. Please connect to QuickBooks first.',
      method: 'QuickBooks Direct API',
      endpoint: 'POST /v3/company/{realmId}/invoice/{invoiceId}/send',
      features: [
        'Native QuickBooks PDF generation',
        'Direct API integration',
        'Automatic customer email lookup',
        'Consistent with other QB operations',
        'No external dependencies'
      ]
    });
  } catch (error) {
    res.status(500).json({
      configured: false,
      error: error.message
    });
  }
});

module.exports = router; 