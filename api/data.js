/**
 * api/data.js — Endpoint que sirve los datos del dashboard desde RSales
 * Con cache en memoria para reducir llamadas a la API
 */

const { verifyToken } = require('./auth');
const rsales = require('../lib/rsales');
const { transformRsalesToDashboard } = require('../lib/dataTransformer');

// Cache en memoria (persiste mientras la función esté warm)
let cachedData = null;
let cachedAt = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora

async function getDashboardData(forceRefresh = false) {
  const now = Date.now();
  
  // Si tenemos cache fresco y no se fuerza refresh, lo usamos
  if (!forceRefresh && cachedData && cachedAt && (now - cachedAt) < CACHE_TTL_MS) {
    console.log('[Data] Returning cached data');
    return { ...cachedData, cached: true };
  }

  console.log('[Data] Fetching fresh data from RSales...');
  
  // Fetch datos de RSales
  const receivables = await rsales.getAllReceivables();
  
  // Opcionalmente fetch customers y sellers para nombres
  let customers = [];
  let sellers = [];
  try {
    customers = await rsales.getAllCustomers();
    sellers = await rsales.getAllSellers();
  } catch (err) {
    console.warn('[Data] Could not fetch customers/sellers:', err.message);
  }

  // Transformar
  const dashboardData = transformRsalesToDashboard(receivables, customers, sellers);
  
  // Guardar en cache
  cachedData = dashboardData;
  cachedAt = now;
  
  console.log(`[Data] Fresh data cached. Receivables: ${receivables.length}`);
  return dashboardData;
}

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
    const data = await getDashboardData(forceRefresh);
    res.json(data);
  } catch (err) {
    console.error('[Data] Error:', err.message);
    
    // Si hay cache stale, lo devolvemos como fallback
    if (cachedData) {
      console.log('[Data] Returning stale cache as fallback');
      return res.json({ ...cachedData, stale: true, error: err.message });
    }
    
    res.status(500).json({
      error: 'Error obteniendo datos',
      details: err.message
    });
  }
};

// Exportar para que el sync endpoint pueda invalidar cache
module.exports.invalidateCache = () => {
  cachedData = null;
  cachedAt = null;
  console.log('[Data] Cache invalidated');
};
module.exports.getDashboardData = getDashboardData;