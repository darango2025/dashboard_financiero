/**
 * lib/syncOrchestrator.js — Comprehensive RSales data synchronization
 * Fetches ALL available endpoints and stores aggregated data
 */

const fs = require('fs');
const path = require('path');
const rsales = require('./rsales');
const { transformRsalesToDashboard } = require('./dataTransformer');

const CACHE_DIR = path.join(__dirname, '..', 'api');
const MASTER_DATA_FILE = path.join(CACHE_DIR, 'master_data.json');

let masterData = null;
let lastSyncTime = null;

async function syncAllEndpoints() {
  console.log('[Orchestrator] Starting comprehensive sync...');
  const startTime = Date.now();
  const syncLog = [];

  const endpoints = [
    { name: 'receivables', fn: () => rsales.getAllReceivables() },
    { name: 'customers', fn: () => rsales.getAllCustomers() },
    { name: 'sellers', fn: () => rsales.getAllSellers() },
    { name: 'orders', fn: () => rsales.getAllOrders() },
    { name: 'stocks', fn: () => rsales.getAllStocks() },
    { name: 'products', fn: () => rsales.getAllProducts() },
    { name: 'prices', fn: () => rsales.getAllPrices() },
    { name: 'routes', fn: () => rsales.getAllRoutes() },
    { name: 'payment_methods', fn: () => rsales.getAllPaymentMethods() },
    { name: 'factors', fn: () => rsales.getAllFactors() }
  ];

  const results = {};

  for (const endpoint of endpoints) {
    try {
      console.log(`[Orchestrator] Syncing ${endpoint.name}...`);
      const data = await endpoint.fn();
      results[endpoint.name] = data;
      syncLog.push({ endpoint: endpoint.name, count: Array.isArray(data) ? data.length : 0, status: 'ok' });
      console.log(`[Orchestrator] ✓ ${endpoint.name}: ${Array.isArray(data) ? data.length : 0} records`);
    } catch (err) {
      console.error(`[Orchestrator] ✗ ${endpoint.name}: ${err.message}`);
      syncLog.push({ endpoint: endpoint.name, count: 0, status: 'error', error: err.message });
      results[endpoint.name] = [];
    }
  }

  // Build enhanced dashboard data
  const dashboardData = buildEnhancedDashboard(results);

  // Save master data
  masterData = {
    syncTime: new Date().toISOString(),
    duration: Date.now() - startTime,
    syncLog,
    raw: results,
    dashboard: dashboardData
  };

  // Persist to disk for cold starts
  try {
    fs.writeFileSync(MASTER_DATA_FILE, JSON.stringify(masterData, null, 2));
    console.log(`[Orchestrator] Master data saved (${(fs.statSync(MASTER_DATA_FILE).size / 1024).toFixed(0)} KB)`);
  } catch (err) {
    console.warn('[Orchestrator] Could not save master data:', err.message);
  }

  lastSyncTime = Date.now();
  console.log(`[Orchestrator] Sync completed in ${masterData.duration}ms`);
  return masterData;
}

