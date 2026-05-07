/**
 * lib/reports/xlsxGenerator.js
 * Genera informes financieros en formato Excel (.xlsx)
 * Usa la librería 'exceljs' para estilos avanzados.
 */
'use strict';

const ExcelJS = require('exceljs');

const BRAND_COLOR  = '1E3A5F';
const ACCENT_COLOR = '2563EB';
const DANGER_COLOR = 'DC2626';
const SUCCESS_COLOR= '059669';
const WARNING_COLOR= 'D97706';
const HEADER_FILL  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
const ALT_FILL     = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };

function styleHeader(row) {
  row.eachCell(cell => {
    cell.fill = HEADER_FILL;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top:    { style: 'thin', color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      left:   { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right:  { style: 'thin', color: { argb: 'FFE2E8F0' } },
    };
  });
  row.height = 22;
}

function styleDataRow(row, alt = false) {
  row.eachCell(cell => {
    if (alt) cell.fill = ALT_FILL;
    cell.border = {
      bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } },
      right:  { style: 'hair', color: { argb: 'FFE2E8F0' } },
    };
    cell.alignment = { vertical: 'middle' };
  });
}

/**
 * Genera un workbook Excel con múltiples hojas del informe financiero.
 * @param {Object} reportData
 * @returns {Promise<Buffer>}
 */
