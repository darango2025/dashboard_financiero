const fs = require('fs');
const path = require('path');
const { verifyToken } = require('./auth');

const API_KEY = process.env.API_KEY_DS;
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro';

let ragData = null;

function loadRAGData() {
  try {
    const ragPath = path.join(__dirname, '..', 'public', 'data', 'rag_summaries.json');
    ragData = JSON.parse(fs.readFileSync(ragPath, 'utf-8'));
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
  const periodic = ragData.periodic_summaries;

  return `Eres un asistente financiero experto de ADATEC. Responde EXCLUSIVAMENTE con los datos siguientes.

RESUMEN:
${overview.key_facts.slice(0, 4).map(f => '- ' + f).join('\n')}

MÉTRICAS:
- Total: ${metrics.metrics.saldo_total.formatted} | Vencida: ${metrics.metrics.cartera_vencida.formatted} (${metrics.metrics.pct_vencida.formatted}) | Corriente: ${metrics.metrics.cartera_corriente.formatted}
- Mora: ${metrics.metrics.dias_mora_promedio.formatted} | Docs: ${metrics.metrics.total_documentos.formatted} | Clientes: ${metrics.metrics.total_clientes.formatted}

AGING:
${aging.rangos.map(r => `- ${r.rango}: ${fmt(r.saldo)} (${r.pct_del_total})`).join('\n')}

TOP 3 DEUDORES:
${clients.top_10_deudores.slice(0, 3).map(c => `- ${c.nombre}: ${fmt(c.saldo)} (${c.pct_del_total}%)`).join('\n')}

TOP 3 VENDEDORES:
${vendors.top_10_vendedores.slice(0, 3).map(v => `- ${v.nombre}: ${fmt(v.saldo_total)} (${v.pct_vencido}% vencido)`).join('\n')}

EFICIENCIA (últimos 3 años):
${periodic.slice(0, 3).map(p => `- ${p.year}: Fact ${fmt(p.facturacion_total)}, Rec ${fmt(p.recaudo_total)}, Ef ${p.eficiencia}%`).join('\n')}

TENDENCIAS:
- Fact avg/mes: ${trends.facturacion_promedio_mensual.formatted} | Rec avg/mes: ${trends.recaudo_promedio_mensual.formatted} | Brecha: ${trends.brecha_promedio.formatted}

RIESGOS:
${risks.riesgos.slice(0, 3).map(r => `- [${r.nivel}] ${r.indicador}: ${r.valor}`).join('\n')}

REGLAS:
1. Responde SOLO con los datos arriba.
2. Sé conciso y profesional.
3. Idioma: español.`;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const decoded = verifyToken(req);
  
  if (!decoded) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  
  const { message, conversationHistory = [] } = req.body;
  
  if (!message) {
    return res.status(400).json({ error: 'Mensaje requerido' });
  }
  
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
        max_tokens: 1200,
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
