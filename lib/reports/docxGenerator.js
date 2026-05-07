/**
 * lib/reports/docxGenerator.js
 * Genera informes financieros en formato Word (.docx)
 * Usa la librería 'docx'.
 */
'use strict';

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, WidthType, BorderStyle, ShadingType,
  PageBreak, Header, Footer, PageNumber, NumberFormat,
} = require('docx');

const BRAND_COLOR = '1E3A5F';  // azul corporativo
const ACCENT_COLOR = '2563EB';
const DANGER_COLOR = 'DC2626';
const WARNING_COLOR = 'D97706';
const SUCCESS_COLOR = '059669';
const GRAY = '6B7280';
const LIGHT_BG = 'F8FAFC';

// ─── Helpers ──────────────────────────────────
function heading1(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 200 },
    run: { color: BRAND_COLOR, bold: true },
  });
}

function heading2(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 150 },
  });
}

function para(text, options = {}) {
  return new Paragraph({
    children: [new TextRun({ text, size: 22, ...options })],
    spacing: { after: 100 },
  });
}

function boldPara(label, value, color) {
  return new Paragraph({
    children: [
      new TextRun({ text: label + ': ', bold: true, size: 22 }),
      new TextRun({ text: value, size: 22, color: color || BRAND_COLOR }),
    ],
    spacing: { after: 80 },
  });
}

function kpiRow(label, value, color) {
  return new TableRow({
    children: [
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 20 })] })],
        width: { size: 50, type: WidthType.PERCENTAGE },
      }),
      new TableCell({
        children: [new Paragraph({
          children: [new TextRun({ text: value, size: 20, color: color || BRAND_COLOR, bold: true })],
          alignment: AlignmentType.RIGHT,
        })],
        width: { size: 50, type: WidthType.PERCENTAGE },
      }),
    ],
  });
}

function tableHeaderRow(headers) {
  return new TableRow({
    tableHeader: true,
    children: headers.map(h => new TableCell({
      children: [new Paragraph({
        children: [new TextRun({ text: h, bold: true, size: 18, color: 'FFFFFF' })],
        alignment: AlignmentType.CENTER,
      })],
      shading: { type: ShadingType.SOLID, color: BRAND_COLOR },
    })),
  });
}

function tableDataRow(cells, zebra = false) {
  return new TableRow({
    children: cells.map(c => new TableCell({
      children: [new Paragraph({
        children: [new TextRun({ text: String(c ?? ''), size: 18 })],
        alignment: typeof c === 'number' ? AlignmentType.RIGHT : AlignmentType.LEFT,
      })],
      shading: zebra ? { type: ShadingType.SOLID, color: LIGHT_BG } : undefined,
    })),
  });
}

function divider() {
  return new Paragraph({ text: '', spacing: { before: 200, after: 200 }, border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' } } });
}

// ─── Sección de portada ───────────────────────
function buildCoverSection(meta) {
  return [
    new Paragraph({ text: '', spacing: { before: 1200 } }),
    new Paragraph({
      children: [new TextRun({ text: meta.titulo, bold: true, size: 48, color: BRAND_COLOR })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({ text: 'ADATEC — Sistema de Análisis Financiero', size: 28, color: GRAY })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `Período: ${meta.periodo_desde} — ${meta.periodo_hasta}`, size: 24, color: GRAY })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `Generado: ${meta.fecha_generacion}`, size: 22, color: GRAY })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

// ─── KPI summary table ────────────────────────
function buildKPISection(kpi) {
  return [
    heading1('1. Indicadores Clave de Rendimiento'),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        kpiRow('Saldo Total Cartera',    kpi.saldo_total.fmt,        BRAND_COLOR),
        kpiRow('Cartera Vencida',        kpi.cartera_vencida.fmt,    DANGER_COLOR),
        kpiRow('Cartera Corriente',      kpi.cartera_corriente.fmt,  SUCCESS_COLOR),
        kpiRow('% Cartera Vencida',      kpi.pct_vencida.fmt,        kpi.pct_vencida.value > 80 ? DANGER_COLOR : WARNING_COLOR),
        kpiRow('Días Mora Promedio',     kpi.dias_mora_promedio.fmt, WARNING_COLOR),
        kpiRow('Total Clientes',         kpi.total_clientes.fmt,     BRAND_COLOR),
        kpiRow('Total Vendedores',       kpi.total_vendedores.fmt,   BRAND_COLOR),
        kpiRow('Variación Período',      kpi.variacion_mensual.fmt,  kpi.variacion_mensual.value >= 0 ? DANGER_COLOR : SUCCESS_COLOR),
      ],
    }),
    divider(),
  ];
}