async function generateFinancialXlsx(reportData) {
  const { meta, kpi, aging, top_clientes, top_vendedores, tendencia_mensual, advertencias } = reportData;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'ADATEC Dashboard Financiero';
  wb.created = new Date();

  // ── Hoja 1: KPIs ──────────────────────────────────
  const wsKPI = wb.addWorksheet('KPIs Principales', { tabColor: { argb: 'FF1E3A5F' } });
  wsKPI.columns = [{ width: 35 }, { width: 25 }];

  // Título
  wsKPI.mergeCells('A1:B1');
  const titleCell = wsKPI.getCell('A1');
  titleCell.value = meta.titulo;
  titleCell.font = { bold: true, size: 14, color: { argb: 'FF1E3A5F' } };
  titleCell.alignment = { horizontal: 'center' };
  wsKPI.getRow(1).height = 30;

  wsKPI.mergeCells('A2:B2');
  const periodoCell = wsKPI.getCell('A2');
  periodoCell.value = `Período: ${meta.periodo_desde} — ${meta.periodo_hasta}  |  Generado: ${meta.fecha_generacion}`;
  periodoCell.font = { size: 10, color: { argb: 'FF6B7280' } };
  periodoCell.alignment = { horizontal: 'center' };

  wsKPI.addRow([]);

  const headerRow = wsKPI.addRow(['Indicador', 'Valor']);
  styleHeader(headerRow);

  const kpiRows = [
    ['Saldo Total Cartera',   kpi.saldo_total.fmt],
    ['Cartera Vencida',       kpi.cartera_vencida.fmt],
    ['Cartera Corriente',     kpi.cartera_corriente.fmt],
    ['% Cartera Vencida',     kpi.pct_vencida.fmt],
    ['Días Mora Promedio',    kpi.dias_mora_promedio.fmt],
    ['Total Clientes',        kpi.total_clientes.fmt],
    ['Total Vendedores',      kpi.total_vendedores.fmt],
    ['Variación Último Mes',  kpi.variacion_mensual.fmt],
  ];

  kpiRows.forEach((r, i) => {
    const row = wsKPI.addRow(r);
    styleDataRow(row, i % 2 === 1);
    // Color condicional para vencida
    if (r[0] === 'Cartera Vencida' || r[0] === '% Cartera Vencida') {
      row.getCell(2).font = { bold: true, color: { argb: 'FF' + DANGER_COLOR } };
    } else if (r[0] === 'Cartera Corriente') {
      row.getCell(2).font = { bold: true, color: { argb: 'FF' + SUCCESS_COLOR } };
    }
  });

  // Nota metodológica
  wsKPI.addRow([]);
  const noteRow = wsKPI.addRow([meta.advertencia_datos]);
  wsKPI.mergeCells(`A${noteRow.number}:B${noteRow.number}`);
  noteRow.getCell('A').font = { italic: true, size: 9, color: { argb: 'FF6B7280' } };
  noteRow.getCell('A').alignment = { wrapText: true };

  // ── Hoja 2: Aging ────────────────────────────────
  const wsAging = wb.addWorksheet('Aging de Cartera', { tabColor: { argb: 'FFDC2626' } });
  wsAging.columns = [
    { header: 'Rango',          key: 'label',    width: 28 },
    { header: 'Documentos',     key: 'docs',     width: 15 },
    { header: 'Saldo',          key: 'saldo_fmt',width: 22 },
    { header: '% del Total',    key: 'pct_fmt',  width: 15 },
  ];

  const agingHeader = wsAging.getRow(1);
  styleHeader(agingHeader);

  aging.forEach((b, i) => {
    const row = wsAging.addRow(b);
    styleDataRow(row, i % 2 === 1);
    if (b.key === 'mas_360') row.getCell(3).font = { bold: true, color: { argb: 'FF' + DANGER_COLOR } };
    else if (b.key === 'corriente') row.getCell(3).font = { bold: true, color: { argb: 'FF' + SUCCESS_COLOR } };
  });

  // ── Hoja 3: Clientes ─────────────────────────────
  const wsClientes = wb.addWorksheet('Top Clientes', { tabColor: { argb: 'FF2563EB' } });
  wsClientes.columns = [
    { header: '#',            key: 'rank',              width: 5  },
    { header: 'Cliente',      key: 'nombre',            width: 40 },
    { header: 'NIT',          key: 'nit',               width: 16 },
    { header: 'Ciudad',       key: 'ciudad',            width: 18 },
    { header: 'Vendedor',     key: 'vendedor',          width: 22 },
    { header: 'Saldo Total',  key: 'saldo_fmt',         width: 18 },
    { header: 'Vencido',      key: 'saldo_vencido_fmt', width: 18 },
    { header: '% Total',      key: 'pct_total_fmt',     width: 10 },
    { header: '% Vencido',    key: 'pct_vencido_fmt',   width: 10 },
    { header: 'Días Mora Max',key: 'dias_mora_max',     width: 14 },
    { header: 'Riesgo',       key: 'riesgo',            width: 10 },
    { header: 'Docs',         key: 'docs',              width: 8  },
  ];

  styleHeader(wsClientes.getRow(1));
  top_clientes.forEach((c, i) => {
    const row = wsClientes.addRow(c);
    styleDataRow(row, i % 2 === 1);
    const riesgoCell = row.getCell('riesgo');
    if (c.riesgo === 'alto') riesgoCell.font = { bold: true, color: { argb: 'FF' + DANGER_COLOR } };
    else if (c.riesgo === 'medio') riesgoCell.font = { color: { argb: 'FF' + WARNING_COLOR } };
    else riesgoCell.font = { color: { argb: 'FF' + SUCCESS_COLOR } };
  });

  // ── Hoja 4: Vendedores ───────────────────────────
  const wsVend = wb.addWorksheet('Vendedores', { tabColor: { argb: 'FF059669' } });
  wsVend.columns = [
    { header: '#',           key: 'rank',              width: 5  },
    { header: 'Vendedor',    key: 'vendedor',          width: 30 },
    { header: 'Saldo Total', key: 'saldo_fmt',         width: 18 },
    { header: 'Vencido',     key: 'saldo_vencido_fmt', width: 18 },
    { header: 'Corriente',   key: 'saldo_corriente_fmt',width: 18},
    { header: '% Total',     key: 'pct_total_fmt',     width: 10 },
    { header: '% Vencido',   key: 'pct_vencido_fmt',   width: 10 },
    { header: 'Clientes',    key: 'total_clientes',    width: 10 },
    { header: 'Docs',        key: 'docs',              width: 8  },
  ];
  styleHeader(wsVend.getRow(1));
  top_vendedores.forEach((v, i) => {
    const row = wsVend.addRow(v);
    styleDataRow(row, i % 2 === 1);
  });

  // ── Hoja 5: Tendencia Mensual ────────────────────
  const wsTend = wb.addWorksheet('Tendencia Mensual', { tabColor: { argb: 'FF8B5CF6' } });
  wsTend.columns = [
    { header: 'Mes',             key: 'mes',             width: 12 },
    { header: 'Documentos',      key: 'docs',            width: 14 },
    { header: 'Saldo',           key: 'saldo',           width: 20 },
    { header: 'Saldo Vencido',   key: 'saldo_vencido',   width: 20 },
    { header: 'Saldo Corriente', key: 'saldo_corriente', width: 20 },
    { header: 'Clientes',        key: 'clientes',        width: 12 },
  ];
  styleHeader(wsTend.getRow(1));
  tendencia_mensual.slice(-36).forEach((m, i) => {
    const row = wsTend.addRow(m);
    styleDataRow(row, i % 2 === 1);
    // Formatear saldo como número
    row.getCell('saldo').numFmt = '#,##0';
    row.getCell('saldo_vencido').numFmt = '#,##0';
    row.getCell('saldo_corriente').numFmt = '#,##0';
  });

  // Agregar gráfico de línea de tendencia
  const chart = wb.addChart('line', { title: { name: 'Evolución Mensual de Saldo' } });
  // ExcelJS chart support is limited; we add data only

  // ── Hoja 6: Alertas ──────────────────────────────
  const wsAlertas = wb.addWorksheet('Alertas', { tabColor: { argb: 'FFF59E0B' } });
  wsAlertas.columns = [{ width: 12 }, { width: 80 }];
  const alertHeader = wsAlertas.addRow(['Nivel', 'Descripción']);
  styleHeader(alertHeader);
  (advertencias || []).forEach((a, i) => {
    const row = wsAlertas.addRow([a.nivel.toUpperCase(), a.msg]);
    styleDataRow(row, i % 2 === 1);
    row.getCell(1).font = { bold: true, color: { argb: a.nivel === 'critico' ? 'FF' + DANGER_COLOR : 'FF' + WARNING_COLOR } };
  });

  return wb.xlsx.writeBuffer();
}

module.exports = { generateFinancialXlsx };
