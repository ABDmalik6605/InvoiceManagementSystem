const cors = require('cors');

// CORS middleware configuration
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' ? process.env.FRONTEND_URL : true,
  credentials: true
};

module.exports = cors(corsOptions); 