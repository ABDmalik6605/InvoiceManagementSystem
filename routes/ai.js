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

module.exports = router; 