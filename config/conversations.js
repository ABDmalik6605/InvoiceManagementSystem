const fs = require('fs').promises;
const path = require('path');

const CONVERSATIONS_FILE = path.join(__dirname, '../data/conversations.json');
const DATA_DIR = path.join(__dirname, '../data');

class ConversationManager {
  constructor() {
    this.ensureDataDirectory();
  }

  async ensureDataDirectory() {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
    } catch (error) {
      // Directory already exists or other error
    }
  }

  async loadConversations() {
    try {
      const data = await fs.readFile(CONVERSATIONS_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      // File doesn't exist yet, return empty structure
      return {
        sessions: {},
        currentSessionId: null
      };
    }
  }

  async saveConversations(conversations) {
    await fs.writeFile(CONVERSATIONS_FILE, JSON.stringify(conversations, null, 2));
  }

  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async createNewSession(title = null) {
    const conversations = await this.loadConversations();
    const sessionId = this.generateSessionId();
    
    conversations.sessions[sessionId] = {
      id: sessionId,
      title: title || `Chat ${new Date().toLocaleDateString()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: []
    };
    
    conversations.currentSessionId = sessionId;
    await this.saveConversations(conversations);
    
    return sessionId;
  }

  async getCurrentSession() {
    const conversations = await this.loadConversations();
    
    if (!conversations.currentSessionId || !conversations.sessions[conversations.currentSessionId]) {
      // Create a new session if none exists
      const sessionId = await this.createNewSession();
      return conversations.sessions[sessionId];
    }
    
    return conversations.sessions[conversations.currentSessionId];
  }

  async addMessage(userMessage, aiResponse, sessionId = null) {
    const conversations = await this.loadConversations();
    
    if (!sessionId) {
      sessionId = conversations.currentSessionId;
    }
    
    if (!sessionId || !conversations.sessions[sessionId]) {
      sessionId = await this.createNewSession();
      conversations.currentSessionId = sessionId;
    }

    const session = conversations.sessions[sessionId];
    
    // Add user message
    session.messages.push({
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString()
    });

    // Add AI response
    session.messages.push({
      id: `msg_${Date.now() + 1}_${Math.random().toString(36).substr(2, 6)}`,
      role: 'assistant',
      content: aiResponse.message || aiResponse,
      timestamp: new Date().toISOString(),
      toolCalls: aiResponse.toolCalls || [],
      metadata: {
        successful: aiResponse.successful || false,
        invoicesFound: aiResponse.invoicesFound || null
      }
    });

    session.updatedAt = new Date().toISOString();
    
    // Auto-generate title from first meaningful message if not set
    if (session.title.startsWith('Chat ') && session.messages.length >= 2) {
      session.title = this.generateTitleFromMessage(userMessage);
    }

    await this.saveConversations(conversations);
    return sessionId;
  }

  generateTitleFromMessage(message) {
    // Extract key phrases to create meaningful titles
    const lowercaseMsg = message.toLowerCase();
    
    if (lowercaseMsg.includes('invoice') && lowercaseMsg.includes('email')) {
      return 'Email Invoices';
    } else if (lowercaseMsg.includes('search') || lowercaseMsg.includes('find') || lowercaseMsg.includes('list')) {
      return 'Search Invoices';
    } else if (lowercaseMsg.includes('create') || lowercaseMsg.includes('new invoice')) {
      return 'Create Invoice';
    } else if (lowercaseMsg.includes('update') || lowercaseMsg.includes('modify')) {
      return 'Update Invoice';
    } else {
      // Use first few words
      const words = message.split(' ').slice(0, 4).join(' ');
      return words.length > 30 ? words.substring(0, 30) + '...' : words;
    }
  }

  async getRecentMessages(limit = 10, sessionId = null) {
    const session = sessionId ? 
      (await this.loadConversations()).sessions[sessionId] : 
      await this.getCurrentSession();
    
    if (!session || !session.messages) {
      return [];
    }

    return session.messages.slice(-limit);
  }

  async getAllSessions() {
    const conversations = await this.loadConversations();
    return Object.values(conversations.sessions)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  async switchToSession(sessionId) {
    const conversations = await this.loadConversations();
    
    if (conversations.sessions[sessionId]) {
      conversations.currentSessionId = sessionId;
      await this.saveConversations(conversations);
      return true;
    }
    
    return false;
  }

  async deleteSession(sessionId) {
    const conversations = await this.loadConversations();
    
    if (conversations.sessions[sessionId]) {
      delete conversations.sessions[sessionId];
      
      // If this was the current session, clear it
      if (conversations.currentSessionId === sessionId) {
        conversations.currentSessionId = null;
      }
      
      await this.saveConversations(conversations);
      return true;
    }
    
    return false;
  }

  // Get conversation context for AI - formats recent messages for AI understanding
  async getContextForAI(sessionId = null, limit = 8) {
    const recentMessages = await this.getRecentMessages(limit, sessionId);
    
    if (recentMessages.length === 0) {
      return '';
    }

    let context = '\n\n--- CONVERSATION HISTORY ---\n';
    context += 'Recent conversation context (for understanding references like "these invoices", "them", etc.):\n\n';
    
    for (const msg of recentMessages) {
      if (msg.role === 'user') {
        context += `User: ${msg.content}\n`;
      } else {
        context += `Assistant: ${msg.content}\n`;
        
        // Include relevant tool call results for context
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          for (const toolCall of msg.toolCalls) {
            if (toolCall.toolName === 'searchInvoices' && toolCall.result && toolCall.result.success) {
              context += `  [Found ${toolCall.result.invoices?.length || 0} invoices]\n`;
            } else if (toolCall.toolName === 'emailInvoices' && toolCall.result && toolCall.result.success) {
              context += `  [Emailed invoices successfully]\n`;
            }
          }
        }
      }
      context += '\n';
    }
    
    context += '--- END CONVERSATION HISTORY ---\n\n';
    context += 'When the user says "these", "them", "those invoices", etc., refer to the conversation history above to understand what they mean.\n\n';
    
    return context;
  }
}

module.exports = new ConversationManager(); 