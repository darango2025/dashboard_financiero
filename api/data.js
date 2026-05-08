/**
 * api/data.js — Enhanced endpoint serving comprehensive RSales data
 */

const { verifyToken } = require('./auth');
const orchestrator = require('../lib/syncOrchestrator');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  const decoded = verifyToken(req);
  if (!decoded) return res.status(401).json({ error: 'No autorizado' });

  const forceRefresh = req.query.refresh === 'true';

  try {
    let data = orchestrator.getDashboardData();
    
    // If no data or force refresh, trigger sync
    if (!data || forceRefresh) {
      console.log('[Data] No cached data, triggering sync...');
      const master = await orchestrator.syncAllEndpoints();
      data = master.dashboard;
    }

    if (!data) {
      return res.status(503).json({ error: 'Datos no disponibles. Intente sincronizar.' });
    }

    res.json(data);
  } catch (err) {
    console.error('[Data] Error:', err.message);
    
    // Try stale data
    const stale = orchestrator.getDashboardData();
    if (stale) {
      return res.json({ ...stale, stale: true, error: err.message });
    }
    
    res.status(500).json({ error: 'Error obteniendo datos', details: err.message });
  }
};

module.exports.invalidateCache = orchestrator.invalidateCache;
module.exports.getDashboardData = orchestrator.getDashboardData;