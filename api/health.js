module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
};
