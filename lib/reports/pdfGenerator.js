/**
 * lib/reports/pdfGenerator.js
 * Genera informes financieros en formato PDF usando pdfkit.
 */
'use strict';

const PDFDocument = require('pdfkit');
const { Readable } = require('stream');

const BRAND   = { r: 30, g: 58, b: 95 };
const ACCENT  = { r: 37, g: 99, b: 235 };
const DANGER  = { r: 220, g: 38, b: 38 };
const SUCCESS = { r: 5, g: 150, b: 105 };
const WARNING = { r: 217, g: 119, b: 6 };
const GRAY    = { r: 107, g: 114, b: 128 };
const LIGHT   = { r: 248, g: 250, b: 252 };
const WHITE   = { r: 255, g: 255, b: 255 };
const DARK    = { r: 30, g: 41, b: 59 };

function rgbHex(c) {
  return `#${c.r.toString(16).padStart(2,'0')}${c.g.toString(16).padStart(2,'0')}${c.b.toString(16).padStart(2,'0')}`;
}

function rgbArr(c) {
  return [c.r, c.g, c.b];
}

function docToBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

function addPageHeader(doc, title) {
  doc.rect(0, 0, doc.page.width, 48)
     .fill(rgbHex(BRAND));
  doc.fillColor(rgbHex(WHITE))
     .font('Helvetica-Bold')
     .fontSize(11)
     .text(title, 40, 16, { width: doc.page.width - 140, ellipsis: true });
  doc.fontSize(9)
     .text('ADATEC — Confidencial', doc.page.width - 150, 20, { width: 120, align: 'right' });
  doc.fillColor(rgbHex(DARK));
  doc.y = 68;
}

function addPageFooter(doc, pageNum) {
  const y = doc.page.height - 30;
  doc.rect(0, y - 5, doc.page.width, 30).fill('#F1F5F9');
  doc.fillColor(rgbHex(GRAY))
     .font('Helvetica')
     .fontSize(8)
     .text(`Informe Financiero ADATEC — Página ${pageNum}`, 40, y, { width: doc.page.width - 80, align: 'center' });
  doc.fillColor(rgbHex(DARK));
}

function sectionTitle(doc, text) {
  doc.moveDown(0.5);
  doc.rect(40, doc.y, doc.page.width - 80, 26).fill(rgbHex(BRAND));
  doc.fillColor(rgbHex(WHITE))
     .font('Helvetica-Bold')
     .fontSize(12)
     .text(text, 48, doc.y - 19, { width: doc.page.width - 100 });
  doc.fillColor(rgbHex(DARK));
  doc.moveDown(0.8);
}

function kpiBox(doc, label, value, color, x, y, w = 120, h = 55) {
  doc.rect(x, y, w, h).fill('#F8FAFC').stroke('#E2E8F0');
  doc.fillColor(rgbHex(GRAY)).font('Helvetica').fontSize(8)
     .text(label, x + 6, y + 8, { width: w - 12, align: 'center' });
  doc.fillColor(rgbHex(color)).font('Helvetica-Bold').fontSize(13)
     .text(value, x + 4, y + 24, { width: w - 8, align: 'center' });
  doc.fillColor(rgbHex(DARK));
}

function tableRow(doc, cells, widths, y, isHeader = false, isAlt = false) {
  const x0 = 40;
  if (isHeader) {
    doc.rect(x0, y, widths.reduce((a,b)=>a+b,0), 18).fill(rgbHex(BRAND));
  } else if (isAlt) {
    doc.rect(x0, y, widths.reduce((a,b)=>a+b,0), 16).fill('#F8FAFC');
  }

  let x = x0;
  cells.forEach((cell, i) => {
    const align = typeof cell === 'number' || (typeof cell === 'string' && cell.startsWith('$')) ? 'right' : 'left';
    doc.fillColor(isHeader ? rgbHex(WHITE) : rgbHex(DARK))
       .font(isHeader ? 'Helvetica-Bold' : 'Helvetica')
       .fontSize(isHeader ? 8 : 8)
       .text(String(cell ?? ''), x + 3, y + (isHeader ? 5 : 4), { width: widths[i] - 6, align, ellipsis: true });
    x += widths[i];
  });

  return y + (isHeader ? 18 : 16);
}

/**
 * Genera un PDF del informe financiero.
 * @param {Object} reportData
 * @returns {Promise<Buffer>}
 */
