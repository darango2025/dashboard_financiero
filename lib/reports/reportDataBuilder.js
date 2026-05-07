/**
 * lib/reports/reportDataBuilder.js
 * Construye el objeto de datos para cualquier tipo de reporte.
 * Lee de los artefactos procesados. No usa IA. 100% determinístico.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const PROCESSED = path.join(__dirname, '..', '..', 'data', 'processed');

function loadProcessed(file) {
  const fp = path.join(PROCESSED, file);
  if (!fs.existsSync(fp)) throw new Error(`Artefacto no encontrado: ${file}. Ejecuta preprocess_cartera.js`);
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}

const fmt = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');
const fmtPct = n => Number(n).toFixed(1) + '%';
const fmtNum = n => (Number(n) || 0).toLocaleString('es-CO');

/**
 * Filtra el período del period_index según los filtros del usuario.
 */
function filterPeriod(periodIdx, filters = {}) {
  let data = periodIdx;
  if (filters.desde) data = data.filter(m => m.mes >= filters.desde.substring(0, 7));
  if (filters.hasta) data = data.filter(m => m.mes <= filters.hasta.substring(0, 7));
  return data;
}

/**
 * Construye el conjunto completo de datos para un informe financiero.
 * @param {Object} filters - { desde, hasta }
 * @returns {Object} reportData
 */
