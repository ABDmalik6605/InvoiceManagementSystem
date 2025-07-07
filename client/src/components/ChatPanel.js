import React, { useState, useRef, useEffect } from 'react';
import { 
  sendChatMessage, 
  handleApiError, 
  getInvoiceByNumber, 
  getConversationSessions,
  getCurrentConversation,
  getConversation,
  createNewConversation,
  switchConversation,
  deleteConversation
} from '../utils/api';

const ChatPanel = ({ onInvoiceUpdate, onInvoiceSelect, onOpenInvoiceSlider }) => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [currentSuggestions, setCurrentSuggestions] = useState([]);
  const [conversationSessions, setConversationSessions] = useState([]);
  const [showConversationHistory, setShowConversationHistory] = useState(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load conversation history and current conversation on mount
  useEffect(() => {
    loadConversationHistory();
    loadCurrentConversation();
  }, []);

  // Load conversation history from backend
  const loadConversationHistory = async () => {
    try {
      setIsLoadingConversations(true);
      const response = await getConversationSessions();
      if (response.success) {
        setConversationSessions(response.sessions || []);
      }
    } catch (error) {
      console.error('Failed to load conversation history:', error);
    } finally {
      setIsLoadingConversations(false);
    }
  };

  // Load current conversation
  const loadCurrentConversation = async () => {
    try {
      const response = await getCurrentConversation();
      if (response.success && response.session) {
        setSessionId(response.session.id);
        
        // Convert backend message format to component format
        const formattedMessages = response.session.messages?.map(msg => ({
          id: msg.id,
          type: msg.role === 'user' ? 'user' : 'ai',
          content: msg.content,
          timestamp: new Date(msg.timestamp),
          toolCalls: msg.toolCalls || []
        })) || [];

        // Add welcome message if this is a new conversation
        if (formattedMessages.length === 0) {
          formattedMessages.push({
            id: 'welcome',
            type: 'ai',
            content: "Hi! I'm your AI assistant for invoice management. I can help you with:\n\n• View and search invoices\n• Analyze your business performance\n• Get customer information\n• Create new invoices\n• Track payments and overdue amounts\n\nWhat would you like to know about your business?",
            timestamp: new Date()
          });
        }

        setMessages(formattedMessages);
      }
    } catch (error) {
      console.error('Failed to load current conversation:', error);
      // If no conversation exists, create a new one
      handleNewChat();
    }
  };

  // Create new conversation
  const handleNewChat = async () => {
    try {
      const response = await createNewConversation();
      if (response.success) {
        setSessionId(response.sessionId);
        setMessages([{
          id: 'welcome',
          type: 'ai',
          content: "Hi! I'm your AI assistant for invoice management. I can help you with:\n\n• View and search invoices\n• Analyze your business performance\n• Get customer information\n• Create new invoices\n• Track payments and overdue amounts\n\nWhat would you like to know about your business?",
          timestamp: new Date()
        }]);
        
        // Refresh conversation list
        loadConversationHistory();
        
        // Set initial suggestions
        const initialSuggestions = [
          'Show me all invoices',
          'What are my unpaid invoices?',
          'Void invoice 1037',
          'Analyze my revenue',
          'Show overdue invoices'
        ];
        setCurrentSuggestions(initialSuggestions);
      }
    } catch (error) {
      console.error('Failed to create new conversation:', error);
    }
  };

  // Switch to different conversation
  const handleSwitchConversation = async (conversationSessionId) => {
    try {
      const response = await switchConversation(conversationSessionId);
      if (response.success) {
        setSessionId(response.sessionId);
        
        // Load the conversation messages
        const conversationResponse = await getConversation(conversationSessionId);
        if (conversationResponse.success) {
          const formattedMessages = conversationResponse.session.messages?.map(msg => ({
            id: msg.id,
            type: msg.role === 'user' ? 'user' : 'ai',
            content: msg.content,
            timestamp: new Date(msg.timestamp),
            toolCalls: msg.toolCalls || []
          })) || [];

          setMessages(formattedMessages);
          setShowConversationHistory(false);
        }
      }
    } catch (error) {
      console.error('Failed to switch conversation:', error);
    }
  };

  // Delete conversation
  const handleDeleteConversation = async (conversationSessionId) => {
    try {
      const response = await deleteConversation(conversationSessionId);
      if (response.success) {
        // Refresh conversation list
        loadConversationHistory();
        
        // If we deleted the current conversation, create a new one
        if (conversationSessionId === sessionId) {
          handleNewChat();
        }
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  };

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
        // DEBUG: Log all tool calls to see what the AI is actually calling
        console.log('🔍 CHATPANEL: ALL TOOL CALLS:', response.toolCalls.map(call => ({
          toolName: call.toolName,
          hasResult: !!call.result,
          resultAction: call.result?.action,
          success: call.result?.success,
          invoiceCount: call.result?.invoices?.length
        })));

        // DEBUG: Show which searchInvoices calls are successful
        const successfulSearchCalls = response.toolCalls.filter(call => 
          call.toolName === 'searchInvoices' && 
          call.result?.action === 'openInvoiceSlider' && 
          call.result?.success === true
        );
        console.log('✅ CHATPANEL: Successful searchInvoices calls:', successfulSearchCalls.length);

        const hasInvoiceOperation = response.toolCalls.some(call => 
          ['getInvoices', 'createInvoice', 'getInvoiceById', 'getInvoiceByNumber', 'deleteInvoice', 'updateInvoice', 'emailInvoices'].includes(call.toolName)
        );
        
        if (hasInvoiceOperation) {
          onInvoiceUpdate();
        }

        // Check for ANY tool that wants to trigger the slider - completely dynamic!
        const sliderCall = response.toolCalls.find(call => 
          // Look for ANY successful tool that has action: 'openInvoiceSlider'
          call.result?.success === true && 
          call.result?.action === 'openInvoiceSlider'
        );
        
        console.log('🎯 CHATPANEL: Selected slider call:', sliderCall ? 
          `${sliderCall.toolName} (success: ${sliderCall.result?.success}, invoices: ${sliderCall.result?.invoices?.length})` : 
          'NONE');
        
        if (sliderCall && sliderCall.result && sliderCall.result.success) {
          console.log('🎯 CHATPANEL: Prioritized tool call:', sliderCall.toolName);
          console.log('📱 CHATPANEL: Slider call detected:', sliderCall.toolName);
          console.log('📊 CHATPANEL: Filter:', sliderCall.result.filter);
          console.log('📋 CHATPANEL: Invoice count:', sliderCall.result.invoices?.length || 0);
          console.log('🔍 CHATPANEL: Search query:', sliderCall.result.searchQuery);
          if (sliderCall.result.invoices?.length > 0) {
            console.log('📄 CHATPANEL: First invoice:', sliderCall.result.invoices[0].DocNumber, '-', sliderCall.result.invoices[0].CustomerRef?.name);
          }
          
          // DEBUG: Log data being passed to slider
          console.log('🚀 CHATPANEL: Calling onOpenInvoiceSlider with data:');
          console.log('   📊 Filter:', sliderCall.result.filter || 'all');
          console.log('   📋 Invoice count:', sliderCall.result.invoices?.length || 0);
          console.log('   🔍 Search query:', sliderCall.result.searchQuery || null);
          if (sliderCall.result.invoices?.length > 0) {
            console.log('   📄 First invoice:', sliderCall.result.invoices[0].DocNumber, '-', sliderCall.result.invoices[0].CustomerRef?.name);
            console.log('   📄 Last invoice:', sliderCall.result.invoices[sliderCall.result.invoices.length-1].DocNumber, '-', sliderCall.result.invoices[sliderCall.result.invoices.length-1].CustomerRef?.name);
          }

          // Pass both filter and invoice data to the slider
          onOpenInvoiceSlider && onOpenInvoiceSlider(
            sliderCall.result.filter || 'all', 
            sliderCall.result.invoices || null,
            sliderCall.result.searchQuery || null
          );
          invoiceSelected = true; // Prevent other selection logic from running
        }

        // Check if multiple invoices are mentioned in the response
        const invoiceNumbers = extractInvoiceNumbers(response.response);
        const multipleInvoicesDetected = invoiceNumbers.length > 1;
        
        console.log('🔍 CHATPANEL: Invoice numbers detected in response:', invoiceNumbers);
        console.log('🔍 CHATPANEL: Multiple invoices detected:', multipleInvoicesDetected);
        
        // If a specific single invoice was retrieved AND no multiple invoices detected, select it for detail view
        const invoiceCall = response.toolCalls.find(call => 
          call.toolName === 'getInvoiceById' || call.toolName === 'getInvoiceByNumber'
        );
        
        if (invoiceCall && invoiceCall.result && invoiceCall.result.success && !invoiceSelected && !multipleInvoicesDetected) {
          console.log('✅ CHATPANEL: Using single invoice for detail view:', invoiceCall.result.invoice.DocNumber);
          onInvoiceSelect(invoiceCall.result.invoice);
          invoiceSelected = true;
        } else if (invoiceCall && invoiceCall.result && invoiceCall.result.success && multipleInvoicesDetected) {
          console.log('🚫 CHATPANEL: Single invoice call detected but multiple invoices mentioned - skipping detail view');
        }
      }

      // Only use pattern detection for single invoice if no tools handled it
      if (!invoiceSelected) {
        const invoiceNumbers = extractInvoiceNumbers(response.response);
        if (invoiceNumbers.length === 1) {
          // Only auto-select for single invoice mentions
          const firstInvoiceNumber = invoiceNumbers[0];
          console.log(`✅ CHATPANEL: Single invoice detected: ${firstInvoiceNumber} - auto-selecting for detail view`);
          
          const success = await autoSelectInvoiceByNumber(firstInvoiceNumber);
          if (success) {
            console.log(`Successfully auto-selected invoice ${firstInvoiceNumber}`);
          }
        } else if (invoiceNumbers.length > 1) {
          console.log(`🚫 CHATPANEL: Multiple invoices detected (${invoiceNumbers.length}) - not auto-selecting for detail view`);
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
    <div className="h-full flex">
      {/* Conversation History Sidebar */}
      {showConversationHistory && (
        <div className="w-80 border-r border-gray-200 bg-gray-50 flex flex-col">
          {/* Sidebar Header */}
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Conversations</h3>
              <button
                onClick={() => setShowConversationHistory(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <button
              onClick={handleNewChat}
              className="mt-3 w-full inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Chat
            </button>
          </div>

          {/* Conversation List */}
          <div className="flex-1 overflow-y-auto">
            {isLoadingConversations ? (
              <div className="p-4 text-center text-gray-500">Loading conversations...</div>
            ) : conversationSessions.length === 0 ? (
              <div className="p-4 text-center text-gray-500">No conversations yet</div>
            ) : (
              <div className="space-y-1 p-2">
                {conversationSessions.map((session) => (
                  <div
                    key={session.id}
                    className={`group flex items-center justify-between p-3 rounded-lg hover:bg-gray-100 cursor-pointer ${
                      session.id === sessionId ? 'bg-blue-50 border border-blue-200' : ''
                    }`}
                    onClick={() => handleSwitchConversation(session.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium text-gray-900 truncate">
                        {session.title}
                      </h4>
                      <p className="text-xs text-gray-500">
                        {new Date(session.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteConversation(session.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 ml-2 text-gray-400 hover:text-red-600"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Chat Panel */}
      <div className="flex-1 flex flex-col">
        {/* Chat Header */}
        <div className="flex-shrink-0 p-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowConversationHistory(!showConversationHistory)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
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
            <button
              onClick={handleNewChat}
              className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New
            </button>
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
    </div>
  );
};

export default ChatPanel; 