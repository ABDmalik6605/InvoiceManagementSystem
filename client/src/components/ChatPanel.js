import React, { useState, useRef, useEffect } from 'react';
import { sendChatMessage, handleApiError, getInvoiceByNumber } from '../utils/api';

const ChatPanel = ({ onInvoiceUpdate, onInvoiceSelect, onOpenInvoiceSlider }) => {
  const [messages, setMessages] = useState([
    {
      id: 1,
      type: 'ai',
      content: "Hi! I'm your AI assistant for invoice management. I can help you with:\n\n• View and search invoices\n• Analyze your business performance\n• Get customer information\n• Create new invoices\n• Track payments and overdue amounts\n\nWhat would you like to know about your business?",
      timestamp: new Date()
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(`session-${Date.now()}`);
  const [currentSuggestions, setCurrentSuggestions] = useState([]);
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load initial suggestions when component mounts
  useEffect(() => {
    // Set initial suggestions that match the backend
    const initialSuggestions = [
      'Show me all invoices',
      'What are my unpaid invoices?',
      'Void invoice 1037',
      'Analyze my revenue',
      'Get customer list',
      'Show overdue invoices'
    ];
    setCurrentSuggestions(initialSuggestions);
  }, []);

  // Function to detect and extract invoice numbers from text
  const extractInvoiceNumbers = (text) => {
    // Patterns to match: "invoice 1001", "invoice number 1001", "#1001", "Invoice #1001", etc.
    const patterns = [
      /invoice\s+(?:number\s+)?#?(\d+)/gi,
      /invoice\s*#(\d+)/gi,
      /#(\d+)/g,
      /\binvoice\s+(\d+)\b/gi
    ];
    
    const invoiceNumbers = new Set();
    
    patterns.forEach(pattern => {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          invoiceNumbers.add(match[1]);
        }
      }
    });
    
    return Array.from(invoiceNumbers);
  };

  // Function to automatically fetch and select invoice by number
  const autoSelectInvoiceByNumber = async (docNumber) => {
    try {
      const response = await getInvoiceByNumber(docNumber);
      const invoice = response.QueryResponse?.Invoice?.[0];
      
      if (invoice) {
        console.log(`Auto-selecting invoice ${docNumber}:`, invoice);
        onInvoiceSelect(invoice);
        return true;
      }
    } catch (error) {
      console.log(`Invoice ${docNumber} not found or error fetching:`, error);
      return false;
    }
    return false;
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || isLoading) return;

    const userMessage = {
      id: Date.now(),
      type: 'user',
      content: inputMessage.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const response = await sendChatMessage(inputMessage.trim(), sessionId);
      
      const aiMessage = {
        id: Date.now() + 1,
        type: 'ai',
        content: response.response,
        timestamp: new Date(),
        toolCalls: response.toolCalls || []
      };

      setMessages(prev => [...prev, aiMessage]);

      // Update suggestions if provided in the response
      if (response.suggestions && response.suggestions.length > 0) {
        setCurrentSuggestions(response.suggestions);
      }

      // Check if any tool calls created or modified invoices
      let invoiceSelected = false;
      if (response.toolCalls && response.toolCalls.length > 0) {
        const hasInvoiceOperation = response.toolCalls.some(call => 
          ['getInvoices', 'createInvoice', 'getInvoiceById', 'getInvoiceByNumber', 'deleteInvoice', 'updateInvoice'].includes(call.toolName)
        );
        
        if (hasInvoiceOperation) {
          onInvoiceUpdate();
        }

        // Check for openInvoiceSlider tool call
        const sliderCall = response.toolCalls.find(call => call.toolName === 'openInvoiceSlider');
        if (sliderCall && sliderCall.result && sliderCall.result.success) {
          console.log('Opening invoice slider via AI tool:', sliderCall.result);
          onOpenInvoiceSlider && onOpenInvoiceSlider(sliderCall.result.filter || 'all');
          invoiceSelected = true; // Prevent other selection logic from running
        }

        // If a specific invoice was retrieved, select it
        const invoiceCall = response.toolCalls.find(call => 
          call.toolName === 'getInvoiceById' || call.toolName === 'getInvoiceByNumber'
        );
        if (invoiceCall && invoiceCall.result && invoiceCall.result.success && !invoiceSelected) {
          console.log('Using AI tool result for invoice selection:', invoiceCall.result.invoice);
          onInvoiceSelect(invoiceCall.result.invoice);
          invoiceSelected = true;
        }
      }

      // Only use pattern detection if AI tool didn't already select an invoice
      if (!invoiceSelected) {
        const invoiceNumbers = extractInvoiceNumbers(response.response);
        if (invoiceNumbers.length > 0) {
          // Try to find and select the first mentioned invoice number
          const firstInvoiceNumber = invoiceNumbers[0];
          console.log(`Detected invoice numbers in AI response: ${invoiceNumbers.join(', ')}`);
          console.log(`Attempting to auto-select invoice: ${firstInvoiceNumber}`);
          
          const success = await autoSelectInvoiceByNumber(firstInvoiceNumber);
          if (success) {
            console.log(`Successfully auto-selected invoice ${firstInvoiceNumber}`);
          }
        }
      }

    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage = {
        id: Date.now() + 1,
        type: 'ai',
        content: `Sorry, I encountered an error: ${handleApiError(error)}`,
        timestamp: new Date(),
        isError: true
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Icon mapping function for dynamic suggestions
  const getIconForSuggestion = (text) => {
    const lowerText = text.toLowerCase();
    if (lowerText.includes('void') || lowerText.includes('delete')) return '🗑️';
    if (lowerText.includes('invoice') && lowerText.includes('show')) return '🔍';
    if (lowerText.includes('all invoices') || lowerText.includes('recent') || lowerText.includes('invoices')) return '📄';
    if (lowerText.includes('unpaid') || lowerText.includes('balance')) return '💰';
    if (lowerText.includes('overdue')) return '⚠️';
    if (lowerText.includes('revenue') || lowerText.includes('analyze')) return '📊';
    if (lowerText.includes('customer')) return '👥';
    if (lowerText.includes('payment')) return '💳';
    if (lowerText.includes('create')) return '➕';
    return '💬'; // Default icon
  };

  // Default fallback suggestions
  const defaultSuggestions = [
    'Show recent invoices',
    'Show me invoice 1037', 
    'Analyze my revenue',
    'Find unpaid invoices',
    'Get customer list',
    'Show overdue invoices'
  ];

  // Use dynamic suggestions from AI response, or fall back to defaults
  const activeSuggestions = currentSuggestions.length > 0 ? currentSuggestions : defaultSuggestions;
  
  const quickActions = activeSuggestions.map(text => ({
    text,
    icon: getIconForSuggestion(text)
  }));

  const handleQuickAction = (actionText) => {
    setInputMessage(actionText);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Chat Header */}
      <div className="flex-shrink-0 p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center space-x-3">
          <div className="h-8 w-8 bg-blue-500 rounded-full flex items-center justify-center">
            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">AI Assistant</h3>
            <p className="text-sm text-gray-500">Ask me about your invoices</p>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-xs lg:max-w-md px-4 py-3 rounded-lg ${
                message.type === 'user'
                  ? 'bg-blue-500 text-white'
                  : message.isError
                  ? 'bg-red-50 text-red-700 border border-red-200'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              <div className="whitespace-pre-wrap text-sm">{message.content}</div>
              
              <div className="text-xs opacity-70 mt-1">
                {message.timestamp.toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 px-4 py-3 rounded-lg max-w-xs">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Actions */}
      <div className="flex-shrink-0 p-4 border-t border-gray-200 bg-gray-50">
        <div className="mb-3">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Quick Actions</h4>
          <div className="flex flex-wrap gap-2">
            {quickActions.map((action, index) => (
              <button
                key={index}
                onClick={() => handleQuickAction(action.text)}
                className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <span className="mr-1">{action.icon}</span>
                {action.text}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Message Input */}
      <div className="flex-shrink-0 p-4 border-t border-gray-200">
        <form onSubmit={handleSendMessage} className="flex space-x-2">
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder="Ask me about your invoices..."
            className="flex-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!inputMessage.trim() || isLoading}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatPanel; 