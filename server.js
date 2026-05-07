const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const API_KEY = process.env.API_KEY_DS;
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro';
const SESSION_SECRET = process.env.SESSION_SECRET || 'default_secret';

const openai = new OpenAI({
  apiKey: API_KEY,
  baseURL: 'https://api.deepseek.com/v1'
});

let ragData = null;
let dashboardData = null;

function loadRAGData() {
  try {
    const ragPath = path.join(__dirname, 'public', 'data', 'rag_summaries.json');
    const dataPath = path.join(__dirname, 'public', 'data', 'dashboard_data.json');
    
    ragData = JSON.parse(fs.readFileSync(ragPath, 'utf-8'));
    dashboardData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    
    console.log('RAG data loaded successfully');
  } catch (err) {
    console.error('Error loading RAG data:', err.message);
  }
}

loadRAGData();

const VALID_USER = 'naprolab';
const VALID_PASSWORD = 'naprolab';

const sessions = new Map();

function generateSessionId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  if (username === VALID_USER && password === VALID_PASSWORD) {
    const sessionId = generateSessionId();
    sessions.set(sessionId, {
      username,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString()
    });
    
    res.json({
      success: true,
      sessionId,
      message: 'Login exitoso'
    });
  } else {
    res.status(401).json({
      success: false,
      message: 'Credenciales inválidas'
    });
  }
});

app.post('/api/logout', (req, res) => {
  const { sessionId } = req.body;
  sessions.delete(sessionId);
  res.json({ success: true, message: 'Logout exitoso' });
});

app.get('/api/verify', (req, res) => {
  const sessionId = req.headers['x-session-id'];
  
  if (!sessionId || !sessions.has(sessionId)) {
    return res.status(401).json({ authenticated: false });
  }
  
  const session = sessions.get(sessionId);
  session.lastActivity = new Date().toISOString();
  
  res.json({
    authenticated: true,
    username: session.username
  });
});

function buildSystemPrompt() {
  if (!ragData) {
    return 'Eres un asistente financiero especializado en análisis de cartera.';
  }
  
  const overview = ragData.general_overview;
  const metrics = ragData.key_metrics;
  const risks = ragData.risk_indicators;
  const trends = ragData.trends;
  const clients = ragData.client_analysis;
  const vendors = ragData.vendor_analysis;
  const aging = ragData.aging_analysis;
  const efficiency = ragData.efficiency_analysis;
  const periodic = ragData.periodic_summaries;
  
  return `Eres un asistente financiero experto especializado en análisis de cartera para ADATEC.

DATOS ACTUALIZADOS DE LA CARTERA:

RESUMEN GENERAL:
${overview.key_facts.map(f => '- ' + f).join('\n')}

MÉTRICAS CLAVE:
- Saldo total: ${metrics.metrics.saldo_total.formatted}
- Cartera vencida: ${metrics.metrics.cartera_vencida.formatted} (${metrics.metrics.pct_vencida.formatted})
- Cartera corriente: ${metrics.metrics.cartera_corriente.formatted}
- Días mora promedio: ${metrics.metrics.dias_mora_promedio.formatted}
- Total documentos: ${metrics.metrics.total_documentos.formatted}
- Total clientes: ${metrics.metrics.total_clientes.formatted}

ANÁLISIS DE ANTIGÜEDAD:
${aging.rangos.map(r => `- ${r.rango}: ${r.formatted} (${r.pct_del_total})`).join('\n')}

TOP 5 CLIENTES DEUDORES:
${clients.top_10_deudores.slice(0, 5).map(c => `- ${c.nombre}: ${fmt(c.saldo)} (${c.pct_del_total}% del total)`).join('\n')}

TOP 5 VENDEDORES CON MAYOR CARTERA:
${vendors.top_10_vendedores.slice(0, 5).map(v => `- ${v.nombre}: ${fmt(v.saldo_total)} (${v.pct_vencido}% vencido)`).join('\n')}

EFICIENCIA DE RECAUDO POR AÑO:
${periodic.slice(0, 5).map(p => `- ${p.year}: Fact ${fmt(p.facturacion_total)}, Rec ${fmt(p.recaudo_total)}, Eficiencia ${p.eficiencia}%`).join('\n')}

TENDENCIAS RECIENTES:
- Facturación promedio mensual: ${trends.facturacion_promedio_mensual.formatted}
- Recaudo promedio mensual: ${trends.recaudo_promedio_mensual.formatted}
- Brecha promedio: ${trends.brecha_promedio.formatted}

INDICADORES DE RIESGO:
${risks.riesgos.map(r => `- [${r.nivel}] ${r.indicador}: ${r.valor}`).join('\n')}

INSTRUCCIONES:
1. Usa SIEMPRE los datos proporcionados para responder
2. Si no tienes datos específicos, indícalo claramente
3. Proporciona análisis contextualizado, no solo números
4. Usa formato claro y profesional
5. Responde en español
6. Si te preguntan por algo fuera del alcance de los datos, indícalo`;
}

function fmt(n) {
  if (n === null || n === undefined) return 'N/A';
  return '$' + Number(n).toLocaleString('es-CO', { maximumFractionDigits: 0 });
}

app.post('/api/chat', async (req, res) => {
  const { sessionId, message, conversationHistory = [] } = req.body;
  
  if (!sessionId || !sessions.has(sessionId)) {
    return res.status(401).json({ error: 'Sesión no válida' });
  }
  
  if (!message) {
    return res.status(400).json({ error: 'Mensaje requerido' });
  }
  
  const session = sessions.get(sessionId);
  session.lastActivity = new Date().toISOString();
  
  try {
    const systemPrompt = buildSystemPrompt();
    
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-10).map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      { role: 'user', content: message }
    ];
    
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages,
      max_tokens: 2000,
      temperature: 0.3,
      top_p: 0.9
    });
    
    const response = completion.choices[0].message.content;
    
    res.json({
      success: true,
      response,
      model: MODEL
    });
  } catch (err) {
    console.error('Error en chat:', err.message);
    res.status(500).json({
      error: 'Error al procesar la solicitud',
      details: err.message
    });
  }
});

app.get('/api/rag-data', (req, res) => {
  const sessionId = req.headers['x-session-id'];
  
  if (!sessionId || !sessions.has(sessionId)) {
    return res.status(401).json({ error: 'Sesión no válida' });
  }
  
  res.json({
    success: true,
    data: ragData
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    ragLoaded: !!ragData,
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
  console.log(`RAG data loaded: ${!!ragData}`);
});

module.exports = app;
