import axios from 'axios';

// No need for full URL since we have proxy configured
// const API_BASE_URL = 'http://localhost:3000';

// Configure axios defaults
// axios.defaults.baseURL = API_BASE_URL;
axios.defaults.withCredentials = true;

// API utility functions
export const api = {
  // Authentication
  checkAuthStatus: async () => {
    const response = await axios.get('/api/status');
    return response.data;
  },

  // AI Chat
  sendChatMessage: async (message, sessionId = 'default') => {
    const response = await axios.post('/api/ai/chat', {
      message,
      sessionId
    });
    return response.data;
  },

  // Invoices
  getInvoices: async (params = {}) => {
    const response = await axios.get('/api/invoices', { params });
    return response.data;
  },

  getInvoiceById: async (id) => {
    const response = await axios.get(`/api/invoices/${id}`);
    return response.data;
  },

  createInvoice: async (invoiceData) => {
    const response = await axios.post('/api/invoices', invoiceData);
    return response.data;
  },

  deleteInvoice: async (invoiceId) => {
    const response = await axios.delete(`/api/invoices/${invoiceId}/permanent-delete`);
    return response.data;
  },

  // Company
  getCompanyInfo: async () => {
    const response = await axios.get('/api/company');
    return response.data;
  },

  // Bulk data
  getBulkData: async () => {
    const response = await axios.get('/api/bulk-data');
    return response.data;
  },

  // Add this new function after the existing getInvoices function
  getInvoiceByNumber: async (docNumber) => {
    try {
      const response = await axios.get(`/invoice/number/${docNumber}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Conversation Management
  getConversationSessions: async () => {
    const response = await axios.get('/api/conversations/sessions');
    return response.data;
  },

  getCurrentConversation: async () => {
    const response = await axios.get('/api/conversations/current');
    return response.data;
  },

  getConversation: async (sessionId) => {
    const response = await axios.get(`/api/conversations/${sessionId}`);
    return response.data;
  },

  createNewConversation: async (title) => {
    const response = await axios.post('/api/conversations/new', { title });
    return response.data;
  },

  switchConversation: async (sessionId) => {
    const response = await axios.post(`/api/conversations/switch/${sessionId}`);
    return response.data;
  },

  deleteConversation: async (sessionId) => {
    const response = await axios.delete(`/api/conversations/${sessionId}`);
    return response.data;
  }
};

// Convenience functions that match the App component expectations
export const checkAuthStatus = api.checkAuthStatus;
export const sendChatMessage = api.sendChatMessage;
export const getInvoices = api.getInvoices;
export const getInvoiceById = api.getInvoiceById;
export const createInvoice = api.createInvoice;
export const deleteInvoice = api.deleteInvoice;
export const getCompanyInfo = api.getCompanyInfo;
export const getBulkData = api.getBulkData;
export const getInvoiceByNumber = api.getInvoiceByNumber;

// Conversation management functions
export const getConversationSessions = api.getConversationSessions;
export const getCurrentConversation = api.getCurrentConversation;
export const getConversation = api.getConversation;
export const createNewConversation = api.createNewConversation;
export const switchConversation = api.switchConversation;
export const deleteConversation = api.deleteConversation;

// Error handling utility
export const handleApiError = (error) => {
  if (error.response) {
    // Server responded with an error status
    const message = error.response.data?.error || error.response.statusText;
    return `Server Error: ${message}`;
  } else if (error.request) {
    // Request was made but no response received
    return 'Network Error: Unable to connect to server';
  } else {
    // Something else happened
    return `Error: ${error.message}`;
  }
};

// Format currency utility
export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount || 0);
};

// Format date utility
export const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(new Date(dateString));
};

// Get invoice status utility
export const getInvoiceStatus = (invoice) => {
  if (!invoice) return 'unknown';
  
  const balance = parseFloat(invoice.Balance || invoice.balance || 0);
  const dueDate = invoice.DueDate || invoice.dueDate;
  
  if (balance <= 0) return 'paid';
  
  if (dueDate && new Date(dueDate) < new Date()) {
    return 'overdue';
  }
  
  return 'unpaid';
}; 