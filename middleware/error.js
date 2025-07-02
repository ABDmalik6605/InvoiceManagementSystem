// Error handling middleware
const errorHandler = (error, req, res, next) => {
  console.error('Server error:', error);
  
  // Send error response
  res.status(error.status || 500).json({ 
    error: error.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
};

module.exports = { errorHandler }; 