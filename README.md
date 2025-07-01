# QuickBooks OAuth Backend Setup

This is a complete backend implementation for QuickBooks OAuth integration with invoice management capabilities.

## Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `env.example` to `.env` and fill in your QuickBooks credentials:

```bash
cp env.example .env
```

Edit `.env` with your actual values:
```bash
QUICKBOOKS_CLIENT_ID=your_quickbooks_client_id_here
QUICKBOOKS_CLIENT_SECRET=your_quickbooks_client_secret_here
QUICKBOOKS_REDIRECT_URI=http://localhost:3000/auth/callback
QUICKBOOKS_ENVIRONMENT=sandbox
PORT=3000
SESSION_SECRET=your_session_secret_here
```

### 3. Get QuickBooks API Credentials

1. Go to [Intuit Developer Portal](https://developer.intuit.com/)
2. Create a new app or use existing one
3. Get your Client ID and Client Secret
4. Add `http://localhost:3000/auth/callback` to your app's redirect URIs

### 4. Run the Server
```bash
npm start
```

For development with auto-restart:
```bash
npm run dev
```

## API Endpoints

### OAuth Flow
- `GET /auth/quickbooks` - Initiate OAuth flow
- `GET /auth/callback` - Handle OAuth callback
- `POST /auth/disconnect` - Disconnect from QuickBooks

### QuickBooks API Operations
- `GET /api/company` - Get company information
- `GET /api/invoices` - Get invoices (max 100, ordered by date)
- `POST /api/invoices` - Create new invoice
- `GET /api/status` - Check connection status

## OAuth Flow Process

1. **Initiate**: User visits `/auth/quickbooks`
2. **Authorize**: User authorizes on QuickBooks
3. **Callback**: QuickBooks redirects to `/auth/callback` with auth code
4. **Token Exchange**: Backend exchanges code for access/refresh tokens
5. **API Access**: Use tokens to make QuickBooks API calls

## Features

- ✅ Complete OAuth 2.0 flow
- ✅ Automatic token refresh
- ✅ Session management
- ✅ Error handling
- ✅ Company info retrieval
- ✅ Invoice management (read/create)
- ✅ Connection status checking
- ✅ Disconnect functionality

## Security Notes

- Tokens are stored in memory cache (use database in production)
- Session secret should be strong and unique
- Enable HTTPS in production
- Set `secure: true` for session cookies in production

## Testing the OAuth Flow

1. Start the server: `npm start`
2. Visit: `http://localhost:3000/auth/quickbooks`
3. Complete QuickBooks authorization
4. You'll be redirected to dashboard with success message
5. Test API endpoints using tools like Postman or curl

## Example API Usage

```bash
# Check connection status
curl http://localhost:3000/api/status

# Get company info
curl http://localhost:3000/api/company

# Get invoices
curl http://localhost:3000/api/invoices

# Create invoice (POST with JSON body)
curl -X POST http://localhost:3000/api/invoices \
  -H "Content-Type: application/json" \
  -d '{"Line": [{"Amount": 100.00, "DetailType": "SalesItemLineDetail"}]}'
``` 