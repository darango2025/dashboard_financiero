/**
 * server.js — API Server Principal ADATEC Dashboard Financiero
 *
 * Endpoints:
 *   POST /api/login              — Autenticación
 *   POST /api/logout             — Cierre de sesión
 *   GET  /api/verify             — Verificar sesión
 *   POST /api/chat               — Chatbot con RAG
 *   GET  /api/health             — Estado del sistema
 *   GET  /api/dashboard-data     — Datos del dashboard (procesados)
 *   POST /api/reports/financial  — Genera informe financiero
 *   POST /api/reports/conversation — Genera reporte de conversación
 */
'use strict';

const express = require('express');
const cors    = require('cors');
const dotenv  = require('dotenv');
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');

dotenv.config();

// Módulos propios
const { chat: deepseekChat, isAvailable: aiAvailable, getModel } = require('./lib/ai/deepseek');
const { retrieveContext, formatContextForPrompt, loadArtifacts }  = require('./lib/ai/rag');
const { buildCartChatSystemPrompt }                                = require('./lib/ai/prompts');
const { sanitizeUserInput, validateResponse }                      = require('./lib/ai/guardrails');
const { buildFinancialReportData, buildConversationReportData }    = require('./lib/reports/reportDataBuilder');
const { generateFinancialDocx, generateConversationDocx }         = require('./lib/reports/docxGenerator');
const { generateFinancialXlsx }                                    = require('./lib/reports/xlsxGenerator');
const { generateFinancialPptx, generateConversationPptx }         = require('./lib/reports/pptxGenerator');
const { generateFinancialPdf, generateConversationPdf }           = require('./lib/reports/pdfGenerator');

const app  = express();
const PORT = process.env.PORT || 3001;

// ─── Configuración ────────────────────────────
const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET || SESSION_SECRET === 'default_secret') {
  console.warn('[Security] ⚠️  SESSION_SECRET débil. Usa una clave fuerte en .env');
}

// Credenciales de usuario desde .env
const VALID_USER     = process.env.DASHBOARD_USER     || 'naprolab';
const VALID_PASSWORD = process.env.DASHBOARD_PASSWORD || 'naprolab';
const SESSION_TTL_MS = parseInt(process.env.SESSION_TTL_MS || '28800000', 10); // 8 horas

// ─── Middlewares ──────────────────────────────
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-session-id'],
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Sesiones en memoria ─────────────────────
const sessions = new Map();

function generateSessionId() {
  return crypto.randomBytes(32).toString('hex');
}

function cleanExpiredSessions() {
  const now = Date.now();
  for (const [id, sess] of sessions.entries()) {
    if (now - new Date(sess.lastActivity).getTime() > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}
setInterval(cleanExpiredSessions, 30 * 60 * 1000);

function requireSession(req, res, next) {
  const sessionId = req.headers['x-session-id'];
  if (!sessionId || !sessions.has(sessionId)) {
    return res.status(401).json({ error: 'Sesión no válida o expirada' });
  }
  const sess = sessions.get(sessionId);
  if (Date.now() - new Date(sess.lastActivity).getTime() > SESSION_TTL_MS) {
    sessions.delete(sessionId);
    return res.status(401).json({ error: 'Sesión expirada' });
  }
  sess.lastActivity = new Date().toISOString();
  req.session = sess;
  next();
}

// ─── Carga inicial de artefactos RAG ─────────
loadArtifacts();

// ─── RUTAS: Auth ──────────────────────────────
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Credenciales requeridas' });
  }

  let userOk = false, passOk = false;
  try {
    userOk = crypto.timingSafeEqual(Buffer.from(username.trim()), Buffer.from(VALID_USER));
    passOk = crypto.timingSafeEqual(Buffer.from(password),         Buffer.from(VALID_PASSWORD));
  } catch (_) {
    // Buffer lengths differ → invalid credentials
  }

  if (userOk && passOk) {
    const sessionId = generateSessionId();
    sessions.set(sessionId, {
      username: username.trim(),
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
    });
    return res.json({ success: true, sessionId, message: 'Login exitoso' });
  }

  return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
});

app.post('/api/logout', (req, res) => {
  const { sessionId } = req.body || {};
  if (sessionId) sessions.delete(sessionId);
  res.json({ success: true });
});

app.get('/api/verify', (req, res) => {
  const sessionId = req.headers['x-session-id'];
  if (!sessionId || !sessions.has(sessionId)) {
    return res.status(401).json({ authenticated: false });
  }
  const sess = sessions.get(sessionId);
  if (Date.now() - new Date(sess.lastActivity).getTime() > SESSION_TTL_MS) {
    sessions.delete(sessionId);
    return res.status(401).json({ authenticated: false });
  }
  sess.lastActivity = new Date().toISOString();
  res.json({ authenticated: true, username: sess.username });
});

// ─── RUTA: Health ─────────────────────────────
app.get('/api/health', (req, res) => {
  const hasProcessed = fs.existsSync(path.join(__dirname, 'data', 'processed', 'kpi_snapshots.json'));
  res.json({
    status: 'ok',
    ai_available: aiAvailable(),
    model: getModel(),
    processed_data: hasProcessed,
    active_sessions: sessions.size,
    timestamp: new Date().toISOString(),
  });
});

// ─── RUTA: Dashboard Data ─────────────────────
app.get('/api/dashboard-data', requireSession, (req, res) => {
  try {
    const fp = path.join(__dirname, 'public', 'data', 'dashboard_data.json');
    if (!fs.existsSync(fp)) {
      return res.status(503).json({ error: 'Datos no disponibles. Ejecuta: node scripts/preprocess_cartera.js' });
    }
    const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
    res.json({ success: true, data });
  } catch (err) {
    console.error('[/api/dashboard-data]', err.message);
    res.status(500).json({ error: 'Error cargando datos' });
  }
});

