const sessions = require('./sessions');

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session-Id');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  const sessionId = req.headers['x-session-id'];
  
  if (!sessionId || !sessions.has(sessionId)) {
    return res.status(401).json({ authenticated: false });
  }
  
  const session = sessions.get(sessionId);
  session.lastActivity = new Date().toISOString();
  
  res.json({
    authenticated: true,
    username: session.username
  });
};
