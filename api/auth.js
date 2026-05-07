const jwt = require('jsonwebtoken');

const SECRET = process.env.SESSION_SECRET || 'naprolab_financial_dashboard_secret_2026';

function verifyToken(req) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  
  if (!token) {
    return null;
  }
  
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

module.exports = { verifyToken, SECRET };
