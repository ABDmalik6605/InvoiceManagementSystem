# Invoice Management AI - React Frontend

This is the React.js frontend for the Invoice Management application with AI-powered natural language interface.

## Features

- **Dual-Panel Interface**: Chat with AI assistant on the left, invoice data on the right
- **Real-time AI Chat**: Natural language queries about your business data  
- **Invoice Management**: View, search, and analyze invoices
- **Business Analytics**: Revenue insights, unpaid amounts, overdue tracking
- **Responsive Design**: Modern UI with TailwindCSS
- **QuickBooks Integration**: Seamless data synchronization

## Setup Instructions

### Prerequisites
- Node.js 16+ installed
- Backend server running on port 3000
- QuickBooks authenticated

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the development server:**
   ```bash
   npm start
   ```

3. **Open your browser:**
   Navigate to `http://localhost:3001`

## Available Scripts

- `npm start` - Run the development server
- `npm run build` - Build for production
- `npm test` - Run tests
- `npm run eject` - Eject from Create React App (not recommended)

## Architecture

### Components
- **App.js** - Main application with dual-panel layout
- **ChatPanel.js** - AI chat interface with message handling
- **InvoicePanel.js** - Invoice data display with multiple views
- **Header.js** - Application header with branding
- **AuthStatus.js** - Authentication status indicator

### API Integration
- Uses axios for HTTP requests
- Proxy configured to backend on port 3000
- Real-time AI chat with tool execution tracking
- Error handling with user-friendly messages

### Styling
- TailwindCSS for modern, responsive design
- Custom components for invoices, chat, and analytics
- Smooth animations and transitions
- Mobile-responsive layout

## Usage

1. **Authentication**: The app will prompt you to connect to QuickBooks if not authenticated
2. **AI Chat**: Use the left panel to ask questions about your business:
   - "Show me recent invoices"
   - "What's my total revenue?"
   - "Find unpaid invoices"
   - "Analyze my business performance"
3. **Invoice Data**: The right panel displays:
   - Invoice list with status badges
   - Business analytics dashboard
   - Detailed invoice information
4. **Interactive**: Click on invoices or use AI to navigate between different views

## Development

### File Structure
```
src/
├── components/     # React components
├── utils/         # API utilities and helpers
├── App.js         # Main application
├── index.js       # React entry point
└── index.css      # Global styles with Tailwind
```

### Key Features
- Real-time chat with AI
- Automatic invoice data synchronization
- Error handling and loading states
- Responsive design for all screen sizes
- Status badges and formatting utilities

## Production Build

To create a production build:

```bash
npm run build
```

This creates a `build` folder with optimized static files ready for deployment. 