/**
 * lib/reports/pptxGenerator.js
 * Genera presentaciones PowerPoint (.pptx) con pptxgenjs.
 */
'use strict';

const PptxGenJS = require('pptxgenjs');

const BRAND   = '1E3A5F';
const ACCENT  = '2563EB';
const DANGER  = 'DC2626';
const SUCCESS = '059669';
const WARNING = 'D97706';
const GRAY    = '64748B';
const WHITE   = 'FFFFFF';
const LIGHT   = 'F8FAFC';

function addTitleSlide(pptx, meta) {
  const slide = pptx.addSlide();
  slide.background = { color: BRAND };

  slide.addText(meta.titulo, {
    x: 0.5, y: 1.5, w: 9, h: 1.2,
    fontSize: 28, bold: true, color: WHITE,
    align: 'center', fontFace: 'Calibri',
  });
  slide.addText('ADATEC — Análisis Financiero de Cartera', {
    x: 0.5, y: 2.9, w: 9, h: 0.5,
    fontSize: 16, color: 'A5B4FC', align: 'center',
  });
  slide.addText(`Período: ${meta.periodo_desde} — ${meta.periodo_hasta}`, {
    x: 0.5, y: 3.5, w: 9, h: 0.4,
    fontSize: 13, color: 'CBD5E1', align: 'center',
  });
  slide.addText(`Generado: ${meta.fecha_generacion}`, {
    x: 0.5, y: 4.0, w: 9, h: 0.35,
    fontSize: 11, color: '94A3B8', align: 'center',
  });
}

function addKPISlide(pptx, kpi) {
  const slide = pptx.addSlide();
  slide.background = { color: 'F8FAFC' };

  slide.addText('Indicadores Clave de Rendimiento', {
    x: 0.3, y: 0.2, w: 9.4, h: 0.6,
    fontSize: 20, bold: true, color: BRAND,
  });

  const kpis = [
    { label: 'Saldo Total',      value: kpi.saldo_total.fmt,       color: BRAND   },
    { label: 'Cartera Vencida',  value: kpi.cartera_vencida.fmt,   color: DANGER  },
    { label: 'Cartera Corriente',value: kpi.cartera_corriente.fmt, color: SUCCESS },
    { label: '% Vencida',        value: kpi.pct_vencida.fmt,       color: kpi.pct_vencida.value > 80 ? DANGER : WARNING },
    { label: 'Días Mora Prom.',  value: kpi.dias_mora_promedio.fmt,color: WARNING },
    { label: 'Total Clientes',   value: kpi.total_clientes.fmt,    color: ACCENT  },
  ];

  const cols = 3;
  kpis.forEach((k, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = 0.3 + col * 3.15;
    const y = 1.0 + row * 1.8;

    slide.addShape(pptx.ShapeType.rect, {
      x, y, w: 2.9, h: 1.5,
      fill: { color: WHITE },
      line: { color: 'E2E8F0', width: 1 },
      shadow: { type: 'outer', blur: 4, offset: 2, color: '00000020' },
    });
    slide.addText(k.label, {
      x: x + 0.15, y: y + 0.12, w: 2.6, h: 0.4,
      fontSize: 10, color: GRAY, align: 'center',
    });
    slide.addText(k.value, {
      x: x + 0.1, y: y + 0.55, w: 2.7, h: 0.7,
      fontSize: 16, bold: true, color: k.color,
      align: 'center', fontFace: 'Calibri',
    });
  });
}

function addAgingSlide(pptx, aging) {
  const slide = pptx.addSlide();
  slide.background = { color: 'F8FAFC' };

  slide.addText('Análisis de Antigüedad (Aging)', {
    x: 0.3, y: 0.2, w: 9.4, h: 0.6,
    fontSize: 20, bold: true, color: BRAND,
  });

  // Tabla de aging
  const tableData = [
    [
      { text: 'Rango de Vencimiento', options: { bold: true, color: WHITE, fill: BRAND } },
      { text: 'Documentos',           options: { bold: true, color: WHITE, fill: BRAND } },
      { text: 'Saldo',                options: { bold: true, color: WHITE, fill: BRAND } },
      { text: '% del Total',          options: { bold: true, color: WHITE, fill: BRAND } },
    ],
    ...aging.map((b, i) => [
      { text: b.label,    options: { fill: i % 2 === 1 ? LIGHT : WHITE } },
      { text: String(b.docs.toLocaleString('es-CO')), options: { align: 'right', fill: i % 2 === 1 ? LIGHT : WHITE } },
      { text: b.saldo_fmt,options: { align: 'right', bold: b.key === 'mas_360', color: b.key === 'mas_360' ? DANGER : undefined, fill: i % 2 === 1 ? LIGHT : WHITE } },
      { text: b.pct_fmt,  options: { align: 'right', fill: i % 2 === 1 ? LIGHT : WHITE } },
    ]),
  ];

  slide.addTable(tableData, {
    x: 0.5, y: 0.9, w: 9, colW: [3.2, 1.5, 2.5, 1.5],
    border: { color: 'E2E8F0', pt: 0.5 },
    fontSize: 11,
  });

  // Barras proporcionales (visual simple)
  const maxSaldo = Math.max(...aging.map(b => b.saldo));
  aging.forEach((b, i) => {
    const barW = (b.saldo / maxSaldo) * 4;
    const y = 3.8 + i * 0.32;
    const color = b.key === 'mas_360' ? DANGER : b.key === 'corriente' ? SUCCESS : WARNING;
    slide.addShape(pptx.ShapeType.rect, { x: 0.5, y, w: barW, h: 0.22, fill: { color } });
    slide.addText(b.pct_fmt, { x: barW + 0.6, y, w: 1, h: 0.22, fontSize: 9, color: GRAY });
  });
}