function buildEnhancedDashboard(results) {
  const { receivables = [], customers = [], sellers = [], orders = [], 
          stocks = [], products = [], prices = [], routes = [], 
          payment_methods = [], factors = [] } = results;

  // Base dashboard from receivables
  const base = transformRsalesToDashboard(receivables, customers, sellers);

  // Enhance with additional data
  return {
    ...base,
    generated_at: new Date().toISOString(),
    source: 'rsales',
    version: '2.0',

    // Extended modules
    customers_full: customers.map(c => ({
      codigo: c.code || c.client_code,
      nombre: c.name || c.business_name || c.code,
      nit: c.nit || c.identification || '',
      ciudad: c.city || '',
      direccion: c.address || '',
      telefono: c.phone || '',
      email: c.email || '',
      estado: c.state || '',
      latitud: c.latitude || null,
      longitud: c.longitude || null,
      cartera_saldo: receivables
        .filter(r => r.client_code === (c.code || c.client_code))
        .reduce((s, r) => s + (r.balance || 0), 0),
      cartera_documentos: receivables
        .filter(r => r.client_code === (c.code || c.client_code)).length
    })).sort((a, b) => b.cartera_saldo - a.cartera_saldo),

    sellers_full: sellers.map(s => {
      const sellerCode = s.code || s.seller_code;
      const sellerReceivables = receivables.filter(r => r.seller_code === sellerCode);
      const sellerOrders = orders.filter(o => o.seller_code === sellerCode);
      return {
        codigo: sellerCode,
        nombre: s.name || s.full_name || sellerCode,
        email: s.email || '',
        telefono: s.phone || '',
        estado: s.state || '',
        cartera_total: sellerReceivables.reduce((sum, r) => sum + (r.balance || 0), 0),
        cartera_vencida: sellerReceivables
          .filter(r => r.due_date && new Date(r.due_date) < new Date())
          .reduce((sum, r) => sum + (r.balance || 0), 0),
        documentos: sellerReceivables.length,
        pedidos: sellerOrders.length,
        ventas_total: sellerOrders.reduce((sum, o) => sum + (o.total || 0), 0)
      };
    }).sort((a, b) => b.cartera_total - a.cartera_total),

    products: products.map(p => ({
      codigo: p.code || p.product_code,
      nombre: p.name || p.description || p.code,
      categoria: p.category || '',
      unidad: p.unit || '',
      precio: prices.find(pr => pr.product_code === (p.code || p.product_code))?.price || 0,
      stock: stocks.find(st => st.product_code === (p.code || p.product_code))?.quantity || 0,
      estado: p.state || ''
    })),

    inventory: stocks.map(st => ({
      producto_codigo: st.product_code,
      producto_nombre: products.find(p => (p.code || p.product_code) === st.product_code)?.name || st.product_code,
      bodega: st.warehouse_code || '',
      cantidad: st.quantity || 0,
      disponible: st.available || st.quantity || 0,
      valor: (st.quantity || 0) * (prices.find(pr => pr.product_code === st.product_code)?.price || 0)
    })).filter(i => i.cantidad > 0),

    orders_summary: {
      total: orders.length,
      total_valor: orders.reduce((s, o) => s + (o.total || 0), 0),
      por_estado: orders.reduce((acc, o) => {
        const state = o.state || 'PENDIENTE';
        acc[state] = (acc[state] || 0) + 1;
        return acc;
      }, {}),
      por_mes: orders.reduce((acc, o) => {
        const date = o.created_at ? new Date(o.created_at) : new Date();
        const mes = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!acc[mes]) acc[mes] = { count: 0, valor: 0 };
        acc[mes].count++;
        acc[mes].valor += o.total || 0;
        return acc;
      }, {})
    },

    routes: routes.map(r => ({
      codigo: r.code || r.route_code,
      nombre: r.name || r.description || r.code,
      vendedor: r.seller_code || '',
      dia: r.day || '',
      frecuencia: r.frequency || '',
      clientes: r.clients?.length || 0,
      estado: r.state || ''
    })),

    payment_methods: payment_methods.map(pm => ({
      codigo: pm.code || pm.payment_method_code,
      nombre: pm.name || pm.description || pm.code,
      tipo: pm.type || '',
      estado: pm.state || ''
    })),

    factors: factors.map(f => ({
      codigo: f.code || f.factor_code,
      nombre: f.name || f.description || f.code,
      valor: f.value || 0,
      tipo: f.type || '',
      estado: f.state || ''
    })),

    // Metadata
    metadata: {
      total_records: {
        receivables: receivables.length,
        customers: customers.length,
        sellers: sellers.length,
        orders: orders.length,
        products: products.length,
        stocks: stocks.length,
        prices: prices.length,
        routes: routes.length
      },
      sync_timestamp: new Date().toISOString()
    }
  };
}

function getMasterData() {
  if (masterData) return masterData;
  
  // Try to load from disk
  try {
    if (fs.existsSync(MASTER_DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(MASTER_DATA_FILE, 'utf-8'));
      masterData = data;
      console.log('[Orchestrator] Loaded master data from disk');
      return data;
    }
  } catch (err) {
    console.warn('[Orchestrator] Could not load master data:', err.message);
  }
  
  return null;
}

function getDashboardData() {
  const md = getMasterData();
  return md?.dashboard || null;
}

function invalidateCache() {
  masterData = null;
  try {
    if (fs.existsSync(MASTER_DATA_FILE)) {
      fs.unlinkSync(MASTER_DATA_FILE);
    }
  } catch (err) {
    console.warn('[Orchestrator] Could not delete cache file:', err.message);
  }
  console.log('[Orchestrator] Cache invalidated');
}

module.exports = {
  syncAllEndpoints,
  getMasterData,
  getDashboardData,
  invalidateCache
};