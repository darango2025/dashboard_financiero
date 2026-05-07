const { verifyToken } = require('./auth');

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  const decoded = verifyToken(req);
  
  if (!decoded) {
    return res.status(401).json({ authenticated: false });
  }
  
  res.json({
    authenticated: true,
    username: decoded.username
  });
};