function buildFinancialReportData(filters = {}) {
  const kpi      = loadProcessed('kpi_snapshots.json');
  const summaries= loadProcessed('financial_summaries.json');
  const aging    = loadProcessed('aging_index.json');
  const clientes = loadProcessed('customer_index.json');
  const vendors  = loadProcessed('vendor_index.json');
  const periods  = loadProcessed('period_index.json');
  const metadata = loadProcessed('metadata.json');

  const filteredPeriods = filterPeriod(periods, filters);

  // KPIs del período filtrado (si hay filtro, recalcular desde period_index)
  let kpiPeriod = { ...kpi };
  if (filteredPeriods.length > 0 && (filters.desde || filters.hasta)) {
    kpiPeriod.saldo_total        = filteredPeriods.reduce((s, m) => s + m.saldo, 0);
    kpiPeriod.cartera_vencida    = filteredPeriods.reduce((s, m) => s + m.saldo_vencido, 0);
    kpiPeriod.cartera_corriente  = kpiPeriod.saldo_total - kpiPeriod.cartera_vencida;
    kpiPeriod.pct_vencida        = kpiPeriod.saldo_total > 0 ? (kpiPeriod.cartera_vencida / kpiPeriod.saldo_total * 100) : 0;
  }

  // Últimos 6 meses para tendencia
  const last6  = filteredPeriods.slice(-6);
  const last12 = filteredPeriods.slice(-12);

  // Variación período actual vs anterior
  const currentPeriodSaldo  = last6.slice(-1)[0]?.saldo || 0;
  const previousPeriodSaldo = last6.slice(-2)[0]?.saldo || 0;
  const variacionMensual = previousPeriodSaldo > 0
    ? ((currentPeriodSaldo - previousPeriodSaldo) / previousPeriodSaldo * 100)
    : 0;

  return {
    meta: {
      titulo: 'Informe Financiero de Cartera — ADATEC',
      periodo_desde: filters.desde || periods[0]?.mes || 'N/D',
      periodo_hasta: filters.hasta || periods[periods.length - 1]?.mes || 'N/D',
      fecha_generacion: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }),
      fuente_datos: 'data/cartera_export.xlsx',
      advertencia_datos: 'Los saldos representan cartera pendiente al momento de exportación. No incluyen pagos posteriores.',
    },
    kpi: {
      saldo_total:        { value: kpiPeriod.saldo_total,       fmt: fmt(kpiPeriod.saldo_total) },
      cartera_vencida:    { value: kpiPeriod.cartera_vencida,   fmt: fmt(kpiPeriod.cartera_vencida) },
      cartera_corriente:  { value: kpiPeriod.cartera_corriente, fmt: fmt(kpiPeriod.cartera_corriente) },
      pct_vencida:        { value: kpiPeriod.pct_vencida,       fmt: fmtPct(kpiPeriod.pct_vencida) },
      dias_mora_promedio: { value: Math.round(kpi.dias_mora_promedio), fmt: Math.round(kpi.dias_mora_promedio) + ' días' },
      total_clientes:     { value: kpi.total_clientes,          fmt: fmtNum(kpi.total_clientes) },
      total_vendedores:   { value: kpi.total_vendedores,        fmt: fmtNum(kpi.total_vendedores) },
      variacion_mensual:  { value: variacionMensual,            fmt: (variacionMensual >= 0 ? '+' : '') + variacionMensual.toFixed(1) + '%' },
    },
    aging: aging.map(b => ({
      label:   b.label,
      key:     b.key,
      docs:    b.docs,
      saldo:   b.saldo,
      saldo_fmt: fmt(b.saldo),
      pct:     b.pct_saldo,
      pct_fmt: fmtPct(b.pct_saldo),
    })),
    top_clientes: clientes.slice(0, 15).map((c, i) => ({
      rank: i + 1,
      nombre: c.nombre_cliente,
      cod: c.cod_cliente,
      nit: c.nit || '',
      ciudad: c.ciudad || '',
      vendedor: c.vendedor,
      saldo: c.saldo,
      saldo_fmt: fmt(c.saldo),
      saldo_vencido: c.saldo_vencido,
      saldo_vencido_fmt: fmt(c.saldo_vencido),
      pct_total: c.pct_total,
      pct_total_fmt: fmtPct(c.pct_total),
      pct_vencido: c.pct_vencido,
      pct_vencido_fmt: fmtPct(c.pct_vencido),
      dias_mora_max: c.dias_mora_max,
      riesgo: c.riesgo,
      docs: c.docs,
    })),
    top_vendedores: vendors.slice(0, 15).map((v, i) => ({
      rank: i + 1,
      vendedor: v.vendedor,
      cod: v.cod_vendedor,
      saldo: v.saldo,
      saldo_fmt: fmt(v.saldo),
      saldo_vencido: v.saldo_vencido,
      saldo_vencido_fmt: fmt(v.saldo_vencido),
      saldo_corriente: v.saldo_corriente,
      saldo_corriente_fmt: fmt(v.saldo_corriente),
      pct_total: v.pct_total,
      pct_total_fmt: fmtPct(v.pct_total),
      pct_vencido: v.pct_vencido,
      pct_vencido_fmt: fmtPct(v.pct_vencido),
      total_clientes: v.total_clientes,
      docs: v.docs,
    })),
    tendencia_mensual: filteredPeriods,
    tendencia_last6: last6,
    tendencia_last12: last12,
    advertencias: summaries.advertencias || [],
    metricas_no_disponibles: summaries.metricas_no_disponibles || [],
    metadata,
  };
}

/**
 * Construye datos para el reporte de conversación del chatbot.
 */
function buildConversationReportData({ messages, filters = {}, insights = '' }) {
  const kpi = loadProcessed('kpi_snapshots.json');

  return {
    meta: {
      titulo: 'Reporte de Análisis — Chatbot Financiero ADATEC',
      periodo_desde: filters.desde || 'N/D',
      periodo_hasta: filters.hasta || 'N/D',
      fecha_generacion: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }),
      total_mensajes: messages.length,
    },
    kpi_contexto: {
      saldo_total:      fmt(kpi.saldo_total),
      cartera_vencida:  fmt(kpi.cartera_vencida),
      pct_vencida:      fmtPct(kpi.pct_vencida),
      fecha_referencia: kpi.fecha_referencia,
    },
    messages: messages.map(m => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp || '',
    })),
    insights,
    advertencia: 'Las respuestas del chatbot se basan en datos de cartera exportados. Las cifras provienen de cálculos determinísticos del sistema.',
  };
}

module.exports = { buildFinancialReportData, buildConversationReportData };
