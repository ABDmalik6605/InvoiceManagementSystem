import React, { useState, useEffect } from 'react';
import ChatPanel from './components/ChatPanel';
import InvoicePanel from './components/InvoicePanel';
import Header from './components/Header';
import AuthStatus from './components/AuthStatus';
import { checkAuthStatus } from './utils/api';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [refreshInvoices, setRefreshInvoices] = useState(0);
  const [forceSliderView, setForceSliderView] = useState(null);

  // Check authentication status on app load
  useEffect(() => {
    const checkAuth = async () => {
      try {
        setIsLoading(true);
        const authStatus = await checkAuthStatus();
        setIsAuthenticated(authStatus.status === 'connected');
        setAuthError(null);
      } catch (error) {
        console.error('Auth check failed:', error);
        setIsAuthenticated(false);
        setAuthError('Failed to check authentication status');
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  // Function to trigger invoice refresh from chat actions
  const handleInvoiceUpdate = () => {
    setRefreshInvoices(prev => prev + 1);
  };

  // Handle invoice selection from chat or invoice panel
  const handleInvoiceSelect = (invoice) => {
    setSelectedInvoice(invoice);
  };

  // Handle opening invoice slider (clear selection to show slider view)
  const handleOpenInvoiceSlider = (filter = 'all') => {
    setSelectedInvoice(null); // Clear selection to show slider view
    setForceSliderView({ view: 'slider', filter: filter }); // Force slider view with filter
    handleInvoiceUpdate(); // Refresh invoices
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading Invoice Management...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <Header />
      
      {/* Auth Status */}
      <AuthStatus 
        isAuthenticated={isAuthenticated}
        authError={authError}
        onRetry={() => window.location.reload()}
      />
      
      {/* Main Content - Dual Panel Layout */}
      {isAuthenticated ? (
        <div className="flex-1 flex overflow-hidden">
          {/* Chat Panel - Left Side */}
          <div className="w-1/2 border-r border-gray-200 bg-white">
            <ChatPanel 
              onInvoiceUpdate={handleInvoiceUpdate}
              onInvoiceSelect={handleInvoiceSelect}
              onOpenInvoiceSlider={handleOpenInvoiceSlider}
            />
          </div>
          
          {/* Invoice Panel - Right Side */}
          <div className="w-1/2 bg-gray-50">
            <InvoicePanel 
              selectedInvoice={selectedInvoice}
              refreshTrigger={refreshInvoices}
              onInvoiceSelect={handleInvoiceSelect}
              forceSliderView={forceSliderView}
              onSliderViewApplied={() => setForceSliderView(null)}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md mx-auto p-6">
            <div className="mb-6">
              <div className="mx-auto h-12 w-12 rounded-full bg-yellow-100 flex items-center justify-center">
                <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Authentication Required</h2>
            <p className="text-gray-600 mb-6">
              You need to connect to QuickBooks to access your invoice data and use the AI assistant.
            </p>
            <a 
              href="http://localhost:3000/auth/quickbooks"
              className="inline-flex items-center px-4 py-2 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Connect to QuickBooks
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export default App; 