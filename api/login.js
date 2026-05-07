const crypto = require('crypto');

const VALID_USER = 'naprolab';
const VALID_PASSWORD = 'naprolab';

const sessions = new Map();

function generateSessionId() {
  return crypto.randomBytes(16).toString('hex');
}

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { username, password } = req.body;
  
  if (username === VALID_USER && password === VALID_PASSWORD) {
    const sessionId = generateSessionId();
    sessions.set(sessionId, {
      username,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString()
    });
    
    return res.json({
      success: true,
      sessionId,
      message: 'Login exitoso'
    });
  }
  
  res.status(401).json({
    success: false,
    message: 'Credenciales inválidas'
  });
};