function addClientesSlide(pptx, top_clientes) {
  const slide = pptx.addSlide();
  slide.background = { color: 'F8FAFC' };

  slide.addText('Top 10 Clientes Deudores', {
    x: 0.3, y: 0.2, w: 9.4, h: 0.6,
    fontSize: 20, bold: true, color: BRAND,
  });

  const tableData = [
    [
      { text: '#',        options: { bold: true, color: WHITE, fill: BRAND } },
      { text: 'Cliente',  options: { bold: true, color: WHITE, fill: BRAND } },
      { text: 'Saldo',    options: { bold: true, color: WHITE, fill: BRAND } },
      { text: '% Total',  options: { bold: true, color: WHITE, fill: BRAND } },
      { text: 'Riesgo',   options: { bold: true, color: WHITE, fill: BRAND } },
    ],
    ...top_clientes.slice(0, 10).map((c, i) => [
      { text: String(c.rank), options: { align: 'center', fill: i % 2 === 1 ? LIGHT : WHITE } },
      { text: c.nombre.length > 28 ? c.nombre.substring(0, 26) + '…' : c.nombre, options: { fill: i % 2 === 1 ? LIGHT : WHITE } },
      { text: c.saldo_fmt,  options: { align: 'right', fill: i % 2 === 1 ? LIGHT : WHITE } },
      { text: c.pct_total_fmt, options: { align: 'right', fill: i % 2 === 1 ? LIGHT : WHITE } },
      { text: c.riesgo.toUpperCase(), options: { bold: true, align: 'center', color: c.riesgo === 'alto' ? DANGER : c.riesgo === 'medio' ? WARNING : SUCCESS, fill: i % 2 === 1 ? LIGHT : WHITE } },
    ]),
  ];

  slide.addTable(tableData, {
    x: 0.3, y: 0.9, w: 9.4, colW: [0.5, 3.8, 2.2, 1.2, 1.2],
    border: { color: 'E2E8F0', pt: 0.5 },
    fontSize: 10,
  });
}

function addVendedoresSlide(pptx, top_vendedores) {
  const slide = pptx.addSlide();
  slide.background = { color: 'F8FAFC' };

  slide.addText('Cartera por Vendedor', {
    x: 0.3, y: 0.2, w: 9.4, h: 0.6,
    fontSize: 20, bold: true, color: BRAND,
  });

  const tableData = [
    [
      { text: '#',         options: { bold: true, color: WHITE, fill: BRAND } },
      { text: 'Vendedor',  options: { bold: true, color: WHITE, fill: BRAND } },
      { text: 'Saldo',     options: { bold: true, color: WHITE, fill: BRAND } },
      { text: '% Total',   options: { bold: true, color: WHITE, fill: BRAND } },
      { text: '% Vencido', options: { bold: true, color: WHITE, fill: BRAND } },
    ],
    ...top_vendedores.slice(0, 10).map((v, i) => [
      { text: String(v.rank), options: { align: 'center', fill: i % 2 === 1 ? LIGHT : WHITE } },
      { text: v.vendedor.length > 25 ? v.vendedor.substring(0, 23) + '…' : v.vendedor, options: { fill: i % 2 === 1 ? LIGHT : WHITE } },
      { text: v.saldo_fmt,  options: { align: 'right', fill: i % 2 === 1 ? LIGHT : WHITE } },
      { text: v.pct_total_fmt, options: { align: 'right', fill: i % 2 === 1 ? LIGHT : WHITE } },
      { text: v.pct_vencido_fmt, options: { align: 'right', color: parseFloat(v.pct_vencido_fmt) > 90 ? DANGER : undefined, fill: i % 2 === 1 ? LIGHT : WHITE } },
    ]),
  ];

  slide.addTable(tableData, {
    x: 0.3, y: 0.9, w: 9.4, colW: [0.5, 3.5, 2.2, 1.4, 1.5],
    border: { color: 'E2E8F0', pt: 0.5 },
    fontSize: 10,
  });
}

