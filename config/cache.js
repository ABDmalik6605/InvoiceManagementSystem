const NodeCache = require('node-cache');

// Token cache (in production, use a database)
const tokenCache = new NodeCache({ stdTTL: 3600 }); // 1 hour TTL

module.exports = { tokenCache }; 