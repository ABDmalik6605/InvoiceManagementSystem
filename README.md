# Invoice Management AI - Full Stack Application

This is a complete full-stack application for AI-powered invoice management with QuickBooks integration, featuring a dual-panel React.js frontend and Node.js backend with AI capabilities.

## 🚀 Features

### Backend (Node.js + Express)
- ✅ Complete QuickBooks OAuth 2.0 integration
- ✅ AI-powered natural language interface (OpenAI + Vercel AI SDK)
- ✅ Comprehensive invoice management API
- ✅ Automatic token refresh and session management
- ✅ Business analytics and insights
- ✅ Multi-step AI tool execution
- ✅ Real-time chat streaming

### Frontend (React.js)
- ✅ **Dual-Panel Interface**: AI Chat + Invoice Data
- ✅ **Real-time AI Chat**: Natural language business queries
- ✅ **Interactive Analytics**: Revenue, unpaid amounts, overdue tracking
- ✅ **Modern UI**: TailwindCSS with responsive design
- ✅ **Live Data Sync**: Real-time updates between chat and data panels

## 🎯 Complete Setup Instructions

### Prerequisites
- Node.js 16+ installed
- QuickBooks Developer account and app credentials
- OpenAI API key

### 1. Clone and Setup Backend

```bash
# Install backend dependencies
npm install

# Configure environment variables
cp env.example .env
```

Edit `.env` with your credentials:
```bash
QUICKBOOKS_CLIENT_ID=your_quickbooks_client_id_here
QUICKBOOKS_CLIENT_SECRET=your_quickbooks_client_secret_here
QUICKBOOKS_REDIRECT_URI=http://localhost:3000/auth/callback
QUICKBOOKS_ENVIRONMENT=sandbox
OPENAI_API_KEY=your_openai_api_key_here
PORT=3000
SESSION_SECRET=your_session_secret_here
```

### 2. Setup Frontend

```bash
# Navigate to client directory
cd client

# Install frontend dependencies
npm install
```

### 3. Get API Credentials

#### QuickBooks API:
1. Go to [Intuit Developer Portal](https://developer.intuit.com/)
2. Create a new app or use existing one
3. Get your Client ID and Client Secret
4. Add `http://localhost:3000/auth/callback` to your app's redirect URIs

#### OpenAI API:
1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Create an API key
3. Add it to your `.env` file

### 4. Run the Application

#### Start Backend (Terminal 1):
```bash
# From project root
npm start
```
Backend will run on `http://localhost:3000`

#### Start Frontend (Terminal 2):
```bash
# From project root
cd client
npm start
```
Frontend will run on `http://localhost:3001`

### 5. Authenticate with QuickBooks

1. Open `http://localhost:3001` in your browser
2. Click "Connect to QuickBooks" 
3. Complete the OAuth flow
4. Start using the AI assistant!

## 🎨 Application Architecture

### Backend API Structure
```
server.js (Node.js + Express)
├── QuickBooks OAuth Integration
├── AI Tools (Vercel AI SDK)
│   ├── getInvoices
│   ├── getInvoiceById
│   ├── createInvoice
│   ├── getCustomers
│   ├── getCompanyInfo
│   ├── searchInvoices
│   └── analyzeInvoices
├── API Endpoints
│   ├── /auth/* (OAuth flow)
│   ├── /api/invoices
│   ├── /api/company
│   ├── /api/ai/chat
│   └── /api/ai/chat/stream
└── Token Management
```

### Frontend Component Structure
```
client/src/
├── App.js (Main dual-panel layout)
├── components/
│   ├── ChatPanel.js (AI chat interface)
│   ├── InvoicePanel.js (Invoice data display)
│   ├── Header.js (App header)
│   └── AuthStatus.js (Authentication indicator)
├── utils/
│   └── api.js (API utilities)
└── index.css (TailwindCSS styles)
```

## 💬 Using the AI Assistant

### Example Queries
- **"Show me my recent invoices"** - Lists recent invoices
- **"What's my total revenue?"** - Displays revenue analytics
- **"Find all unpaid invoices"** - Filters unpaid invoices
- **"Analyze my business performance"** - Shows comprehensive analytics
- **"Get customer information"** - Lists customers
- **"Show invoices over $1000"** - Advanced filtering
- **"Which invoices are overdue?"** - Identifies overdue payments

### AI Capabilities
- **Natural Language Processing**: Ask questions in plain English
- **Multi-step Operations**: AI can chain multiple tools together
- **Business Analytics**: Revenue analysis, payment tracking, customer insights
- **Real-time Updates**: Invoice panel updates automatically based on chat actions
- **Tool Execution Tracking**: See which tools the AI used to answer your questions

## 🔧 API Endpoints

### Authentication
- `GET /auth/quickbooks` - Initiate OAuth flow
- `GET /auth/callback` - Handle OAuth callback
- `POST /auth/disconnect` - Disconnect from QuickBooks
- `GET /api/status` - Check connection status

### QuickBooks Data
- `GET /api/company` - Get company information
- `GET /api/invoices` - Get invoices with filtering
- `GET /api/invoices/:id` - Get specific invoice
- `POST /api/invoices` - Create new invoice
- `GET /api/bulk-data` - Get comprehensive business data

### AI Interface
- `POST /api/ai/chat` - Natural language chat
- `POST /api/ai/chat/stream` - Streaming chat responses
- `GET /api/ai/context` - Get AI context data

## 🎯 Development Workflow

### Testing the AI Chat
```bash
# Test backend AI endpoint
curl -X POST http://localhost:3000/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Show me my recent invoices", "sessionId": "test"}'

# Test frontend
# Open http://localhost:3001 and use the chat interface
```

### Making Changes
1. **Backend Changes**: Server auto-restarts with nodemon
2. **Frontend Changes**: React hot-reloads automatically
3. **Styling**: TailwindCSS classes are available throughout
4. **New AI Tools**: Add to `invoiceTools` object in server.js

## 🔒 Security Notes

- Tokens stored in memory cache (use database in production)
- Session secret should be strong and unique
- Enable HTTPS in production
- Set `secure: true` for session cookies in production
- Keep OpenAI API key secure and never commit to version control

## 🚀 Production Deployment

### Backend
```bash
npm run build  # If using TypeScript
npm start      # Production mode
```

### Frontend
```bash
cd client
npm run build  # Creates optimized build/
# Deploy build/ folder to your hosting platform
```

## 📝 Project Structure

```
Invoice Management/
├── server.js                 # Backend server with AI integration
├── package.json              # Backend dependencies
├── env.example               # Environment variables template
├── README.md                 # This file
├── client/                   # React frontend
│   ├── src/
│   │   ├── App.js           # Main application
│   │   ├── components/      # React components
│   │   ├── utils/           # API utilities
│   │   └── index.css        # Styles
│   ├── package.json         # Frontend dependencies
│   └── README.md            # Frontend documentation
└── test-request.json        # API testing file
```

## 🎉 Success! You Now Have:

- **🤖 AI-Powered Interface**: Ask questions about your business in natural language
- **📊 Real-time Analytics**: Live business insights and performance tracking
- **🔄 QuickBooks Sync**: Seamless integration with your accounting data
- **💬 Dual-Panel UI**: Chat with AI while viewing invoice data
- **📱 Modern Design**: Responsive, professional interface
- **🔧 Full API Access**: Complete programmatic control over your invoice data

Start exploring your business data with natural language queries! 