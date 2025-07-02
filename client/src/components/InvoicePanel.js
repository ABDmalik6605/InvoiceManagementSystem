import React, { useState, useEffect } from 'react';
import { getInvoices, handleApiError, formatCurrency, formatDate, getInvoiceStatus } from '../utils/api';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const InvoicePanel = ({ selectedInvoice, refreshTrigger, onInvoiceSelect }) => {
  const [invoices, setInvoices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [view, setView] = useState('slider');
  const [currentSlide, setCurrentSlide] = useState(0);
  const [slidesPerView] = useState(6); // Number of invoices to show per slide
  const [filter, setFilter] = useState('all'); // Filter: 'all', 'paid', 'unpaid', 'overdue'

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Only call getInvoices - remove getBulkData call
        const invoicesData = await getInvoices({ limit: 50 });

        const invoiceList = invoicesData.QueryResponse?.Invoice || [];
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
  }, [refreshTrigger]);

  useEffect(() => {
    if (selectedInvoice) {
      setView('detail');
    }
  }, [selectedInvoice]);

  // Filter invoices based on current filter
  const filteredInvoices = invoices.filter(invoice => {
    if (filter === 'all') return true;
    const status = getInvoiceStatus(invoice);
    return status === filter;
  });

  // Reset slide when filter changes
  useEffect(() => {
    setCurrentSlide(0);
  }, [filter]);

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

      {/* Content */}
      <div className="flex-1 overflow-hidden p-4">
        {/* Invoice Slider View */}
        {view === 'slider' && (
          <div className="h-full flex flex-col">
            {/* Filter Options */}
            <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-200">
              <div className="flex items-center space-x-1">
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
              <h3 className="text-lg font-semibold text-gray-900">
                {filter === 'all' ? 'Recent Invoices' : 
                 filter === 'paid' ? 'Paid Invoices' :
                 filter === 'unpaid' ? 'Unpaid Invoices' : 'Overdue Invoices'}
              </h3>
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
                                 onClick={() => onInvoiceSelect(invoice)}
                                 className="invoice-card cursor-pointer h-40 flex flex-col justify-between transform hover:scale-105 transition-transform duration-200"
                               >
                                 <div className="flex-1">
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
              <h3 className="text-lg font-semibold text-gray-900">
                {filter === 'all' ? 'Recent Invoices' : 
                 filter === 'paid' ? 'Paid Invoices' :
                 filter === 'unpaid' ? 'Unpaid Invoices' : 'Overdue Invoices'}
              </h3>
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
                    onClick={() => onInvoiceSelect(invoice)}
                    className="invoice-card cursor-pointer"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="text-sm font-medium text-gray-900">Invoice #{invoice.DocNumber}</h4>
                      {renderStatusBadge(invoice)}
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
    </div>
  );
};

export default InvoicePanel; 