/**
 * api/sync/rsales.js — Endpoint para sincronizar datos desde RSales API
 */

const { verifyToken } = require('../auth');
const rsales = require('../../lib/rsales');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const decoded = verifyToken(req);
  if (!decoded) return res.status(401).json({ error: 'No autorizado' });

  // GET /api/sync/rsales/status - Verificar conectividad
  if (req.method === 'GET' && req.url.includes('/status')) {
    try {
      const token = await rsales.getToken();
      return res.json({
        success: true,
        connected: true,
        message: 'Conexión exitosa con RSales API',
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        connected: false,
        error: err.message
      });
    }
  }

  // POST /api/sync/rsales - Sincronizar datos
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { entity } = req.body || {}; // entity: 'receivables', 'orders', 'customers', 'sellers', 'all'

  try {
    let result = {};

    switch (entity) {
      case 'receivables':
        result.data = await rsales.getAllReceivables();
        result.count = result.data.length;
        break;
      
      case 'orders':
        result.data = await rsales.getAllOrders();
        result.count = result.data.length;
        break;
      
      case 'customers':
        result.data = await rsales.getAllCustomers();
        result.count = result.data.length;
        break;
      
      case 'sellers':
        result.data = await rsales.getAllSellers();
        result.count = result.data.length;
        break;
      
      case 'all':
      default:
        result = await rsales.syncAllData();
        break;
    }

    res.json({
      success: true,
      entity: entity || 'all',
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[RSales Sync]', err.message);
    res.status(500).json({
      error: 'Error sincronizando con RSales',
      details: err.message
    });
  }
};