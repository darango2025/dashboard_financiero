const jwt = require('jsonwebtoken');

const SECRET = process.env.SESSION_SECRET || 'naprolab_financial_dashboard_secret_2026';

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
  
  if (username === 'naprolab' && password === 'naprolab') {
    const token = jwt.sign(
      { username, exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) },
      SECRET
    );
    
    return res.json({
      success: true,
      token,
      message: 'Login exitoso'
    });
  }
  
  res.status(401).json({
    success: false,
    message: 'Credenciales inválidas'
  });
};