async function generateFinancialPdf(reportData) {
  const { meta, kpi, aging, top_clientes, top_vendedores, advertencias, tendencia_last6 } = reportData;

  const doc = new PDFDocument({
    margin: 40,
    size: 'A4',
    info: { Title: meta.titulo, Author: 'ADATEC Dashboard Financiero', Creator: 'Sistema Financiero ADATEC' },
  });

  let pageNum = 1;
  addPageHeader(doc, meta.titulo);

  // ── PORTADA INFO ─────────────────────────────
  doc.moveDown(1);
  doc.fillColor(rgbHex(GRAY)).font('Helvetica').fontSize(10)
     .text(`Período analizado: ${meta.periodo_desde} — ${meta.periodo_hasta}`, { align: 'center' });
  doc.text(`Generado: ${meta.fecha_generacion}`, { align: 'center' });
  doc.text(`Fuente: ${meta.fuente_datos}`, { align: 'center' });
  doc.moveDown(1);

  doc.rect(40, doc.y, doc.page.width - 80, 1).fill('#E2E8F0');
  doc.moveDown(1);

  // ── KPIs en grid ─────────────────────────────
  sectionTitle(doc, '1. Indicadores Clave de Rendimiento');

  const kpis = [
    { label: 'Saldo Total',      value: kpi.saldo_total.fmt,       color: BRAND   },
    { label: 'Cartera Vencida',  value: kpi.cartera_vencida.fmt,   color: DANGER  },
    { label: 'Cartera Corriente',value: kpi.cartera_corriente.fmt, color: SUCCESS },
    { label: '% Vencida',        value: kpi.pct_vencida.fmt,       color: kpi.pct_vencida.value > 80 ? DANGER : WARNING },
    { label: 'Días Mora Prom.',  value: kpi.dias_mora_promedio.fmt,color: WARNING },
    { label: 'Total Clientes',   value: kpi.total_clientes.fmt,    color: ACCENT  },
  ];

  const boxW = (doc.page.width - 80 - 20) / 3;
  let bx = 40, by = doc.y;
  kpis.forEach((k, i) => {
    kpiBox(doc, k.label, k.value, k.color, bx, by, boxW - 5, 55);
    bx += boxW;
    if ((i + 1) % 3 === 0) { bx = 40; by += 60; }
  });
  doc.y = by + 65;

  // ── Aging ────────────────────────────────────
  sectionTitle(doc, '2. Antigüedad de Cartera (Aging)');

  const agingWidths = [180, 80, 120, 80];
  let ty = doc.y;
  ty = tableRow(doc, ['Rango de Vencimiento', 'Documentos', 'Saldo', '% del Total'], agingWidths, ty, true);
  aging.forEach((b, i) => {
    if (doc.y + 20 > doc.page.height - 60) {
      doc.addPage();
      pageNum++;
      addPageHeader(doc, meta.titulo);
      ty = doc.y;
    }
    ty = tableRow(doc, [b.label, b.docs.toLocaleString('es-CO'), b.saldo_fmt, b.pct_fmt], agingWidths, ty, false, i % 2 === 1);
  });
  doc.y = ty + 10;

  // ── Top Clientes ─────────────────────────────
  doc.addPage();
  pageNum++;
  addPageHeader(doc, meta.titulo);
  sectionTitle(doc, '3. Top 15 Clientes Deudores');

  const clientWidths = [18, 150, 80, 80, 60, 50, 50];
  ty = doc.y;
  ty = tableRow(doc, ['#', 'Cliente', 'Saldo', 'Vencido', '% Total', '% Venc.', 'Riesgo'], clientWidths, ty, true);
  top_clientes.slice(0, 15).forEach((c, i) => {
    if (doc.y + 18 > doc.page.height - 60) {
      doc.addPage();
      pageNum++;
      addPageHeader(doc, meta.titulo);
      ty = doc.y;
    }
    ty = tableRow(doc, [c.rank, c.nombre.substring(0, 22), c.saldo_fmt, c.saldo_vencido_fmt, c.pct_total_fmt, c.pct_vencido_fmt, c.riesgo.toUpperCase()], clientWidths, ty, false, i % 2 === 1);
  });
  doc.y = ty + 10;

  // ── Top Vendedores ───────────────────────────
  sectionTitle(doc, '4. Cartera por Vendedor');

  const vendWidths = [18, 150, 80, 80, 60, 60, 40];
  ty = doc.y;
  ty = tableRow(doc, ['#', 'Vendedor', 'Saldo', 'Vencido', '% Total', '% Venc.', 'Clientes'], vendWidths, ty, true);
  top_vendedores.slice(0, 12).forEach((v, i) => {
    if (doc.y + 18 > doc.page.height - 60) {
      doc.addPage();
      pageNum++;
      addPageHeader(doc, meta.titulo);
      ty = doc.y;
    }
    ty = tableRow(doc, [v.rank, v.vendedor.substring(0, 22), v.saldo_fmt, v.saldo_vencido_fmt, v.pct_total_fmt, v.pct_vencido_fmt, v.total_clientes], vendWidths, ty, false, i % 2 === 1);
  });
  doc.y = ty + 10;

  // ── Alertas ───────────────────────────────────
  if (advertencias?.length > 0) {
    sectionTitle(doc, '5. Alertas Detectadas');
    advertencias.forEach(a => {
      const color = a.nivel === 'critico' ? DANGER : WARNING;
      doc.rect(40, doc.y, doc.page.width - 80, 22).fill(a.nivel === 'critico' ? '#FEF2F2' : '#FFFBEB');
      doc.fillColor(rgbHex(color)).font('Helvetica-Bold').fontSize(9)
         .text(`⚠ [${a.nivel.toUpperCase()}] ${a.msg}`, 48, doc.y - 14, { width: doc.page.width - 100 });
      doc.fillColor(rgbHex(DARK));
      doc.moveDown(0.8);
    });
  }

  // ── Nota metodológica ─────────────────────────
  doc.addPage();
  pageNum++;
  addPageHeader(doc, meta.titulo);
  sectionTitle(doc, 'Notas Metodológicas y Limitaciones');
  doc.fillColor(rgbHex(GRAY)).font('Helvetica').fontSize(9)
     .text(meta.advertencia_datos)
     .moveDown(0.5)
     .text('Los cálculos financieros son determinísticos (código). No se usan cifras generadas por IA.')
     .moveDown(0.5);

  const noDisp = reportData.metricas_no_disponibles || [];
  if (noDisp.length > 0) {
    doc.font('Helvetica-Bold').text('Métricas no disponibles en el dataset:').font('Helvetica');
    noDisp.forEach(m => doc.text(`• ${m.metrica}: ${m.razon}`));
  }

  addPageFooter(doc, pageNum);

  return docToBuffer(doc);
}

