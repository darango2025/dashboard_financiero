const fs = require('fs');
const path = require('path');

const sessions = require('./sessions');

const API_KEY = process.env.API_KEY_DS;
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro';

let ragData = null;
let dashboardData = null;

function loadRAGData() {
  try {
    const ragPath = path.join(__dirname, '..', 'public', 'data', 'rag_summaries.json');
    const dataPath = path.join(__dirname, '..', 'public', 'data', 'dashboard_data.json');
    
    ragData = JSON.parse(fs.readFileSync(ragPath, 'utf-8'));
    dashboardData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  } catch (err) {
    console.error('Error loading RAG data:', err.message);
  }
}

loadRAGData();

function fmt(n) {
  if (n === null || n === undefined) return 'N/A';
  return '$' + Number(n).toLocaleString('es-CO', { maximumFractionDigits: 0 });
}

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
${aging.rangos.map(r => `- ${r.rango}: ${fmt(r.saldo)} (${r.pct_del_total})`).join('\n')}

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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session-Id');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
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
    
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        max_tokens: 2000,
        temperature: 0.3,
        top_p: 0.9
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error?.message || 'Error en la API de DeepSeek');
    }
    
    const aiResponse = data.choices[0].message.content;
    
    res.json({
      success: true,
      response: aiResponse,
      model: MODEL
    });
  } catch (err) {
    console.error('Error en chat:', err.message);
    res.status(500).json({
      error: 'Error al procesar la solicitud',
      details: err.message
    });
  }
};
