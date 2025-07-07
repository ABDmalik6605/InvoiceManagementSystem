const express = require('express');
const { generateText, streamText } = require('ai');
const { openai } = require('@ai-sdk/openai');
const { tokenCache } = require('../config/cache');
const { invoiceTools } = require('../ai/tools');

const router = express.Router();

// AI Chat endpoint with actual AI and tool integration
router.post('/chat', async (req, res) => {
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
- Create and delete invoices
- Analyze invoice data and provide business insights
- Get customer information
- Retrieve company details
- Answer questions about business performance

TOOL SELECTION RULES:
- For general requests like "show all invoices" or "display invoices": Use openInvoiceSlider tool first
- For specific invoices like "show invoice 1037": Use getInvoiceByNumber tool
- For FILTERING/SEARCHING requests: Use searchInvoices tool for ANY filtering criteria like:
  * "invoices over $500" 
  * "unpaid invoices for John Smith"
  * "invoices due before Dec 31"
  * "invoices with balance greater than $100"
  * "overdue invoices"
  * "invoices from last month"
  * ANY natural language filtering - be smart about detecting filter intent
- For SEARCH + EMAIL + LIMIT requests: Use searchAndEmailInvoices tool for complex queries like:
  * "find overdue invoices of $500, limit 2, email to john@example.com"
  * "get unpaid invoices over $200, limit 5, send to admin@company.com"
  * "list invoices from last month with balance > $100, limit 3, email them to manager@business.com"
  * ANY query that combines search criteria + email delivery + optional limits
- For invoice analysis or data: Use getInvoices tool (but combine with openInvoiceSlider for display)
- For deletion requests: Use deleteInvoice tool with these rules:
  * Words like "delete", "remove", "erase": Use operation="delete" (permanently removes)
  * Only when specifically asked to "void": Use operation="void" (marks as $0)
- For creation requests: Use createInvoice tool

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
        'Show me all invoices',
        'What are my unpaid invoices?',
        'Delete invoice 1037',
        'Analyze my revenue',
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
router.post('/chat/stream', async (req, res) => {
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
- Create and delete invoices
- Analyze invoice data and provide business insights
- Get customer information
- Retrieve company details
- Answer questions about business performance

TOOL SELECTION RULES:
- For general requests like "show all invoices" or "display invoices": Use openInvoiceSlider tool first
- For specific invoices like "show invoice 1037": Use getInvoiceByNumber tool
- For FILTERING/SEARCHING requests: Use searchInvoices tool for ANY filtering criteria like:
  * "invoices over $500" 
  * "unpaid invoices for John Smith"
  * "invoices due before Dec 31"
  * "invoices with balance greater than $100"
  * "overdue invoices"
  * "invoices from last month"
  * ANY natural language filtering - be smart about detecting filter intent
- For SEARCH + EMAIL + LIMIT requests: Use searchAndEmailInvoices tool for complex queries like:
  * "find overdue invoices of $500, limit 2, email to john@example.com"
  * "get unpaid invoices over $200, limit 5, send to admin@company.com"
  * "list invoices from last month with balance > $100, limit 3, email them to manager@business.com"
  * ANY query that combines search criteria + email delivery + optional limits
- For invoice analysis or data: Use getInvoices tool (but combine with openInvoiceSlider for display)
- For deletion requests: Use deleteInvoice tool with these rules:
  * Words like "delete", "remove", "erase": Use operation="delete" (permanently removes)
  * Only when specifically asked to "void": Use operation="void" (marks as $0)
- For creation requests: Use createInvoice tool

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

// Add this new endpoint for intelligent search parsing
router.post('/parse-search', async (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }
    
    console.log('🧠 AI PARSE: Analyzing query:', query);
    
    // Use AI to intelligently parse the search query
    const { generateObject } = require('ai');
    const { openai } = require('@ai-sdk/openai');
    const { z } = require('zod');
    
    const SearchConditionSchema = z.object({
      field: z.string().describe('QuickBooks field name (CustomerRef, Balance, TotalAmt, TxnDate, DueDate, DocNumber, etc.)'),
      operator: z.enum(['EQUALS', 'GREATER_THAN', 'LESS_THAN', 'BETWEEN', 'LIKE', 'CUSTOMER_LIKE', 'DATE_BEFORE', 'DATE_AFTER', 'DATE_BETWEEN']).describe('Comparison operator'),
      value: z.union([
        z.string(),
        z.number(),
        z.object({
          min: z.number(),
          max: z.number()
        }),
        z.object({
          start: z.string(),
          end: z.string()
        })
      ]).describe('Value to compare against'),
      description: z.string().describe('Human-readable description of this condition')
    });
    
    const SearchIntentSchema = z.object({
      conditions: z.array(SearchConditionSchema).describe('Array of search conditions to apply'),
      summary: z.string().describe('Brief summary of what this search is looking for')
    });
    
    const systemPrompt = `You are an expert at parsing natural language invoice search queries into structured database conditions.

QUICKBOOKS INVOICE FIELDS:
- CustomerRef: Customer name (use CUSTOMER_LIKE operator for name searches)
- Balance: Amount still owed (use for "balance", "owed", "due")
- TotalAmt: Total invoice amount (use for "amount", "total", "invoice value")  
- TxnDate: Invoice creation date
- DueDate: Payment due date
- DocNumber: Invoice number
- Private: Whether invoice is private (boolean)

STATUS LOGIC:
- "unpaid" = Balance > 0
- "paid" = Balance = 0 (or Balance <= 0)
- "overdue" = Balance > 0 AND DueDate < today

DATE HANDLING:
- Convert relative dates like "this month", "last week", "today" to actual dates
- Use DATE_BETWEEN for ranges, DATE_BEFORE/DATE_AFTER for single bounds
- Format dates as YYYY-MM-DD

EXAMPLES:

Query: "Mark Cho invoices"
→ [{ field: "CustomerRef", operator: "CUSTOMER_LIKE", value: "Mark Cho", description: "customer: Mark Cho" }]

Query: "invoices over $500"  
→ [{ field: "TotalAmt", operator: "GREATER_THAN", value: 500, description: "amount > $500" }]

Query: "unpaid invoices"
→ [{ field: "Balance", operator: "GREATER_THAN", value: 0, description: "unpaid" }]

Query: "balance between 500 and 1000"
→ [{ field: "Balance", operator: "BETWEEN", value: { min: 500, max: 1000 }, description: "balance between $500 and $1000" }]

Query: "overdue invoices"
→ [
  { field: "Balance", operator: "GREATER_THAN", value: 0, description: "unpaid" },
  { field: "DueDate", operator: "DATE_BEFORE", value: "${new Date().toISOString().split('T')[0]}", description: "overdue" }
]

Query: "invoices due this month"
→ [{ field: "DueDate", operator: "DATE_BETWEEN", value: { start: "start_of_month", end: "end_of_month" }, description: "due this month" }]

Parse the query intelligently and return structured conditions. Handle ANY search criteria flexibly.`;

    const result = await generateObject({
      model: openai('gpt-4'),
      schema: SearchIntentSchema,
      prompt: `Parse this invoice search query: "${query}"
      
Current date: ${new Date().toISOString().split('T')[0]}
Start of month: ${new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]}
End of month: ${new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]}`,
      system: systemPrompt
    });
    
    console.log('🧠 AI PARSE: Generated intent:', JSON.stringify(result.object, null, 2));
    
    res.json(result.object);
    
  } catch (error) {
    console.error('🚨 AI PARSE ERROR:', error.message);
    res.status(500).json({ 
      error: 'Failed to parse search query',
      details: error.message 
    });
  }
});

module.exports = router; 