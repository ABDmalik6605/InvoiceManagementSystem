const express = require('express');
require('dotenv').config();

// Import middleware
const corsMiddleware = require('./middleware/cors');
const sessionMiddleware = require('./middleware/session');
const { errorHandler } = require('./middleware/error');

// Import routes
const authRoutes = require('./routes/auth');
const quickbooksRoutes = require('./routes/quickbooks');
const aiRoutes = require('./routes/ai');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware setup
app.use(corsMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware);

// Routes
app.use('/auth', authRoutes);
app.use('/api', quickbooksRoutes);
app.use('/api/ai', aiRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'QuickBooks AI-Powered Invoice Management Backend',
    description: 'Complete QuickBooks integration with AI-ready endpoints for dual-panel interface',
    version: '2.0.0',
    architecture: 'Modular Express.js with separated concerns',
    endpoints: {
      oauth: {
        connect: '/auth/quickbooks',
        callback: '/auth/callback',
        logout: 'POST /auth/logout'
      },
      quickbooks: {
        status: '/api/status',
        company: '/api/company',
        invoices: {
          list: 'GET /api/invoices',
          getById: 'GET /api/invoices/:id',
          getByNumber: 'GET /api/invoice/number/:docNumber',
          create: 'POST /api/invoices',
          void: 'DELETE /api/invoices/:id',
          permanentDelete: 'DELETE /api/invoices/:id/permanent-delete'
        },
        query: 'GET /api/query'
      },
      ai: {
        chat: 'POST /api/ai/chat',
        chatStream: 'POST /api/ai/chat/stream'
      }
    },
    features: [
      'Modular architecture with separated concerns',
      'QuickBooks OAuth 2.0 integration',
      'AI-powered natural language processing',
      'Invoice management and analytics',
      'Real-time chat interface',
      'Permanent delete and void operations'
    ],
    instructions: 'Visit /auth/quickbooks to start OAuth flow'
  });
});

// Dashboard endpoint
app.get('/dashboard', (req, res) => {
  res.json({
    message: 'Dashboard endpoint',
    status: 'Connected to QuickBooks OAuth backend',
    architecture: 'Modular structure implemented',
    nextSteps: 'Use the API endpoints to interact with QuickBooks'
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log('📁 Modular architecture implemented:');
  console.log('   ├── config/ - Configuration files');
  console.log('   ├── middleware/ - Express middleware');
  console.log('   ├── routes/ - API route handlers');
  console.log('   ├── services/ - Business logic');
  console.log('   ├── utils/ - Helper functions');
  console.log('   └── ai/ - AI tools and processing');
  console.log('');
  console.log('🔗 QuickBooks OAuth endpoints:');
  console.log(`   - Connect: http://localhost:${PORT}/auth/quickbooks`);
  console.log(`   - Callback: http://localhost:${PORT}/auth/callback`);
  console.log('');
  console.log('🤖 AI endpoints:');
  console.log(`   - Chat: POST http://localhost:${PORT}/api/ai/chat`);
  console.log(`   - Stream: POST http://localhost:${PORT}/api/ai/chat/stream`);
});

module.exports = app; 