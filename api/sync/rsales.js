/**
 * api/sync/rsales.js — Endpoint para sincronizar datos desde RSales API
 * Soporta Vercel Cron Jobs (GET) y manual sync (POST)
 */

const { verifyToken } = require('../auth');
const rsales = require('../../lib/rsales');
const dataModule = require('../data');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Para cron jobs (GET sin auth) permitimos si viene de Vercel
  const isCron = req.query.cron === 'true' || req.headers['x-vercel-cron'] === '1';
  
  if (!isCron) {
    const decoded = verifyToken(req);
    if (!decoded) return res.status(401).json({ error: 'No autorizado' });
  }

  // GET /api/sync/rsales?status=true - Verificar conectividad
  if (req.method === 'GET' && (req.query.status === 'true' || req.url.includes('/status'))) {
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

  // GET /api/sync/rsales?cron=true — Vercel Cron Job
  // POST /api/sync/rsales — Manual sync
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const entity = req.body?.entity || req.query?.entity || 'all';

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

    // Invalidar cache del endpoint de datos para forzar refresh
    if (dataModule.invalidateCache) {
      dataModule.invalidateCache();
    }

    // Pre-warm cache: fetch fresh data immediately
    let prewarm = null;
    try {
      if (dataModule.getDashboardData) {
        prewarm = await dataModule.getDashboardData(true);
        console.log('[Sync] Cache pre-warmed with fresh data');
      }
    } catch (warmErr) {
      console.warn('[Sync] Could not pre-warm cache:', warmErr.message);
    }

    res.json({
      success: true,
      entity: entity || 'all',
      ...result,
      prewarmed: !!prewarm,
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