const axios = require('axios');
const { tool } = require('ai');
const { z } = require('zod');
const { makeInternalAPICall } = require('../services/quickbooks');

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
        const query = `SELECT * FROM Invoice WHERE DocNumber = '${invoiceNumber}' MAXRESULTS 1`;
        const result = await makeInternalAPICall(`/query?query=${encodeURIComponent(query)}`);
        const invoice = result.QueryResponse?.Invoice?.[0];
        
        if (!invoice) {
          return {
            success: false,
            error: `Invoice #${invoiceNumber} not found`
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
    description: 'Get a list of customers with optional filtering and sorting.',
    parameters: z.object({
      limit: z.number().optional().describe('Maximum number of customers to return (default: 20)'),
      active: z.boolean().optional().describe('Filter by active status (default: true)'),
    }),
    execute: async ({ limit = 20, active = true }) => {
      try {
        let query = 'SELECT * FROM Customer';
        
        if (active !== undefined) {
          query += ` WHERE Active = ${active}`;
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
  }),

  deleteInvoice: tool({
    description: 'Delete or void one or more invoices by their ID or invoice number. When users say "delete", "remove", "erase" or similar words, PERMANENTLY DELETE the invoice (completely removes from QuickBooks). Only VOID (mark as $0) when specifically asked to "void". Both operations can only be performed on invoices with NO payments applied.',
    parameters: z.object({
      invoices: z.array(z.object({
        id: z.string().optional().describe('The QuickBooks ID of the invoice to delete/void'),
        number: z.string().optional().describe('The invoice number (DocNumber) to delete/void')
      })).describe('Array of invoices to delete/void, identified by either ID or number'),
      operation: z.enum(['delete', 'void']).optional().describe('Whether to permanently DELETE (completely remove) or VOID (mark as $0) the invoice. Defaults to DELETE unless specifically asked to void.'),
    }),
    execute: async ({ invoices, operation = 'delete' }) => {
      console.log('🔥 DELETE/VOID INVOICE TOOL STARTED');
      console.log('📋 Input invoices array:', JSON.stringify(invoices, null, 2));
      console.log('🔧 Operation type:', operation.toUpperCase());
      
      try {
        const results = [];
        
        for (const invoice of invoices) {
          console.log(`\n🔍 Processing invoice:`, JSON.stringify(invoice, null, 2));
          
          try {
            let invoiceId = invoice.id;
            console.log(`📝 Initial invoiceId: ${invoiceId}`);
            
            // If only number provided, find the invoice ID
            if (!invoiceId && invoice.number) {
              console.log(`🔎 Searching for invoice number: ${invoice.number}`);
              const query = `SELECT * FROM Invoice WHERE DocNumber = '${invoice.number}' MAXRESULTS 1`;
              console.log(`📄 Search query: ${query}`);
              
              const searchResult = await makeInternalAPICall(`/query?query=${encodeURIComponent(query)}`);
              console.log(`🔍 Search result:`, JSON.stringify(searchResult, null, 2));
              
              const foundInvoice = searchResult.QueryResponse?.Invoice?.[0];
              console.log(`📋 Found invoice:`, foundInvoice ? `ID ${foundInvoice.Id}` : 'NOT FOUND');
              
              if (!foundInvoice) {
                console.log(`❌ Invoice ${invoice.number} not found in search results`);
                results.push({
                  identifier: invoice.number,
                  success: false,
                  error: `Invoice number ${invoice.number} not found`
                });
                continue;
              }
              
              invoiceId = foundInvoice.Id;
              console.log(`✅ Resolved invoice ID: ${invoiceId} for number ${invoice.number}`);
            }
            
            if (!invoiceId) {
              console.log(`❌ No invoice ID available for processing`);
              results.push({
                identifier: invoice.number || invoice.id || 'unknown',
                success: false,
                error: 'No invoice ID or number provided'
              });
              continue;
            }
            
            // Call our Express server endpoint which has proper validation
            const endpoint = operation === 'delete' 
              ? `http://localhost:3000/api/invoices/${invoiceId}/permanent-delete`
              : `http://localhost:3000/api/invoices/${invoiceId}`;
            
            console.log(`🚀 Attempting to ${operation} invoice ID: ${invoiceId}`);
            console.log(`📡 Making DELETE request to: ${endpoint}`);
            
            const deleteResponse = await axios.delete(endpoint);
            console.log(`✅ ${operation.toUpperCase()} successful! Response:`, JSON.stringify(deleteResponse.data, null, 2));
            
            results.push({
              identifier: invoice.number || invoiceId,
              success: true,
              message: deleteResponse.data.message || `Invoice ${invoice.number || invoiceId} ${operation === 'delete' ? 'permanently deleted' : 'voided'} successfully`,
              invoiceId: invoiceId
            });
            
          } catch (error) {
            console.log(`❌ Error occurred during delete:`, error.message);
            console.log(`🔍 Error response status:`, error.response?.status);
            console.log(`🔍 Error response data:`, JSON.stringify(error.response?.data, null, 2));
            console.log(`🔍 Full error object:`, error);
            
            let errorMessage = `Failed to void invoice: ${error.message}`;
            
            // Handle specific errors from our Express server endpoint
            if (error.response?.data?.error) {
              errorMessage = error.response.data.error;
              console.log(`📝 Using server error message: ${errorMessage}`);
              
              // Add more context for common errors
              if (errorMessage.includes('Cannot void invoice that has payments applied')) {
                errorMessage = `Invoice ${invoice.number || invoiceId} cannot be ${operation}d - it has payments applied. Only fully unpaid invoices can be ${operation}d.`;
                console.log(`📝 Enhanced error message: ${errorMessage}`);
              } else if (errorMessage.includes('Invoice not found')) {
                errorMessage = `Invoice ${invoice.number || invoiceId} not found.`;
                console.log(`📝 Enhanced error message: ${errorMessage}`);
              }
            } else if (error.response?.status === 400) {
              errorMessage = `Invoice ${invoice.number || invoiceId} cannot be ${operation}d due to business rules (may have payments applied).`;
              console.log(`📝 Status 400 error message: ${errorMessage}`);
            } else if (error.response?.status === 404) {
              errorMessage = `Invoice ${invoice.number || invoiceId} not found.`;
              console.log(`📝 Status 404 error message: ${errorMessage}`);
            }
            
            console.log(`📋 Final error message: ${errorMessage}`);
            
            results.push({
              identifier: invoice.number || invoice.id || 'unknown',
              success: false,
              error: errorMessage
            });
          }
        }
        
        const successCount = results.filter(r => r.success).length;
        const failureCount = results.filter(r => !r.success).length;
        
        console.log(`\n📊 DELETE TOOL SUMMARY:`);
        console.log(`✅ Successful: ${successCount}`);
        console.log(`❌ Failed: ${failureCount}`);
        console.log(`📋 All results:`, JSON.stringify(results, null, 2));
        
        const operationText = operation === 'delete' ? 'deleted' : 'voided';
        const finalResult = {
          success: successCount > 0,
          totalProcessed: results.length,
          successCount,
          failureCount,
          results: results,
          summary: failureCount === 0 
            ? `Successfully ${operationText} ${successCount} invoice${successCount !== 1 ? 's' : ''}`
            : `${operationText.charAt(0).toUpperCase() + operationText.slice(1)} ${successCount} invoices, ${failureCount} failed`
        };
        
        console.log(`🎯 Final tool result:`, JSON.stringify(finalResult, null, 2));
        return finalResult;
        
      } catch (error) {
        console.log(`💥 FATAL ERROR in deleteInvoice tool:`, error.message);
        console.log(`🔍 Error stack:`, error.stack);
        
        return {
          success: false,
          error: 'Failed to process invoice deletion: ' + error.message
        };
      }
    },
  }),

  openInvoiceSlider: tool({
    description: 'Open the invoice slider view to display all invoices. Use this when users ask to "show all invoices", "display invoices", or want to see a list/overview of invoices.',
    parameters: z.object({
      filter: z.enum(['all', 'paid', 'unpaid', 'overdue']).optional().describe('Optional filter to apply to the invoice view'),
      limit: z.number().optional().describe('Maximum number of invoices to return (default: 50)')
    }),
    execute: async ({ filter = 'all', limit = 50 }) => {
      try {
        // Fetch invoice data to display in the slider
        let query = 'SELECT * FROM Invoice';
        const conditions = [];
        
        // Apply filter conditions
        if (filter === 'paid') {
          conditions.push('Balance = 0');
        } else if (filter === 'unpaid') {
          conditions.push('Balance > 0');
        } else if (filter === 'overdue') {
          conditions.push('Balance > 0 AND DueDate < TODAY()');
        }
        
        if (conditions.length > 0) {
          query += ' WHERE ' + conditions.join(' AND ');
        }
        
        query += ` ORDER BY DocNumber ASC MAXRESULTS ${limit}`;
        
        const result = await makeInternalAPICall(`/query?query=${encodeURIComponent(query)}`);
        const invoices = result.QueryResponse?.Invoice || [];
        
        return {
          success: true,
          action: 'openInvoiceSlider',
          filter: filter,
          count: invoices.length,
          invoices: invoices, // Return full invoice data for frontend
          message: `Showing ${invoices.length} ${filter === 'all' ? '' : filter} invoices in the slider view`
        };
        
      } catch (error) {
        return {
          success: false,
          error: 'Failed to load invoices: ' + error.message
        };
      }
    },
  })
};

module.exports = { invoiceTools }; 