/**
 * Genera un PDF de la conversación del chatbot.
 */
async function generateConversationPdf(convData) {
  const { meta, kpi_contexto, messages, insights, advertencia } = convData;

  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  let pageNum = 1;
  addPageHeader(doc, meta.titulo);

  doc.moveDown(0.5);
  doc.fillColor(rgbHex(GRAY)).font('Helvetica').fontSize(9)
     .text(`Generado: ${meta.fecha_generacion}  |  Total mensajes: ${meta.total_mensajes}`, { align: 'center' });
  doc.moveDown(1);

  sectionTitle(doc, 'Contexto de Datos');
  [
    ['Saldo total cartera', kpi_contexto.saldo_total],
    ['Cartera vencida',     kpi_contexto.cartera_vencida],
    ['% Vencida',          kpi_contexto.pct_vencida],
    ['Fecha de corte',     kpi_contexto.fecha_referencia],
  ].forEach(([l, v]) => {
    doc.fillColor(rgbHex(DARK)).font('Helvetica-Bold').fontSize(9).text(l + ': ', { continued: true });
    doc.font('Helvetica').fillColor(rgbHex(ACCENT)).text(v);
    doc.fillColor(rgbHex(DARK));
  });
  doc.moveDown(1);

  sectionTitle(doc, 'Historial de Conversación');
  messages.forEach(m => {
    const isUser = m.role === 'user';
    if (doc.y + 40 > doc.page.height - 60) {
      doc.addPage();
      pageNum++;
      addPageHeader(doc, meta.titulo);
    }
    const bgColor = isUser ? '#EFF6FF' : '#F0FDF4';
    const textColor = isUser ? ACCENT : SUCCESS;
    const roleLabel = isUser ? '👤 Usuario' : '🤖 Asistente';

    doc.rect(40, doc.y, doc.page.width - 80, 14).fill(bgColor);
    doc.fillColor(rgbHex(textColor)).font('Helvetica-Bold').fontSize(8)
       .text(roleLabel, 46, doc.y - 10);
    doc.fillColor(rgbHex(DARK)).font('Helvetica').fontSize(8.5)
       .text(m.content, 46, doc.y + 2, { width: doc.page.width - 92 });
    doc.moveDown(0.6);
  });

  addPageFooter(doc, pageNum);
  return docToBuffer(doc);
}

module.exports = { generateFinancialPdf, generateConversationPdf };
