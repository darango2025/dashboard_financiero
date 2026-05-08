/**
 * lib/rsales.js — RSales API Connector
 * Maneja autenticación OAuth2 y requests a la API de RSales
 */

const RSALES_BASE_URL = process.env.RSALES_BASE_URL || 'https://api.ventasremotas.com/v1';
const RSALES_API_KEY = process.env.RSALES_API_KEY;
const RSALES_CLIENT_ID = process.env.RSALES_CLIENT_ID;
const RSALES_CLIENT_SECRET = process.env.RSALES_CLIENT_SECRET;

let cachedToken = null;
let tokenExpiry = null;

/**
 * Obtiene un token JWT de la API de RSales
 * El token tiene vigencia de 1 hora (3600 segundos)
 */
async function getToken() {
  // Si tenemos un token válido (con 5 minutos de margen), lo reutilizamos
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry - 5 * 60 * 1000) {
    return cachedToken;
  }

  if (!RSALES_API_KEY || !RSALES_CLIENT_ID || !RSALES_CLIENT_SECRET) {
    throw new Error('RSales credentials not configured');
  }

  const response = await fetch(`${RSALES_BASE_URL}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Subscription-Key': RSALES_API_KEY
    },
    body: JSON.stringify({
      client_id: RSALES_CLIENT_ID,
      client_secret: RSALES_CLIENT_SECRET
    })
  });

  const data = await response.json();

  if (!response.ok) {
    const errorMsg = data.errors?.[0]?.message || `HTTP ${response.status}`;
    throw new Error(`RSales auth failed: ${errorMsg}`);
  }

  cachedToken = data.access_token;
  // Calculamos expiry basado en expires_in (segundos)
  tokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;

  console.log('[RSales] Token obtained successfully');
  return cachedToken;
}

/**
 * Realiza una petición autenticada a la API de RSales
 */
async function rsalesRequest(endpoint, options = {}) {
  const token = await getToken();
  
  const url = `${RSALES_BASE_URL}${endpoint}`;
  const headers = {
    'Accept': 'application/json',
    'Subscription-Key': RSALES_API_KEY,
    'Authorization': `Bearer ${token}`,
    ...options.headers
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  const data = await response.json();

  if (!response.ok) {
    const errorMsg = data.errors?.[0]?.message || `HTTP ${response.status}`;
    throw new Error(`RSales API error: ${errorMsg}`);
  }

  return data;
}

/**
 * Obtiene la cartera (receivables) de RSales con paginación
 */
async function getReceivables(filters = {}) {
  const queryParams = new URLSearchParams();
  
  // Paginación por defecto
  queryParams.set('page', filters.page || '1');
  queryParams.set('limit', filters.limit || '1000');
  
  // Filtros opcionales
  if (filters.client_code) queryParams.set('client_code', filters.client_code);
  if (filters.seller_code) queryParams.set('seller_code', filters.seller_code);
  if (filters.document_type) queryParams.set('document_type', filters.document_type);
  if (filters.created_from) queryParams.set('created_from', filters.created_from);
  if (filters.modified_from) queryParams.set('modified_from', filters.modified_from);
  if (filters.sort) queryParams.set('sort', filters.sort);

  return rsalesRequest(`/receivables?${queryParams.toString()}`);
}

/**
 * Obtiene todos los registros de cartera paginando automáticamente
 */
async function getAllReceivables(filters = {}) {
  const allData = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= 50) { // Límite de seguridad: 50 páginas máximo
    const response = await getReceivables({
      ...filters,
      page: String(page),
      limit: '1000'
    });

    if (response.data && response.data.length > 0) {
      allData.push(...response.data);
      
      // Verificamos si hay más páginas
      if (response.meta && response.meta.currentPage >= response.meta.totalPages) {
        hasMore = false;
      } else {
        page++;
      }
    } else {
      hasMore = false;
    }
  }

  return allData;
}

/**
 * Obtiene los pedidos/facturas de RSales
 */
async function getOrders(filters = {}) {
  const queryParams = new URLSearchParams();
  
  queryParams.set('page', filters.page || '1');
  queryParams.set('limit', filters.limit || '1000');
  
  if (filters.client_code) queryParams.set('client_code', filters.client_code);
  if (filters.seller_code) queryParams.set('seller_code', filters.seller_code);
  if (filters.state) queryParams.set('state', filters.state);
  if (filters.created_from) queryParams.set('created_from', filters.created_from);

  return rsalesRequest(`/orders?${queryParams.toString()}`);
}

/**
 * Obtiene todos los pedidos paginando automáticamente
 */
async function getAllOrders(filters = {}) {
  const allData = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= 50) {
    const response = await getOrders({
      ...filters,
      page: String(page),
      limit: '500'
    });

    if (response.data && response.data.length > 0) {
      allData.push(...response.data);
      
      if (response.meta && response.meta.currentPage >= response.meta.totalPages) {
        hasMore = false;
      } else {
        page++;
      }
    } else {
      hasMore = false;
    }
  }

  return allData;
}

/**
 * Obtiene la lista de clientes
 */
async function getCustomers(filters = {}) {
  const queryParams = new URLSearchParams();
  
  queryParams.set('page', filters.page || '1');
  queryParams.set('limit', filters.limit || '1000');
  
  if (filters.code) queryParams.set('code', filters.code);
  if (filters.name) queryParams.set('name', filters.name);

  return rsalesRequest(`/customers?${queryParams.toString()}`);
}

/**
 * Obtiene todos los clientes paginando
 */
async function getAllCustomers(filters = {}) {
  const allData = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= 50) {
    const response = await getCustomers({
      ...filters,
      page: String(page),
      limit: '1000'
    });

    if (response.data && response.data.length > 0) {
      allData.push(...response.data);
      
      if (response.meta && response.meta.currentPage >= response.meta.totalPages) {
        hasMore = false;
      } else {
        page++;
      }
    } else {
      hasMore = false;
    }
  }

  return allData;
}

/**
 * Obtiene la lista de vendedores/usuarios
 */
async function getSellers(filters = {}) {
  const queryParams = new URLSearchParams();
  
  queryParams.set('page', filters.page || '1');
  queryParams.set('limit', filters.limit || '1000');
  
  if (filters.code) queryParams.set('code', filters.code);
  if (filters.name) queryParams.set('name', filters.name);

  return rsalesRequest(`/sellers?${queryParams.toString()}`);
}

/**
 * Obtiene todos los vendedores paginando
 */
async function getAllSellers(filters = {}) {
  const allData = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= 50) {
    const response = await getSellers({
      ...filters,
      page: String(page),
      limit: '1000'
    });

    if (response.data && response.data.length > 0) {
      allData.push(...response.data);
      
      if (response.meta && response.meta.currentPage >= response.meta.totalPages) {
        hasMore = false;
      } else {
        page++;
      }
    } else {
      hasMore = false;
    }
  }

  return allData;
}

/**
 * Obtiene el inventario/stock
 */
async function getStocks(filters = {}) {
  const queryParams = new URLSearchParams();
  queryParams.set('page', filters.page || '1');
  queryParams.set('limit', filters.limit || '1000');
  if (filters.product_code) queryParams.set('product_code', filters.product_code);
  if (filters.warehouse_code) queryParams.set('warehouse_code', filters.warehouse_code);
  return rsalesRequest(`/stocks?${queryParams.toString()}`);
}

async function getAllStocks(filters = {}) {
  const allData = []; let page = 1; let hasMore = true;
  while (hasMore && page <= 50) {
    const response = await getStocks({ ...filters, page: String(page), limit: '1000' });
    if (response.data && response.data.length > 0) {
      allData.push(...response.data);
      if (response.meta && response.meta.currentPage >= response.meta.totalPages) hasMore = false;
      else page++;
    } else hasMore = false;
  }
  return allData;
}

/**
 * Productos
 */
async function getProducts(filters = {}) {
  const queryParams = new URLSearchParams();
  queryParams.set('page', filters.page || '1');
  queryParams.set('limit', filters.limit || '1000');
  if (filters.code) queryParams.set('code', filters.code);
  if (filters.name) queryParams.set('name', filters.name);
  return rsalesRequest(`/products?${queryParams.toString()}`);
}

async function getAllProducts(filters = {}) {
  const allData = []; let page = 1; let hasMore = true;
  while (hasMore && page <= 50) {
    const response = await getProducts({ ...filters, page: String(page), limit: '1000' });
    if (response.data && response.data.length > 0) {
      allData.push(...response.data);
      if (response.meta && response.meta.currentPage >= response.meta.totalPages) hasMore = false;
      else page++;
    } else hasMore = false;
  }
  return allData;
}

/**
 * Precios
 */
async function getPrices(filters = {}) {
  const queryParams = new URLSearchParams();
  queryParams.set('page', filters.page || '1');
  queryParams.set('limit', filters.limit || '1000');
  if (filters.product_code) queryParams.set('product_code', filters.product_code);
  return rsalesRequest(`/prices?${queryParams.toString()}`);
}

async function getAllPrices(filters = {}) {
  const allData = []; let page = 1; let hasMore = true;
  while (hasMore && page <= 50) {
    const response = await getPrices({ ...filters, page: String(page), limit: '1000' });
    if (response.data && response.data.length > 0) {
      allData.push(...response.data);
      if (response.meta && response.meta.currentPage >= response.meta.totalPages) hasMore = false;
      else page++;
    } else hasMore = false;
  }
  return allData;
}

/**
 * Rutas
 */
async function getRoutes(filters = {}) {
  const queryParams = new URLSearchParams();
  queryParams.set('page', filters.page || '1');
  queryParams.set('limit', filters.limit || '1000');
  if (filters.code) queryParams.set('code', filters.code);
  if (filters.seller_code) queryParams.set('seller_code', filters.seller_code);
  return rsalesRequest(`/routes?${queryParams.toString()}`);
}

async function getAllRoutes(filters = {}) {
  const allData = []; let page = 1; let hasMore = true;
  while (hasMore && page <= 50) {
    const response = await getRoutes({ ...filters, page: String(page), limit: '1000' });
    if (response.data && response.data.length > 0) {
      allData.push(...response.data);
      if (response.meta && response.meta.currentPage >= response.meta.totalPages) hasMore = false;
      else page++;
    } else hasMore = false;
  }
  return allData;
}

/**
 * Formas de pago
 */
async function getPaymentMethods(filters = {}) {
  const queryParams = new URLSearchParams();
  queryParams.set('page', filters.page || '1');
  queryParams.set('limit', filters.limit || '1000');
  return rsalesRequest(`/payment-methods?${queryParams.toString()}`);
}

async function getAllPaymentMethods(filters = {}) {
  const allData = []; let page = 1; let hasMore = true;
  while (hasMore && page <= 50) {
    const response = await getPaymentMethods({ ...filters, page: String(page), limit: '1000' });
    if (response.data && response.data.length > 0) {
      allData.push(...response.data);
      if (response.meta && response.meta.currentPage >= response.meta.totalPages) hasMore = false;
      else page++;
    } else hasMore = false;
  }
  return allData;
}

/**
 * Factores
 */
async function getFactors(filters = {}) {
  const queryParams = new URLSearchParams();
  queryParams.set('page', filters.page || '1');
  queryParams.set('limit', filters.limit || '1000');
  return rsalesRequest(`/factors?${queryParams.toString()}`);
}

async function getAllFactors(filters = {}) {
  const allData = []; let page = 1; let hasMore = true;
  while (hasMore && page <= 50) {
    const response = await getFactors({ ...filters, page: String(page), limit: '1000' });
    if (response.data && response.data.length > 0) {
      allData.push(...response.data);
      if (response.meta && response.meta.currentPage >= response.meta.totalPages) hasMore = false;
      else page++;
    } else hasMore = false;
  }
  return allData;
}

/**
 * Visitas / Gestión
 */
async function getManagements(filters = {}) {
  const queryParams = new URLSearchParams();
  queryParams.set('page', filters.page || '1');
  queryParams.set('limit', filters.limit || '1000');
  if (filters.seller_code) queryParams.set('seller_code', filters.seller_code);
  if (filters.client_code) queryParams.set('client_code', filters.client_code);
  if (filters.date_from) queryParams.set('date_from', filters.date_from);
  return rsalesRequest(`/managements?${queryParams.toString()}`);
}

async function getAllManagements(filters = {}) {
  const allData = []; let page = 1; let hasMore = true;
  while (hasMore && page <= 50) {
    const response = await getManagements({ ...filters, page: String(page), limit: '1000' });
    if (response.data && response.data.length > 0) {
      allData.push(...response.data);
      if (response.meta && response.meta.currentPage >= response.meta.totalPages) hasMore = false;
      else page++;
    } else hasMore = false;
  }
  return allData;
}

/**
 * GPS Tracking
 */
async function getGPSTracking(filters = {}) {
  const queryParams = new URLSearchParams();
  queryParams.set('page', filters.page || '1');
  queryParams.set('limit', filters.limit || '1000');
  if (filters.seller_code) queryParams.set('seller_code', filters.seller_code);
  if (filters.date_from) queryParams.set('date_from', filters.date_from);
  return rsalesRequest(`/gps-tracking?${queryParams.toString()}`);
}

async function getAllGPSTracking(filters = {}) {
  const allData = []; let page = 1; let hasMore = true;
  while (hasMore && page <= 50) {
    const response = await getGPSTracking({ ...filters, page: String(page), limit: '1000' });
    if (response.data && response.data.length > 0) {
      allData.push(...response.data);
      if (response.meta && response.meta.currentPage >= response.meta.totalPages) hasMore = false;
      else page++;
    } else hasMore = false;
  }
  return allData;
}

/**
 * Sincroniza toda la información relevante para el dashboard
 */
async function syncAllData() {
  console.log('[RSales] Starting full sync...');
  const startTime = Date.now();

  try {
    const [receivables, orders, customers, sellers] = await Promise.all([
      getAllReceivables(),
      getAllOrders(),
      getAllCustomers(),
      getAllSellers()
    ]);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[RSales] Sync completed in ${duration}s`);
    console.log(`[RSales] - Receivables: ${receivables.length}`);
    console.log(`[RSales] - Orders: ${orders.length}`);
    console.log(`[RSales] - Customers: ${customers.length}`);
    console.log(`[RSales] - Sellers: ${sellers.length}`);

    return {
      receivables,
      orders,
      customers,
      sellers,
      syncTime: new Date().toISOString(),
      duration: parseFloat(duration)
    };
  } catch (err) {
    console.error('[RSales] Sync failed:', err.message);
    throw err;
  }
}

module.exports = {
  getToken,
  rsalesRequest,
  getReceivables,
  getAllReceivables,
  getOrders,
  getAllOrders,
  getCustomers,
  getAllCustomers,
  getSellers,
  getAllSellers,
  getStocks,
  getAllStocks,
  getProducts,
  getAllProducts,
  getPrices,
  getAllPrices,
  getRoutes,
  getAllRoutes,
  getPaymentMethods,
  getAllPaymentMethods,
  getFactors,
  getAllFactors,
  getManagements,
  getAllManagements,
  getGPSTracking,
  getAllGPSTracking,
  syncAllData
};