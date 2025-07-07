import React, { useState, useEffect } from 'react';
import { getInvoices, handleApiError, formatCurrency, formatDate, getInvoiceStatus, deleteInvoice } from '../utils/api';
import { ChevronLeft, ChevronRight, Trash2, X } from 'lucide-react';
import DeleteConfirmModal from './DeleteConfirmModal';

const InvoicePanel = ({ selectedInvoice, refreshTrigger, onInvoiceSelect, forceSliderView, onSliderViewApplied }) => {
  const [invoices, setInvoices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [view, setView] = useState('slider');
  const [currentSlide, setCurrentSlide] = useState(0);
  const [slidesPerView] = useState(6); // Number of invoices to show per slide
  const [filter, setFilter] = useState('all'); // Filter: 'all', 'paid', 'unpaid', 'overdue'
  const [searchQuery, setSearchQuery] = useState(''); // Search query for display
  
  // Delete functionality state
  const [selectedInvoices, setSelectedInvoices] = useState(new Set());
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [invoicesToDelete, setInvoicesToDelete] = useState([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showBulkActions, setShowBulkActions] = useState(false);

  useEffect(() => {
    console.log('🔄 INVOICEPANEL: loadData useEffect triggered - refreshTrigger:', refreshTrigger);
    console.log('🔧 INVOICEPANEL: forceSliderView in loadData:', forceSliderView);
    console.log('🔧 INVOICEPANEL: forceSliderView exists?', !!forceSliderView);
    console.log('🔧 INVOICEPANEL: customInvoices exists?', !!forceSliderView?.customInvoices);
    console.log('🔧 INVOICEPANEL: customInvoices length:', forceSliderView?.customInvoices?.length || 0);
    console.log('🔧 INVOICEPANEL: Current invoices state length before decision:', invoices.length);
    
    // Don't load data if we're using custom filtered invoices
    if (forceSliderView && forceSliderView.customInvoices && forceSliderView.customInvoices.length > 0) {
      console.log('🚫 INVOICEPANEL: SKIPPING loadData - using custom invoices, count:', forceSliderView.customInvoices.length);
      console.log('🚫 INVOICEPANEL: First custom invoice in skip check:', forceSliderView.customInvoices[0].DocNumber, '-', forceSliderView.customInvoices[0].CustomerRef?.name);
      return;
    }
    
    console.log('▶️ INVOICEPANEL: PROCEEDING with loadData - no custom invoices to preserve');
    console.log('▶️ INVOICEPANEL: About to load fresh data from API...');

    const loadData = async () => {
      try {
        console.log('📡 INVOICEPANEL: Starting API call to getInvoices');
        setIsLoading(true);
        setError(null);

        // Only call getInvoices - remove getBulkData call
        const invoicesData = await getInvoices({ limit: 50 });

        const invoiceList = invoicesData.QueryResponse?.Invoice || [];
        console.log('📊 INVOICEPANEL: Received invoices from API - count:', invoiceList.length);
        if (invoiceList.length > 0) {
          console.log('📄 INVOICEPANEL: First API invoice:', invoiceList[0].DocNumber, '-', invoiceList[0].CustomerRef?.name);
        }
        setInvoices(invoiceList);

        // Calculate analytics from invoice data
        const totalRevenue = invoiceList.reduce((sum, inv) => sum + parseFloat(inv.TotalAmt || 0), 0);
        const unpaidInvoices = invoiceList.filter(inv => parseFloat(inv.Balance || 0) > 0);
        const totalUnpaid = unpaidInvoices.reduce((sum, inv) => sum + parseFloat(inv.Balance || 0), 0);
        const overdueInvoices = invoiceList.filter(inv => {
          const balance = parseFloat(inv.Balance || 0);
          const dueDate = inv.DueDate;
          return balance > 0 && dueDate && new Date(dueDate) < new Date();
        });

        setAnalytics({
          totalInvoices: invoiceList.length,
          totalRevenue,
          paidRevenue: totalRevenue - totalUnpaid,
          unpaidCount: unpaidInvoices.length,
          unpaidAmount: totalUnpaid,
          overdueCount: overdueInvoices.length,
          overdueAmount: overdueInvoices.reduce((sum, inv) => sum + parseFloat(inv.Balance || 0), 0)
        });

      } catch (err) {
        console.error('Invoice loading error:', err);
        setError(handleApiError(err));
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [refreshTrigger]); // Removed forceSliderView dependency to prevent race condition

  useEffect(() => {
    if (selectedInvoice) {
      setView('detail');
    }
  }, [selectedInvoice]);

  // Handle forced slider view from AI
  useEffect(() => {
    console.log('🎯 INVOICEPANEL: forceSliderView useEffect triggered');
    console.log('📦 INVOICEPANEL: forceSliderView prop:', forceSliderView);
    
    if (forceSliderView) {
      console.log('🔧 INVOICEPANEL: Setting view to:', forceSliderView.view);
      console.log('🔧 INVOICEPANEL: Setting filter to:', forceSliderView.filter);
      console.log('🔍 INVOICEPANEL: Search query:', forceSliderView.searchQuery);
      console.log('📊 INVOICEPANEL: Custom invoices count:', forceSliderView.customInvoices?.length || 'NONE');
      
      setView(forceSliderView.view);
      setFilter(forceSliderView.filter);
      setCurrentSlide(0);
      
      // If custom invoices provided, use them instead of loaded data
      if (forceSliderView.customInvoices && forceSliderView.customInvoices.length > 0) {
        console.log('✅ INVOICEPANEL: Setting custom invoices - count:', forceSliderView.customInvoices.length);
        console.log('📄 INVOICEPANEL: First custom invoice:', forceSliderView.customInvoices[0].DocNumber, '-', forceSliderView.customInvoices[0].CustomerRef?.name);
        console.log('📄 INVOICEPANEL: Last custom invoice:', forceSliderView.customInvoices[forceSliderView.customInvoices.length-1].DocNumber, '-', forceSliderView.customInvoices[forceSliderView.customInvoices.length-1].CustomerRef?.name);
        console.log('🔄 INVOICEPANEL: About to call setInvoices with custom data');
        
        setInvoices(forceSliderView.customInvoices);
        setIsLoading(false); // Ensure loading state is off
        
        // Set search query for display
        if (forceSliderView.searchQuery) {
          console.log('🔍 INVOICEPANEL: Setting search query:', forceSliderView.searchQuery);
          setSearchQuery(forceSliderView.searchQuery);
        }
        
        console.log('✅ INVOICEPANEL: setInvoices called with custom data');
      } else {
        console.log('⚠️ INVOICEPANEL: No custom invoices provided');
      }
      
      // Notify parent that the forced view has been applied
      onSliderViewApplied && onSliderViewApplied();
    } else {
      console.log('❌ INVOICEPANEL: forceSliderView is null/undefined');
    }
  }, [forceSliderView, onSliderViewApplied]);

  // DEBUG: Watch for changes to invoices state
  useEffect(() => {
    console.log('📊 INVOICEPANEL: invoices state changed - new length:', invoices.length);
    if (invoices.length > 0) {
      console.log('📊 INVOICEPANEL: First invoice in new state:', invoices[0].DocNumber, '-', invoices[0].CustomerRef?.name);
      console.log('📊 INVOICEPANEL: Last invoice in new state:', invoices[invoices.length-1].DocNumber, '-', invoices[invoices.length-1].CustomerRef?.name);
    }
  }, [invoices]);

  // Filter invoices based on current filter
  console.log('🔍 INVOICEPANEL: Filtering invoices');
  console.log('📊 INVOICEPANEL: Current invoices array length:', invoices.length);
  console.log('🔧 INVOICEPANEL: Current filter:', filter);
  if (invoices.length > 0) {
    console.log('📄 INVOICEPANEL: First invoice in array:', invoices[0].DocNumber, '-', invoices[0].CustomerRef?.name);
  }
  
  const filteredInvoices = invoices.filter(invoice => {
    if (filter === 'all' || filter === 'custom') return true; // 'custom' means pre-filtered data
    const status = getInvoiceStatus(invoice);
    return status === filter;
  });
  
  console.log('📋 INVOICEPANEL: Filtered invoices count:', filteredInvoices.length);

  // Reset slide when filter changes
  useEffect(() => {
    setCurrentSlide(0);
  }, [filter]);

  // Clear selections when filter changes
  useEffect(() => {
    setSelectedInvoices(new Set());
    setShowBulkActions(false);
  }, [filter]);

  // Delete functionality handlers
  const handleSelectInvoice = (invoice, event) => {
    event.stopPropagation(); // Prevent card click
    const newSelected = new Set(selectedInvoices);
    
    if (newSelected.has(invoice.Id)) {
      newSelected.delete(invoice.Id);
    } else {
      newSelected.add(invoice.Id);
    }
    
    setSelectedInvoices(newSelected);
    setShowBulkActions(newSelected.size > 0);
  };

  const handleSelectAll = () => {
    if (selectedInvoices.size === filteredInvoices.length) {
      setSelectedInvoices(new Set());
      setShowBulkActions(false);
    } else {
      setSelectedInvoices(new Set(filteredInvoices.map(inv => inv.Id)));
      setShowBulkActions(true);
    }
  };

  const handleDeleteSingle = (invoice, event) => {
    event.stopPropagation(); // Prevent card click
    setInvoicesToDelete([invoice]);
    setShowDeleteModal(true);
  };

  const handleDeleteSelected = () => {
    const invoicesToDeleteList = filteredInvoices.filter(inv => selectedInvoices.has(inv.Id));
    setInvoicesToDelete(invoicesToDeleteList);
    setShowDeleteModal(true);
  };

  const executeDelete = async () => {
    setIsDeleting(true);
    
    try {
      const promises = invoicesToDelete.map(invoice => deleteInvoice(invoice.Id));
      await Promise.all(promises);
      
      // Refresh invoice list
      const refreshData = async () => {
        try {
          const invoicesData = await getInvoices({ limit: 50 });
          const invoiceList = invoicesData.QueryResponse?.Invoice || [];
          setInvoices(invoiceList);
        } catch (err) {
          console.error('Refresh failed:', err);
        }
      };
      await refreshData();
      
      // Clear selections and close modal
      setSelectedInvoices(new Set());
      setShowBulkActions(false);
      setShowDeleteModal(false);
      setInvoicesToDelete([]);
      
    } catch (error) {
      console.error('Delete failed:', error);
      alert('Failed to delete invoices. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const cancelDelete = () => {
    setShowDeleteModal(false);
    setInvoicesToDelete([]);
  };

  const nextSlide = () => {
    const maxSlide = Math.max(0, Math.ceil(filteredInvoices.length / slidesPerView) - 1);
    setCurrentSlide(current => Math.min(current + 1, maxSlide));
  };

  const prevSlide = () => {
    setCurrentSlide(current => Math.max(current - 1, 0));
  };

  const renderStatusBadge = (invoice) => {
    const status = getInvoiceStatus(invoice);
    const badgeClasses = {
      paid: 'status-badge status-paid',
      unpaid: 'status-badge status-unpaid',
      overdue: 'status-badge status-overdue'
    };

    return <span className={badgeClasses[status]}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>;
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
          <p className="text-sm text-gray-600">Loading invoice data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-center">
          <h3 className="text-lg font-medium text-gray-900 mb-2">Error Loading Data</h3>
          <p className="text-sm text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Invoice Data</h2>
          <div className="flex space-x-1">
            <button
              onClick={() => setView('slider')}
              className={`px-3 py-1 text-sm font-medium rounded-md ${
                view === 'slider' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Slider
            </button>
            <button
              onClick={() => setView('list')}
              className={`px-3 py-1 text-sm font-medium rounded-md ${
                view === 'list' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              List
            </button>
            <button
              onClick={() => setView('analytics')}
              className={`px-3 py-1 text-sm font-medium rounded-md ${
                view === 'analytics' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Analytics
            </button>
            {selectedInvoice && (
              <button
                onClick={() => setView('detail')}
                className={`px-3 py-1 text-sm font-medium rounded-md ${
                  view === 'detail' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Detail
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {showBulkActions && (
        <div className="flex-shrink-0 bg-blue-50 border-b border-blue-200 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <span className="text-sm font-medium text-blue-900">
                {selectedInvoices.size} invoice{selectedInvoices.size !== 1 ? 's' : ''} selected
              </span>
              <button
                onClick={() => {
                  setSelectedInvoices(new Set());
                  setShowBulkActions(false);
                }}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Clear selection
              </button>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleDeleteSelected}
                className="px-3 py-1 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 flex items-center space-x-1"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Selected</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden p-4">
        {/* Invoice Slider View */}
        {view === 'slider' && (
          <div className="h-full flex flex-col">
            {/* Filter Options */}
            <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-200">
              <div className="flex items-center space-x-1">
                <div className="flex items-center space-x-2 mr-4">
                  <input
                    type="checkbox"
                    checked={filteredInvoices.length > 0 && selectedInvoices.size === filteredInvoices.length}
                    onChange={handleSelectAll}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-600">Select All</span>
                </div>
                <span className="text-sm font-medium text-gray-700 mr-2">Filter:</span>
                <button
                  onClick={() => setFilter('all')}
                  className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                    filter === 'all' 
                      ? 'bg-blue-100 text-blue-700 border border-blue-200' 
                      : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setFilter('paid')}
                  className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                    filter === 'paid' 
                      ? 'bg-green-100 text-green-700 border border-green-200' 
                      : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                  }`}
                >
                  Paid
                </button>
                <button
                  onClick={() => setFilter('unpaid')}
                  className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                    filter === 'unpaid' 
                      ? 'bg-red-100 text-red-700 border border-red-200' 
                      : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                  }`}
                >
                  Unpaid
                </button>
                <button
                  onClick={() => setFilter('overdue')}
                  className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                    filter === 'overdue' 
                      ? 'bg-yellow-100 text-yellow-700 border border-yellow-200' 
                      : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                  }`}
                >
                  Overdue
                </button>
              </div>
              <span className="text-sm text-gray-500">
                {filteredInvoices.length} of {invoices.length} invoices
              </span>
            </div>
            
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {forceSliderView?.searchQuery ? 'Search Results' :
                   filter === 'all' ? 'Recent Invoices' : 
                   filter === 'paid' ? 'Paid Invoices' :
                   filter === 'unpaid' ? 'Unpaid Invoices' : 
                   filter === 'custom' ? 'Filtered Invoices' : 'Overdue Invoices'}
                </h3>
                {forceSliderView?.searchQuery && (
                  <p className="text-sm text-gray-600 mt-1">
                    Results for: "{forceSliderView.searchQuery}"
                  </p>
                )}
              </div>
              <div className="flex items-center space-x-2">
                {filteredInvoices.length > slidesPerView && (
                  <div className="flex space-x-1">
                    <button
                      onClick={prevSlide}
                      disabled={currentSlide === 0}
                      className="p-1 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                                         <button
                       onClick={nextSlide}
                       disabled={currentSlide >= Math.ceil(filteredInvoices.length / slidesPerView) - 1}
                       className="p-1 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                     >
                       <ChevronRight className="w-4 h-4" />
                     </button>
                   </div>
                 )}
               </div>
             </div>
             
             {filteredInvoices.length === 0 ? (
               <div className="flex-1 flex items-center justify-center">
                 <div className="text-center">
                   <h3 className="text-sm font-medium text-gray-900">
                     {filter === 'all' ? 'No invoices found' : `No ${filter} invoices found`}
                   </h3>
                   <p className="text-sm text-gray-500">
                     {filter === 'all' ? 'Ask the AI to show your invoices.' : 'Try selecting a different filter.'}
                   </p>
                 </div>
               </div>
             ) : (
               <div className="flex-1 overflow-hidden">
                 <div className="relative h-full">
                   <div 
                     className="flex transition-transform duration-300 ease-in-out h-full"
                     style={{ 
                       transform: `translateX(-${currentSlide * (100 / Math.ceil(filteredInvoices.length / slidesPerView))}%)`,
                       width: `${Math.ceil(filteredInvoices.length / slidesPerView) * 100}%`
                     }}
                   >
                                          {Array.from({ length: Math.ceil(filteredInvoices.length / slidesPerView) }, (_, slideIndex) => {
                       const slideInvoices = filteredInvoices.slice(slideIndex * slidesPerView, (slideIndex + 1) * slidesPerView);
                       const slideTotal = slideInvoices.reduce((sum, inv) => sum + parseFloat(inv.TotalAmt || 0), 0);
                       const slideUnpaid = slideInvoices.filter(inv => parseFloat(inv.Balance || 0) > 0);
                       const slideUnpaidAmount = slideUnpaid.reduce((sum, inv) => sum + parseFloat(inv.Balance || 0), 0);
                       
                       return (
                         <div 
                           key={slideIndex}
                           className="flex-shrink-0 w-full flex flex-col h-full pr-4"
                           style={{ width: `${100 / Math.ceil(filteredInvoices.length / slidesPerView)}%` }}
                         >
                           {/* Invoice Grid */}
                           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 flex-1">
                                                          {slideInvoices.map((invoice) => (
                               <div
                                 key={invoice.Id}
                                 className="invoice-card relative h-40 flex flex-col justify-between transform hover:scale-105 transition-transform duration-200"
                               >
                                 {/* Selection checkbox */}
                                 <div className="absolute top-2 left-2 z-10">
                                   <input
                                     type="checkbox"
                                     checked={selectedInvoices.has(invoice.Id)}
                                     onChange={(e) => handleSelectInvoice(invoice, e)}
                                     className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                   />
                                 </div>
                                 
                                 {/* Delete button */}
                                 <div className="absolute top-2 right-2 z-10">
                                   <button
                                     onClick={(e) => handleDeleteSingle(invoice, e)}
                                     className="p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-full transition-colors"
                                     title="Delete invoice"
                                   >
                                     <Trash2 className="w-4 h-4" />
                                   </button>
                                 </div>
                                 
                                 {/* Clickable area for selection */}
                                 <div 
                                   onClick={() => onInvoiceSelect(invoice)}
                                   className="flex-1 cursor-pointer p-3 pt-8"
                                 >
                                   <div className="flex items-center justify-between mb-2">
                                     <h4 className="text-sm font-medium text-gray-900 truncate">
                                       #{invoice.DocNumber}
                                     </h4>
                                     {renderStatusBadge(invoice)}
                                   </div>
                                   <p className="text-sm text-gray-600 mb-2 truncate">
                                     {invoice.CustomerRef?.name || 'Unknown Customer'}
                                   </p>
                                   <div className="mb-2">
                                     <div className="text-lg font-semibold text-gray-900">
                                       {formatCurrency(invoice.TotalAmt)}
                                     </div>
                                     <div className="text-xs text-gray-500 mt-1">
                                       Due Date: {formatDate(invoice.DueDate)}
                                     </div>
                                   </div>
                                   
                                   <div className="mt-auto">
                                     {parseFloat(invoice.Balance || 0) > 0 ? (
                                       <div className="border-t border-gray-100 pt-1">
                                         <span className="text-xs text-red-600 font-medium">
                                           Balance: {formatCurrency(invoice.Balance)}
                                         </span>
                                       </div>
                                     ) : (
                                       <div className="border-t border-gray-100 pt-1">
                                         <span className="text-xs text-green-600 font-medium">
                                           Fully Paid
                                         </span>
                                       </div>
                                     )}
                                   </div>
                                 </div>
                               </div>
                             ))}
                           </div>
                           
                           {/* Slide Summary */}
                           <div className="mt-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
                             <h4 className="text-sm font-semibold text-gray-900 mb-3">Slide Summary</h4>
                             <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                               <div className="text-center">
                                 <p className="text-gray-600 mb-1">Invoices</p>
                                 <p className="text-lg font-semibold text-gray-900">{slideInvoices.length}</p>
                               </div>
                               <div className="text-center">
                                 <p className="text-gray-600 mb-1">Total Value</p>
                                 <p className="text-lg font-semibold text-blue-600">{formatCurrency(slideTotal)}</p>
                               </div>
                               <div className="text-center">
                                 <p className="text-gray-600 mb-1">Unpaid Count</p>
                                 <p className="text-lg font-semibold text-red-600">{slideUnpaid.length}</p>
                               </div>
                               <div className="text-center">
                                 <p className="text-gray-600 mb-1">Unpaid Amount</p>
                                 <p className="text-lg font-semibold text-red-600">{formatCurrency(slideUnpaidAmount)}</p>
                               </div>
                             </div>
                           </div>
                         </div>
                       );
                     })}
                  </div>
                </div>
              </div>
            )}
            
                         {/* Slider Indicators */}
             {filteredInvoices.length > slidesPerView && (
               <div className="flex justify-center mt-4 space-x-2">
                 {Array.from({ length: Math.ceil(filteredInvoices.length / slidesPerView) }, (_, index) => (
                   <button
                     key={index}
                     onClick={() => setCurrentSlide(index)}
                     className={`w-2 h-2 rounded-full transition-colors ${
                       index === currentSlide ? 'bg-blue-600' : 'bg-gray-300'
                     }`}
                   />
                 ))}
               </div>
             )}
          </div>
        )}

        {/* Invoice List View */}
        {view === 'list' && (
          <div className="h-full flex flex-col">
            {/* Filter Options */}
            <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-200">
              <div className="flex items-center space-x-1">
                <div className="flex items-center space-x-2 mr-4">
                  <input
                    type="checkbox"
                    checked={filteredInvoices.length > 0 && selectedInvoices.size === filteredInvoices.length}
                    onChange={handleSelectAll}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-600">Select All</span>
                </div>
                <span className="text-sm font-medium text-gray-700 mr-2">Filter:</span>
                <button
                  onClick={() => setFilter('all')}
                  className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                    filter === 'all' 
                      ? 'bg-blue-100 text-blue-700 border border-blue-200' 
                      : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setFilter('paid')}
                  className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                    filter === 'paid' 
                      ? 'bg-green-100 text-green-700 border border-green-200' 
                      : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                  }`}
                >
                  Paid
                </button>
                <button
                  onClick={() => setFilter('unpaid')}
                  className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                    filter === 'unpaid' 
                      ? 'bg-red-100 text-red-700 border border-red-200' 
                      : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                  }`}
                >
                  Unpaid
                </button>
                <button
                  onClick={() => setFilter('overdue')}
                  className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                    filter === 'overdue' 
                      ? 'bg-yellow-100 text-yellow-700 border border-yellow-200' 
                      : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                  }`}
                >
                  Overdue
                </button>
              </div>
              <span className="text-sm text-gray-500">
                {filteredInvoices.length} of {invoices.length} invoices
              </span>
            </div>
            
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {forceSliderView?.searchQuery ? 'Search Results' :
                   filter === 'all' ? 'Recent Invoices' : 
                   filter === 'paid' ? 'Paid Invoices' :
                   filter === 'unpaid' ? 'Unpaid Invoices' : 'Overdue Invoices'}
                </h3>
                {forceSliderView?.searchQuery && (
                  <p className="text-sm text-gray-500 mt-1">
                    Showing results for: "{forceSliderView.searchQuery}"
                  </p>
                )}
              </div>
            </div>
            
            {filteredInvoices.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <h3 className="text-sm font-medium text-gray-900">
                    {filter === 'all' ? 'No invoices found' : `No ${filter} invoices found`}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {filter === 'all' ? 'Ask the AI to show your invoices.' : 'Try selecting a different filter.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-2 scrollbar-thin">
                {filteredInvoices.map((invoice) => (
                  <div
                    key={invoice.Id}
                    className="invoice-card relative"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          checked={selectedInvoices.has(invoice.Id)}
                          onChange={(e) => handleSelectInvoice(invoice, e)}
                          className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <h4 
                          onClick={() => onInvoiceSelect(invoice)}
                          className="text-sm font-medium text-gray-900 cursor-pointer hover:text-blue-600"
                        >
                          Invoice #{invoice.DocNumber}
                        </h4>
                      </div>
                      <div className="flex items-center space-x-2">
                        {renderStatusBadge(invoice)}
                        <button
                          onClick={(e) => handleDeleteSingle(invoice, e)}
                          className="p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-full transition-colors"
                          title="Delete invoice"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600">{invoice.CustomerRef?.name || 'Unknown Customer'}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-lg font-semibold text-gray-900">{formatCurrency(invoice.TotalAmt)}</span>
                      <span className="text-sm text-gray-500">{formatDate(invoice.TxnDate)}</span>
                    </div>
                    {parseFloat(invoice.Balance || 0) > 0 && (
                      <div className="mt-1">
                        <span className="text-xs text-red-600">Balance: {formatCurrency(invoice.Balance)}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Analytics View */}
        {view === 'analytics' && analytics && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Business Analytics</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm font-medium text-blue-600">Total Revenue</p>
                <p className="text-2xl font-semibold text-blue-900">{formatCurrency(analytics.totalRevenue)}</p>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm font-medium text-green-600">Paid Revenue</p>
                <p className="text-2xl font-semibold text-green-900">{formatCurrency(analytics.paidRevenue)}</p>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm font-medium text-yellow-600">Unpaid ({analytics.unpaidCount})</p>
                <p className="text-2xl font-semibold text-yellow-900">{formatCurrency(analytics.unpaidAmount)}</p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm font-medium text-red-600">Overdue ({analytics.overdueCount})</p>
                <p className="text-2xl font-semibold text-red-900">{formatCurrency(analytics.overdueAmount)}</p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 col-span-2">
                <p className="text-sm font-medium text-gray-600">Total Invoices</p>
                <p className="text-2xl font-semibold text-gray-900">{analytics.totalInvoices}</p>
              </div>
            </div>
            
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-900 mb-2">Payment Status Overview</h4>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Paid Invoices</span>
                  <span className="text-sm font-medium">{analytics.totalInvoices - analytics.unpaidCount}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Unpaid Invoices</span>
                  <span className="text-sm font-medium text-yellow-600">{analytics.unpaidCount}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Overdue Invoices</span>
                  <span className="text-sm font-medium text-red-600">{analytics.overdueCount}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Detail View */}
        {view === 'detail' && selectedInvoice && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Invoice Details</h3>
              <button
                onClick={() => setView('slider')}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                ← Back to Slider
              </button>
            </div>
            
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-xl font-semibold text-gray-900">
                  Invoice #{selectedInvoice.DocNumber}
                </h4>
                {renderStatusBadge(selectedInvoice)}
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-600">Customer</p>
                  <p className="font-medium">{selectedInvoice.CustomerRef?.name || 'Unknown'}</p>
                </div>
                <div>
                  <p className="text-gray-600">Total Amount</p>
                  <p className="font-medium text-lg">{formatCurrency(selectedInvoice.TotalAmt)}</p>
                </div>
                <div>
                  <p className="text-gray-600">Date</p>
                  <p className="font-medium">{formatDate(selectedInvoice.TxnDate)}</p>
                </div>
                <div>
                  <p className="text-gray-600">Due Date</p>
                  <p className="font-medium">{formatDate(selectedInvoice.DueDate)}</p>
                </div>
                <div>
                  <p className="text-gray-600">Balance</p>
                  <p className="font-medium">{formatCurrency(selectedInvoice.Balance || 0)}</p>
                </div>
                <div>
                  <p className="text-gray-600">Email</p>
                  <p className="font-medium">{selectedInvoice.BillEmail?.Address || 'N/A'}</p>
                </div>
              </div>
              
              {selectedInvoice.Line && selectedInvoice.Line.length > 0 && (
                <div className="mt-6">
                  <h5 className="text-sm font-medium text-gray-900 mb-2">Line Items</h5>
                  <div className="border border-gray-200 rounded-md overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Qty</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Rate</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {selectedInvoice.Line.filter(line => line.DetailType === 'SalesItemLineDetail').map((line, index) => (
                          <tr key={index}>
                            <td className="px-3 py-2 text-sm text-gray-900">
                              {line.SalesItemLineDetail?.ItemRef?.name || 'Item'}
                            </td>
                            <td className="px-3 py-2 text-sm text-gray-900">
                              {line.SalesItemLineDetail?.Qty || 1}
                            </td>
                            <td className="px-3 py-2 text-sm text-gray-900">
                              {formatCurrency(line.SalesItemLineDetail?.UnitPrice || 0)}
                            </td>
                            <td className="px-3 py-2 text-sm text-gray-900">
                              {formatCurrency(line.Amount || 0)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={showDeleteModal}
        onClose={cancelDelete}
        onConfirm={executeDelete}
        invoices={invoicesToDelete}
        isDeleting={isDeleting}
      />
    </div>
  );
};

export default InvoicePanel; 