function addAlertasSlide(pptx, advertencias) {
  const slide = pptx.addSlide();
  slide.background = { color: 'F8FAFC' };

  slide.addText('Alertas y Recomendaciones', {
    x: 0.3, y: 0.2, w: 9.4, h: 0.6,
    fontSize: 20, bold: true, color: BRAND,
  });

  if (!advertencias?.length) {
    slide.addText('No se detectaron alertas críticas.', { x: 1, y: 2.5, w: 8, h: 0.5, fontSize: 14, color: SUCCESS });
    return;
  }

  advertencias.forEach((a, i) => {
    const color = a.nivel === 'critico' ? DANGER : WARNING;
    const y = 1.0 + i * 0.8;
    slide.addShape(pptx.ShapeType.rect, { x: 0.4, y, w: 9.2, h: 0.65, fill: { color: a.nivel === 'critico' ? 'FEF2F2' : 'FFFBEB' }, line: { color, pt: 1 } });
    slide.addText(`⚠ [${a.nivel.toUpperCase()}]  ${a.msg}`, {
      x: 0.6, y: y + 0.08, w: 8.8, h: 0.5,
      fontSize: 12, color, bold: a.nivel === 'critico',
    });
  });
}

function addConversationSlide(pptx, messages) {
  const maxPerSlide = 4;
  for (let i = 0; i < messages.length; i += maxPerSlide) {
    const slide = pptx.addSlide();
    slide.background = { color: 'F8FAFC' };
    slide.addText(`Conversación (${Math.floor(i / maxPerSlide) + 1})`, {
      x: 0.3, y: 0.1, w: 9.4, h: 0.5,
      fontSize: 18, bold: true, color: BRAND,
    });

    const batch = messages.slice(i, i + maxPerSlide);
    batch.forEach((m, j) => {
      const isUser = m.role === 'user';
      const y = 0.7 + j * 1.3;
      slide.addShape(pptx.ShapeType.rect, {
        x: isUser ? 0.5 : 1.0, y, w: isUser ? 8.5 : 8.0, h: 1.1,
        fill: { color: isUser ? 'EFF6FF' : 'F0FDF4' },
        line: { color: isUser ? ACCENT : SUCCESS, pt: 0.5 },
      });
      slide.addText(isUser ? '👤 Usuario' : '🤖 Asistente', {
        x: isUser ? 0.65 : 1.15, y: y + 0.05, w: 2, h: 0.25,
        fontSize: 8, bold: true, color: isUser ? ACCENT : SUCCESS,
      });
      const text = m.content.length > 200 ? m.content.substring(0, 197) + '…' : m.content;
      slide.addText(text, {
        x: isUser ? 0.65 : 1.15, y: y + 0.32, w: isUser ? 8.1 : 7.6, h: 0.7,
        fontSize: 9, color: '1E293B', wrap: true,
      });
    });
  }
}

/**
 * Genera una presentación PowerPoint del informe financiero.
 * @param {Object} reportData
 * @returns {Promise<Buffer>}
 */
async function generateFinancialPptx(reportData) {
  const pptx = new PptxGenJS();
  pptx.layout   = 'LAYOUT_WIDE';
  pptx.author   = 'ADATEC Dashboard Financiero';
  pptx.title    = reportData.meta.titulo;

  addTitleSlide(pptx, reportData.meta);
  addKPISlide(pptx, reportData.kpi);
  addAgingSlide(pptx, reportData.aging);
  addClientesSlide(pptx, reportData.top_clientes);
  addVendedoresSlide(pptx, reportData.top_vendedores);
  addAlertasSlide(pptx, reportData.advertencias);

  return pptx.write({ outputType: 'nodebuffer' });
}

/**
 * Genera una presentación PowerPoint de una conversación del chatbot.
 */
async function generateConversationPptx(convData) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title  = convData.meta.titulo;

  addTitleSlide(pptx, convData.meta);

  // Slide de contexto
  const ctxSlide = pptx.addSlide();
  ctxSlide.background = { color: 'F8FAFC' };
  ctxSlide.addText('Contexto de Datos', { x: 0.3, y: 0.2, w: 9.4, h: 0.6, fontSize: 20, bold: true, color: BRAND });
  const kpi = convData.kpi_contexto;
  [
    ['Saldo total cartera', kpi.saldo_total],
    ['Cartera vencida', kpi.cartera_vencida],
    ['% Vencida', kpi.pct_vencida],
    ['Fecha de corte', kpi.fecha_referencia],
  ].forEach(([label, val], i) => {
    ctxSlide.addText(`${label}: `, { x: 1, y: 1.2 + i * 0.7, w: 3, h: 0.5, fontSize: 13, bold: true, color: GRAY });
    ctxSlide.addText(String(val), { x: 3.5, y: 1.2 + i * 0.7, w: 4, h: 0.5, fontSize: 13, color: BRAND, bold: true });
  });

  addConversationSlide(pptx, convData.messages);

  return pptx.write({ outputType: 'nodebuffer' });
}

module.exports = { generateFinancialPptx, generateConversationPptx };