// ─── RUTA: Chat RAG ───────────────────────────
app.post('/api/chat', requireSession, async (req, res) => {
  const { message, conversationHistory = [], activeFilters = {} } = req.body || {};

  if (!message) {
    return res.status(400).json({ error: 'Mensaje requerido' });
  }

  const cleanMessage = sanitizeUserInput(message);
  if (!cleanMessage) {
    return res.status(400).json({ error: 'Mensaje inválido' });
  }

  try {
    const ragContext = retrieveContext(cleanMessage, activeFilters);
    const systemPrompt = buildCartChatSystemPrompt(ragContext);

    const safeHistory = (conversationHistory || []).slice(-8).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: sanitizeUserInput(m.content || ''),
    })).filter(m => m.content);

    const messages = [
      { role: 'system', content: systemPrompt },
      ...safeHistory,
      { role: 'user', content: cleanMessage },
    ];

    let responseContent, modelUsed = getModel();

    if (!aiAvailable()) {
      responseContent = buildFallbackResponse(cleanMessage, ragContext);
    } else {
      const result = await deepseekChat({ messages, maxTokens: 2000, temperature: 0.3 });
      responseContent = result.content;
      modelUsed = result.model;
    }

    const { sanitized, warnings } = validateResponse(responseContent, ragContext);

    res.json({
      success: true,
      response: sanitized,
      model: modelUsed,
      context_used: ragContext.available,
      warnings: warnings.length > 0 ? warnings : undefined,
    });

  } catch (err) {
    console.error('[/api/chat]', err.message);
    let userMsg = 'Error al procesar la solicitud. Intenta de nuevo.';
    if (err.message.includes('timeout')) userMsg = 'El servicio de IA tardó demasiado. Intenta de nuevo.';
    if (err.message.includes('rate limit')) userMsg = 'Límite de solicitudes alcanzado. Espera unos segundos.';
    if (err.message.includes('no configurado')) userMsg = err.message;
    res.status(500).json({ error: userMsg });
  }
});

function buildFallbackResponse(message, ragContext) {
  if (!ragContext.available) {
    return 'Los datos de cartera no están disponibles. Ejecuta el pipeline de preprocesamiento: `node scripts/preprocess_cartera.js`';
  }
  const kpis = (ragContext.keyMetrics || []).map(k => `• ${k.label}: ${k.valor}`).join('\n');
  return `**Datos de cartera (calculados automáticamente):**\n\n${kpis}\n\n_El chatbot IA no está disponible. Configura API_KEY_DS en .env para respuestas analíticas._`;
}

// ─── RUTAS: Reportes ──────────────────────────
app.post('/api/reports/financial', requireSession, async (req, res) => {
  const { format, filters = {} } = req.body || {};
  const allowed = ['docx', 'xlsx', 'pptx', 'pdf'];
  if (!allowed.includes(format)) {
    return res.status(400).json({ error: `Formato inválido. Permitidos: ${allowed.join(', ')}` });
  }

  try {
    const reportData = buildFinancialReportData(filters);
    let buffer, contentType, filename;

    switch (format) {
      case 'docx':
        buffer      = await generateFinancialDocx(reportData);
        contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        filename    = `informe_cartera_${Date.now()}.docx`;
        break;
      case 'xlsx':
        buffer      = await generateFinancialXlsx(reportData);
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        filename    = `informe_cartera_${Date.now()}.xlsx`;
        break;
      case 'pptx':
        buffer      = await generateFinancialPptx(reportData);
        contentType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
        filename    = `informe_cartera_${Date.now()}.pptx`;
        break;
      case 'pdf':
        buffer      = await generateFinancialPdf(reportData);
        contentType = 'application/pdf';
        filename    = `informe_cartera_${Date.now()}.pdf`;
        break;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);

  } catch (err) {
    console.error('[/api/reports/financial]', err.message);
    res.status(500).json({ error: 'Error generando reporte: ' + err.message });
  }
});

app.post('/api/reports/conversation', requireSession, async (req, res) => {
  const { format, messages, filters = {}, insights = '' } = req.body || {};
  const allowed = ['docx', 'pptx', 'pdf'];
  if (!allowed.includes(format)) {
    return res.status(400).json({ error: `Formato inválido. Permitidos: ${allowed.join(', ')}` });
  }
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Se requiere el historial de mensajes' });
  }

  try {
    const convData = buildConversationReportData({ messages, filters, insights });
    let buffer, contentType, filename;

    switch (format) {
      case 'docx':
        buffer      = await generateConversationDocx(convData);
        contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        filename    = `conversacion_${Date.now()}.docx`;
        break;
      case 'pptx':
        buffer      = await generateConversationPptx(convData);
        contentType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
        filename    = `conversacion_${Date.now()}.pptx`;
        break;
      case 'pdf':
        buffer      = await generateConversationPdf(convData);
        contentType = 'application/pdf';
        filename    = `conversacion_${Date.now()}.pdf`;
        break;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);

  } catch (err) {
    console.error('[/api/reports/conversation]', err.message);
    res.status(500).json({ error: 'Error generando reporte de conversación: ' + err.message });
  }
});

// ─── SPA fallback ─────────────────────────────
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Ruta no encontrada' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start ────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 ADATEC Dashboard Server`);
  console.log(`   Puerto:          ${PORT}`);
  console.log(`   IA disponible:   ${aiAvailable()}`);
  console.log(`   Modelo:          ${getModel()}`);
  console.log(`   URL:             http://localhost:${PORT}`);
  console.log(`   Dashboard:       http://localhost:${PORT}/index.html`);
  console.log(`   Chatbot:         http://localhost:${PORT}/chatbot.html\n`);
});

module.exports = app;
