/**
 * api/sync/rsales.js — Comprehensive sync endpoint
 * Supports: manual sync (POST), cron jobs (GET with ?cron=true), status check
 */

const { verifyToken } = require('../auth');
const orchestrator = require('../../lib/syncOrchestrator');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Allow cron jobs without auth
  const isCron = req.query.cron === 'true' || req.headers['x-vercel-cron'] === '1';
  
  if (!isCron) {
    const decoded = verifyToken(req);
    if (!decoded) return res.status(401).json({ error: 'No autorizado' });
  }

  // GET /api/sync/rsales?status=true — Health check
  if (req.method === 'GET' && req.query.status === 'true') {
    const master = orchestrator.getMasterData();
    return res.json({
      success: true,
      synced: !!master,
      lastSync: master?.syncTime || null,
      endpoints: master?.syncLog || [],
      timestamp: new Date().toISOString()
    });
  }

  // Sync operation
  try {
    const result = await orchestrator.syncAllEndpoints();
    res.json({
      success: true,
      message: 'Sincronización completada',
      duration: result.duration,
      endpoints: result.syncLog,
      timestamp: result.syncTime
    });
  } catch (err) {
    console.error('[Sync]', err.message);
    res.status(500).json({
      error: 'Error en sincronización',
      details: err.message
    });
  }
};