// ─── Aging ────────────────────────────────────
function buildAgingSection(aging) {
  return [
    heading1('2. Análisis de Antigüedad de Cartera (Aging)'),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        tableHeaderRow(['Rango de Vencimiento', 'Documentos', 'Saldo', '% del Total']),
        ...aging.map((b, i) => tableDataRow([b.label, b.docs.toLocaleString('es-CO'), b.saldo_fmt, b.pct_fmt], i % 2 === 1)),
      ],
    }),
    new Paragraph({ text: '', spacing: { after: 150 } }),
    para(`La mayor concentración de cartera se encuentra en el rango "${aging.sort((a,b)=>b.saldo-a.saldo)[0]?.label}" con ${aging.sort((a,b)=>b.saldo-a.saldo)[0]?.pct_fmt} del saldo total.`, { color: GRAY }),
    divider(),
  ];
}

// ─── Top Clientes ────────────────────────────
function buildClientesSection(topClientes) {
  return [
    heading1('3. Top Clientes Deudores'),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        tableHeaderRow(['#', 'Cliente', 'Saldo Total', 'Vencido', '% Total', 'Riesgo']),
        ...topClientes.slice(0, 10).map((c, i) => tableDataRow([
          c.rank,
          c.nombre.length > 30 ? c.nombre.substring(0, 28) + '...' : c.nombre,
          c.saldo_fmt,
          c.saldo_vencido_fmt,
          c.pct_total_fmt,
          c.riesgo.toUpperCase(),
        ], i % 2 === 1)),
      ],
    }),
    divider(),
  ];
}

// ─── Top Vendedores ───────────────────────────
function buildVendedoresSection(topVendedores) {
  return [
    heading1('4. Cartera por Vendedor'),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        tableHeaderRow(['#', 'Vendedor', 'Saldo Total', 'Vencido', '% Total', '% Vencido']),
        ...topVendedores.slice(0, 10).map((v, i) => tableDataRow([
          v.rank,
          v.vendedor.length > 30 ? v.vendedor.substring(0, 28) + '...' : v.vendedor,
          v.saldo_fmt,
          v.saldo_vencido_fmt,
          v.pct_total_fmt,
          v.pct_vencido_fmt,
        ], i % 2 === 1)),
      ],
    }),
    divider(),
  ];
}

// ─── Advertencias ─────────────────────────────
function buildWarningsSection(advertencias, metricas_no_disponibles) {
  const items = [];
  items.push(heading1('5. Alertas y Limitaciones'));

  if (advertencias?.length > 0) {
    items.push(heading2('Alertas detectadas'));
    advertencias.forEach(a => {
      items.push(para(`⚠️ [${a.nivel.toUpperCase()}] ${a.msg}`, { color: a.nivel === 'critico' ? DANGER_COLOR : WARNING_COLOR, bold: true }));
    });
  }

  if (metricas_no_disponibles?.length > 0) {
    items.push(heading2('Métricas no disponibles en el dataset'));
    metricas_no_disponibles.forEach(m => {
      items.push(para(`• ${m.metrica}: ${m.razon}`, { color: GRAY }));
    });
  }

  return items;
}

