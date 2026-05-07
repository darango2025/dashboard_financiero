const fs = require('fs');
const path = require('path');
const { verifyToken } = require('./auth');

const API_KEY = process.env.API_KEY_DS;
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro';

let ragData = null;

function loadRAGData() {
  try {
    const ragPath = path.join(__dirname, 'rag_summaries.json');
    ragData = JSON.parse(fs.readFileSync(ragPath, 'utf-8'));
  } catch (err) {
    console.error('Error loading RAG data:', err.message);
    ragData = null;
  }
}

loadRAGData();

function generateFallbackResponse(message) {
  if (!ragData) {
    return 'Lo siento, no puedo acceder a los datos de cartera en este momento. Por favor intente más tarde.';
  }
  const lower = message.toLowerCase();
  const k = ragData.key_metrics.metrics;
  const aging = ragData.aging_analysis;
  const clients = ragData.client_analysis;
  const vendors = ragData.vendor_analysis;
  const eff = ragData.efficiency_analysis;
  const trends = ragData.trends;
  const periodic = ragData.periodic_summaries;

  if (lower.includes('estado') || lower.includes('cartera') || lower.includes('resumen')) {
    return `**Estado actual de la cartera:**\n\n` +
      `- Saldo total: ${k.saldo_total.formatted}\n` +
      `- Cartera vencida: ${k.cartera_vencida.formatted} (${k.pct_vencida.formatted})\n` +
      `- Cartera corriente: ${k.cartera_corriente.formatted}\n` +
      `- Días mora promedio: ${k.dias_mora_promedio.formatted}\n` +
      `- Documentos: ${k.total_documentos.formatted} | Clientes: ${k.total_clientes.formatted}\n\n` +
      `**Aging:**\n` +
      aging.rangos.map(r => `- ${r.rango}: ${fmt(r.saldo)} (${r.pct_del_total}%)`).join('\n');
  }

  if (lower.includes('deudor') || lower.includes('cliente')) {
    return `**Top 5 clientes deudores:**\n\n` +
      clients.top_10_deudores.slice(0, 5).map((c, i) =>
        `${i + 1}. **${c.nombre}** — ${fmt(c.saldo)} (${c.pct_del_total}% del total)`
      ).join('\n') +
      `\n\nEl cliente principal concentra el **${clients.concentracion.top_1_pct}%** del saldo total.`;
  }

  if (lower.includes('eficiencia') || lower.includes('recaudo')) {
    return `**Eficiencia de recaudo por año:**\n\n` +
      eff.por_anio.slice(-5).map(e =>
        `- **${e.anio}**: Facturado ${fmt(e.facturado)}, Recaudado ${fmt(e.recaudado)} → **${e.porcentaje}%** eficiencia`
      ).join('\n') +
      `\n\nTendencia reciente: ${eff.tendencia}.` +
      `\n\nPromedios últimos 12 meses:\n` +
      `- Facturación mensual: ${trends.facturacion_promedio_mensual.formatted}\n` +
      `- Recaudo mensual: ${trends.recaudo_promedio_mensual.formatted}\n` +
      `- Brecha: ${trends.brecha_promedio.formatted}`;
  }

  if (lower.includes('riesgo') || lower.includes('alerta')) {
    return `**Indicadores de riesgo identificados:**\n\n` +
      ragData.risk_indicators.riesgos.map(r =>
        `- **[${r.nivel}]** ${r.indicador}: ${r.valor}\n  ${r.descripcion}`
      ).join('\n');
  }

  if (lower.includes('tendencia') || lower.includes('facturación') || lower.includes('trend')) {
    return `**Tendencias recientes (últimos 12 meses):**\n\n` +
      `- Facturación promedio mensual: **${trends.facturacion_promedio_mensual.formatted}**\n` +
      `- Recaudo promedio mensual: **${trends.recaudo_promedio_mensual.formatted}**\n` +
      `- Brecha promedio: **${trends.brecha_promedio.formatted}**\n\n` +
      `**Eficiencia anual:**\n` +
      periodic.slice(0, 3).map(p =>
        `- ${p.year}: ${p.eficiencia}% (Fact ${fmt(p.facturacion_total)} / Rec ${fmt(p.recaudo_total)})`
      ).join('\n') +
      `\n\nLa brecha entre facturación y recaudo indica que se factura aproximadamente **5.6 veces** más de lo que se recauda.`;
  }

  if (lower.includes('vendedor')) {
    return `**Top 5 vendedores con mayor cartera:**\n\n` +
      vendors.top_10_vendedores.slice(0, 5).map((v, i) =>
        `${i + 1}. **${v.nombre}** — ${fmt(v.saldo_total)} (${v.pct_vencido}% vencido)`
      ).join('\n');
  }

  return `Basado en los datos de cartera de ADATEC:\n\n` +
    `- Saldo total: ${k.saldo_total.formatted}\n` +
    `- Cartera vencida: ${k.cartera_vencida.formatted} (${k.pct_vencida.formatted})\n` +
    `- Días mora promedio: ${k.dias_mora_promedio.formatted}\n` +
    `- Clientes: ${k.total_clientes.formatted} | Documentos: ${k.total_documentos.formatted}\n\n` +
    `Para un análisis más específico, indíqueme el tema de interés (estado, deudores, eficiencia, riesgos, tendencias o vendedores).`;
}

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
      ...conversationHistory.slice(-6).map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      { role: 'user', content: message }
    ];
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    
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
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeout);
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
    if (err.name === 'AbortError') {
      const fallback = generateFallbackResponse(message);
      return res.json({
        success: true,
        response: fallback,
        model: MODEL,
        fallback: true
      });
    }
    res.status(500).json({
      error: 'Error al procesar la solicitud',
      details: err.message
    });
  }
};
