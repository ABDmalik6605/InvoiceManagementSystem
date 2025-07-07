const { tokenCache } = require('../config/cache');
const { makeInternalAPICall } = require('./quickbooks');

// QuickBooks Email Service using direct API calls
class QuickBooksEmailService {
  constructor() {
    // No initialization needed - using direct API calls
  }

  // Check if QuickBooks is configured and accessible
  async isConfigured() {
    try {
      const tokens = tokenCache.get('quickbooks_tokens');
      return !!tokens;
    } catch (error) {
      return false;
    }
  }

  // Send invoice PDF email using QuickBooks direct API
  async sendInvoicePdf(invoiceId, emailAddress, subject = null) {
    try {
      console.log(`📧 Sending invoice PDF via QuickBooks API: Invoice ID ${invoiceId} to ${emailAddress}`);

      // Validate email address format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailAddress)) {
        throw new Error(`Invalid email address format: ${emailAddress}`);
      }

      // QuickBooks Online API endpoint for sending invoice PDFs
      // The correct format uses query parameters, not request body
      const endpoint = `/invoice/${invoiceId}/send?sendTo=${encodeURIComponent(emailAddress)}`;
      
      console.log(`📧 Using QuickBooks send endpoint: ${endpoint}`);

      // Make the API call - use POST with no body, email is in query parameter
      const result = await makeInternalAPICall(endpoint, 'POST', null);

      console.log('📧 QuickBooks send invoice response:', JSON.stringify(result, null, 2));

      return {
        success: true,
        message: `Invoice PDF sent successfully to ${emailAddress}`,
        result: result
      };

    } catch (error) {
      console.error('📧 QuickBooks email failed:', error.message);
      console.error('📧 Full error:', error);
      
      return {
        success: false,
        message: `Failed to send invoice PDF: ${error.message}`,
        error: error.message
      };
    }
  }

  // Send to multiple recipients
  async sendInvoicePdfToMultiple(invoiceId, emailAddresses, subject = null) {
    const results = [];
    
    for (const email of emailAddresses) {
      const result = await this.sendInvoicePdf(invoiceId, email, subject);
      results.push({
        email,
        ...result
      });
    }

    return results;
  }

  // Send multiple invoice PDFs
  async sendMultipleInvoicePdfs(invoicesWithEmails) {
    const results = [];
    
    for (const { invoiceId, email, subject } of invoicesWithEmails) {
      console.log(`📧 Processing invoice ${invoiceId} for ${email}`);
      const result = await this.sendInvoicePdf(invoiceId, email, subject);
      
      results.push({
        invoiceId: invoiceId,
        email: email,
        subject: subject,
        success: result.success,
        message: result.message,
        result: result.result,
        error: result.success ? null : result.error
      });
    }
    
    return results;
  }

  // Get invoice data for email validation
  async getInvoiceData(invoiceId) {
    try {
      const result = await makeInternalAPICall(`/invoice/${invoiceId}`);
      return result.QueryResponse?.Invoice?.[0] || result.Invoice;
    } catch (error) {
      throw new Error(`Failed to get invoice: ${error.message}`);
    }
  }

  // Get customer data including email address
  async getCustomerEmail(customerId) {
    try {
      const result = await makeInternalAPICall(`/customer/${customerId}`);
      const customer = result.QueryResponse?.Customer?.[0] || result.Customer;
      return customer?.PrimaryEmailAddr?.Address;
    } catch (error) {
      throw new Error(`Failed to get customer: ${error.message}`);
    }
  }

  // Validate email address format
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // Get invoice customer email automatically
  async getInvoiceCustomerEmail(invoiceId) {
    try {
      const invoice = await this.getInvoiceData(invoiceId);
      if (!invoice) {
        throw new Error('Invoice not found');
      }

      const customerId = invoice.CustomerRef?.value;
      if (!customerId) {
        throw new Error('Invoice has no associated customer');
      }

      const customerEmail = await this.getCustomerEmail(customerId);
      if (!customerEmail) {
        throw new Error('Customer has no email address');
      }

      return {
        invoice: invoice,
        customerEmail: customerEmail,
        customerName: invoice.CustomerRef?.name || 'Unknown'
      };
    } catch (error) {
      throw error;
    }
  }
}

module.exports = QuickBooksEmailService; 