// ─── Metodología ─────────────────────────────
function buildMethodologySection(meta) {
  return [
    new Paragraph({ children: [new PageBreak()] }),
    heading1('Notas Metodológicas'),
    para('Fuente de datos: ' + meta.fuente_datos),
    para('Fecha de generación: ' + meta.fecha_generacion),
    para(meta.advertencia_datos, { color: GRAY, italics: true }),
    para('Los cálculos financieros son determinísticos, generados por código. No se usan estimaciones de IA para cifras.', { color: GRAY }),
  ];
}

// ─── GENERADOR PRINCIPAL ──────────────────────
/**
 * Genera un documento Word (.docx) del informe financiero.
 * @param {Object} reportData - Datos del reporte (de reportDataBuilder)
 * @returns {Promise<Buffer>} Buffer del archivo .docx
 */
async function generateFinancialDocx(reportData) {
  const { meta, kpi, aging, top_clientes, top_vendedores, advertencias, metricas_no_disponibles } = reportData;

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 22, color: '1E293B' },
        },
      },
    },
    sections: [{
      properties: {},
      headers: {
        default: new Header({
          children: [new Paragraph({
            children: [
              new TextRun({ text: 'ADATEC — Informe de Cartera', bold: true, size: 18, color: GRAY }),
              new TextRun({ text: '   |   Confidencial', size: 18, color: GRAY }),
            ],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            children: [
              new TextRun({ text: 'Página ', size: 18, color: GRAY }),
              new TextRun({ children: [PageNumber.CURRENT], size: 18, color: GRAY }),
              new TextRun({ text: ' de ', size: 18, color: GRAY }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: GRAY }),
              new TextRun({ text: `   |   Generado: ${meta.fecha_generacion}`, size: 18, color: GRAY }),
            ],
          })],
        }),
      },
      children: [
        ...buildCoverSection(meta),
        ...buildKPISection(kpi),
        ...buildAgingSection(aging),
        ...buildClientesSection(top_clientes),
        ...buildVendedoresSection(top_vendedores),
        ...buildWarningsSection(advertencias, metricas_no_disponibles),
        ...buildMethodologySection(meta),
      ],
    }],
  });

  return Packer.toBuffer(doc);
}

/**
 * Genera un documento Word del historial de conversación del chatbot.
 */
async function generateConversationDocx(convData) {
  const { meta, kpi_contexto, messages, insights, advertencia } = convData;

  const msgElements = [];
  messages.forEach(m => {
    const isUser = m.role === 'user';
    msgElements.push(
      new Paragraph({
        children: [
          new TextRun({ text: isUser ? '👤 Usuario' : '🤖 Asistente', bold: true, size: 20, color: isUser ? ACCENT_COLOR : BRAND_COLOR }),
          m.timestamp ? new TextRun({ text: `  ${m.timestamp}`, size: 18, color: GRAY }) : new TextRun(''),
        ],
        spacing: { before: 200, after: 60 },
      }),
      new Paragraph({
        children: [new TextRun({ text: m.content, size: 20, color: isUser ? '1E293B' : '334155' })],
        spacing: { after: 150 },
        indent: { left: 300 },
      })
    );
  });

  const doc = new Document({
    sections: [{
      children: [
        ...buildCoverSection(meta),
        heading1('Contexto de Datos'),
        boldPara('Saldo total cartera', kpi_contexto.saldo_total),
        boldPara('Cartera vencida', kpi_contexto.cartera_vencida),
        boldPara('% Vencida', kpi_contexto.pct_vencida),
        boldPara('Fecha de corte datos', kpi_contexto.fecha_referencia),
        divider(),
        heading1('Historial de Conversación'),
        ...msgElements,
        divider(),
        ...(insights ? [heading1('Insights Generados'), para(insights)] : []),
        heading1('Advertencia'),
        para(advertencia, { color: GRAY, italics: true }),
      ],
    }],
  });

  return Packer.toBuffer(doc);
}

module.exports = { generateFinancialDocx, generateConversationDocx };
