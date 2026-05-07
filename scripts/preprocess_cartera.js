/**
 * preprocess_cartera.js
 * Pipeline principal de preprocesamiento: Lee cartera_export.xlsx
 * y genera artefactos limpios en data/processed/
 *
 * Uso: node scripts/preprocess_cartera.js
 * Salida: data/processed/*.json
 */
'use strict';

const XLSX = require('xlsx');
const fs   = require('fs');
const path = require('path');

// ─────────────────────────────────────────────
// CONFIGURACIÓN
// ─────────────────────────────────────────────
const SRC_XLSX    = path.join(__dirname, '..', 'data', 'cartera_export.xlsx');
const PROCESSED   = path.join(__dirname, '..', 'data', 'processed');
const REF_DATE    = new Date(); // fecha de referencia para calcular mora dinámica

// Buckets de aging (días mora)
const AGING_BUCKETS = [
  { key: 'corriente',  label: 'Corriente (sin mora)', min: -Infinity, max: 0 },
  { key: '1_30',       label: '1 - 30 días',          min: 1,  max: 30  },
  { key: '31_60',      label: '31 - 60 días',          min: 31, max: 60  },
  { key: '61_90',      label: '61 - 90 días',          min: 61, max: 90  },
  { key: '91_180',     label: '91 - 180 días',         min: 91, max: 180 },
  { key: '181_360',    label: '181 - 360 días',        min: 181,max: 360 },
  { key: 'mas_360',    label: 'Más de 360 días',       min: 361,max: Infinity },
];

// ─────────────────────────────────────────────
// UTILIDADES
// ─────────────────────────────────────────────

/** Convierte número serial de Excel a Date JS */
function excelDateToJS(n) {
  if (!n || typeof n !== 'number') return null;
  // Excel epoch: 1 Jan 1900 = serial 1 (con bug 1900-leap-year)
  return new Date(Math.round((n - 25569) * 86400 * 1000));
}

/** Formatea fecha ISO (YYYY-MM-DD) */
function isoDate(d) {
  if (!d) return null;
  return d.toISOString().substring(0, 10);
}

/** Mes en formato YYYY-MM */
function monthKey(d) {
  if (!d) return null;
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

/** Trimestre YYYY-QN */
function quarterKey(d) {
  if (!d) return null;
  const q = Math.floor(d.getMonth() / 3) + 1;
  return d.getFullYear() + '-Q' + q;
}

/** Normaliza tipo de documento (elimina variantes con espacios/case) */
function normalizeTipoDoc(t) {
  if (!t) return 'DESCONOCIDO';
  return t.trim().toUpperCase().replace(/\s+/g, '');
}

/** Clasifica bucket de aging */
function agingBucket(diasMora) {
  for (const b of AGING_BUCKETS) {
    if (diasMora <= b.max && diasMora >= b.min) return b.key;
  }
  return 'mas_360';
}

/** Saldo seguro (no NaN, no null) */
function safeSaldo(v) {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

// ─────────────────────────────────────────────
// LEER EXCEL
// ─────────────────────────────────────────────
function readCarteraExcel() {
  console.log('📂 Leyendo', SRC_XLSX, '...');
  if (!fs.existsSync(SRC_XLSX)) {
    throw new Error('Archivo no encontrado: ' + SRC_XLSX);
  }
  const wb = XLSX.readFile(SRC_XLSX);
  const ws = wb.Sheets['Cartera'];
  if (!ws) throw new Error('Hoja "Cartera" no encontrada en el Excel');

  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const headers = raw[0];
  const rows    = raw.slice(1);
  console.log(`  Filas crudas: ${rows.length.toLocaleString('es-CO')} | Columnas: ${headers.length}`);
  return { headers, rows };
}

// ─────────────────────────────────────────────
// LIMPIAR Y NORMALIZAR
// ─────────────────────────────────────────────
function cleanAndNormalize(headers, rows) {
  // Mapeo de columnas originales → nombres normalizados
  const COLMAP = {
    'Empresa':           'empresa',
    'Cód. Cliente':      'cod_cliente',
    'Nombre Cliente':    'nombre_cliente',
    'NIT':               'nit',
    'Dirección Cliente': 'direccion',
    'Ciudad':            'ciudad',
    'Teléfono':          'telefono',
    'Email':             'email',
    'Cód. Vendedor':     'cod_vendedor',
    'Vendedor':          'vendedor',
    'Cód. Cobrador':     'cod_cobrador',
    'Tipo Documento':    'tipo_documento',
    'Nro Documento':     'nro_documento',
    'Numero':            'numero',
    'Cuenta Contable':   'cuenta_contable',
    'Fecha Documento':   'fecha_documento_raw',
    'Fecha Vencimiento': 'fecha_vencimiento_raw',
    'Días Mora':         'dias_mora',
    'Saldo':             'saldo',
    'Saldo Base':        'saldo_base',
    'Valor Impuestos':   'valor_impuestos',
    'Base Retención':    'base_retencion',
    'Estado':            'estado',
    'Proceso':           'proceso',
    'Observaciones':     'observaciones',
    'Fecha Creación':    'fecha_creacion_raw',
    'Fecha Modificación':'fecha_modificacion_raw',
  };

  // Índices de columnas
  const idx = {};
  headers.forEach((h, i) => { if (h) idx[COLMAP[h] || h] = i; });

  const warnings = [];
  const records  = [];
  let skipped = 0;
  let nullNames = 0;

  rows.forEach((row, i) => {
    const saldo = safeSaldo(row[idx['saldo']]);

    // Ignorar filas con saldo = 0 (no representan cartera real)
    if (saldo === 0) { skipped++; return; }

    // Fechas
    const fechaDoc  = excelDateToJS(row[idx['fecha_documento_raw']]);
    const fechaVenc = excelDateToJS(row[idx['fecha_vencimiento_raw']]);

    // Días mora: usar el del Excel (calculado en exportación)
    const diasMora = typeof row[idx['dias_mora']] === 'number' ? row[idx['dias_mora']] : 0;

    const nombreCliente = row[idx['nombre_cliente']] || null;
    if (!nombreCliente) nullNames++;

    // Tipo documento normalizado
    const tipoDocNorm = normalizeTipoDoc(row[idx['tipo_documento']]);

    // Estado: N = Pendiente, Y = Pagado/Cerrado
    const estado = row[idx['estado']] === 'Y' ? 'cerrado' : 'pendiente';

    // Proceso: Y = En proceso, U = Sin proceso
    const proceso = row[idx['proceso']] === 'U' ? 'sin_proceso' : 'en_proceso';

    const rec = {
      empresa:        row[idx['empresa']] || '',
      cod_cliente:    String(row[idx['cod_cliente']] || '').trim(),
      nombre_cliente: nombreCliente || 'Sin nombre',
      nit:            row[idx['nit']] ? String(row[idx['nit']]).trim() : null,
      ciudad:         row[idx['ciudad']] || null,
      email:          row[idx['email']] || null,
      cod_vendedor:   String(row[idx['cod_vendedor']] || '').trim(),
      vendedor:       row[idx['vendedor']] || 'Sin asignar',
      cod_cobrador:   String(row[idx['cod_cobrador']] || '').trim(),
      tipo_documento: tipoDocNorm,
      tipo_documento_original: row[idx['tipo_documento']] || '',
      nro_documento:  row[idx['nro_documento']] || '',
      numero:         row[idx['numero']] || '',
      cuenta_contable: row[idx['cuenta_contable']] || null,
      fecha_documento:  isoDate(fechaDoc),
      fecha_vencimiento: isoDate(fechaVenc),
      anio:  fechaDoc ? fechaDoc.getFullYear() : null,
      mes:   fechaDoc ? fechaDoc.getMonth() + 1 : null,
      mes_key: monthKey(fechaDoc),
      trimestre: quarterKey(fechaDoc),
      dias_mora:   diasMora,
      aging_bucket: agingBucket(diasMora),
      saldo:          saldo,
      saldo_base:     safeSaldo(row[idx['saldo_base']]),
      valor_impuestos: safeSaldo(row[idx['valor_impuestos']]),
      base_retencion: safeSaldo(row[idx['base_retencion']]),
      estado:         estado,
      proceso:        proceso,
    };

    records.push(rec);
  });

  if (nullNames > 0) {
    warnings.push({ tipo: 'datos_faltantes', campo: 'nombre_cliente', count: nullNames, mensaje: `${nullNames} registros sin nombre de cliente` });
  }
  if (skipped > 0) {
    warnings.push({ tipo: 'filas_omitidas', motivo: 'saldo_cero', count: skipped, mensaje: `${skipped} filas omitidas por saldo = 0` });
  }

  // Detectar tipos de documento sucios
  const tiposSucios = ['F20', 'F05', 'F11', 'F16', 'F5', 'F.', 'J.', 'J06', 'J005', 'R030', 'R013', 'F0'];
  const tiposActuales = [...new Set(records.map(r => r.tipo_documento))];
  const suciasEncontradas = tiposActuales.filter(t => tiposSucios.some(s => t.startsWith(s) && t !== s + '0'));
  if (suciasEncontradas.length > 0) {
    warnings.push({ tipo: 'normalizacion_tipo_doc', tipos_atipicos: suciasEncontradas, mensaje: 'Tipos de documento con posibles variantes sucias detectados' });
  }

  console.log(`  Registros limpios: ${records.length.toLocaleString('es-CO')}`);
  console.log(`  Advertencias: ${warnings.length}`);

  return { records, warnings };
}

// ─────────────────────────────────────────────
// CONSTRUIR ÍNDICES Y AGREGACIONES
// ─────────────────────────────────────────────
function buildIndexes(records) {
  // ── KPIs globales ──────────────────────────
  const totalSaldo      = records.reduce((s, r) => s + r.saldo, 0);
  const carteraVencida  = records.filter(r => r.dias_mora > 0).reduce((s, r) => s + r.saldo, 0);
  const carteraCorriente = records.filter(r => r.dias_mora <= 0).reduce((s, r) => s + r.saldo, 0);
  const diasMoraVencidos = records.filter(r => r.dias_mora > 0).map(r => r.dias_mora);
  const diasMoraPromedio = diasMoraVencidos.length
    ? diasMoraVencidos.reduce((a, b) => a + b, 0) / diasMoraVencidos.length
    : 0;

  const uniqueClientes  = new Set(records.map(r => r.cod_cliente)).size;
  const uniqueVendedores= new Set(records.map(r => r.cod_vendedor)).size;

  // ── Aging ──────────────────────────────────
  const agingMap = {};
  AGING_BUCKETS.forEach(b => { agingMap[b.key] = { key: b.key, label: b.label, docs: 0, saldo: 0 }; });
  records.forEach(r => {
    const b = r.aging_bucket;
    if (agingMap[b]) { agingMap[b].docs++; agingMap[b].saldo += r.saldo; }
  });
  const aging = Object.values(agingMap).map(b => ({
    ...b,
    pct_saldo: totalSaldo > 0 ? (b.saldo / totalSaldo * 100) : 0,
  }));

  // ── Por cliente ────────────────────────────
  const clienteMap = {};
  records.forEach(r => {
    if (!clienteMap[r.cod_cliente]) {
      clienteMap[r.cod_cliente] = {
        cod_cliente: r.cod_cliente,
        nombre_cliente: r.nombre_cliente,
        nit: r.nit,
        ciudad: r.ciudad,
        cod_vendedor: r.cod_vendedor,
        vendedor: r.vendedor,
        docs: 0,
        saldo: 0,
        saldo_vencido: 0,
        saldo_corriente: 0,
        dias_mora_max: 0,
        aging: {},
      };
    }
    const c = clienteMap[r.cod_cliente];
    c.docs++;
    c.saldo += r.saldo;
    if (r.dias_mora > 0) c.saldo_vencido += r.saldo;
    else c.saldo_corriente += r.saldo;
    if (r.dias_mora > c.dias_mora_max) c.dias_mora_max = r.dias_mora;
    c.aging[r.aging_bucket] = (c.aging[r.aging_bucket] || 0) + r.saldo;
  });
  const clienteIndex = Object.values(clienteMap)
    .sort((a, b) => b.saldo - a.saldo)
    .map(c => ({
      ...c,
      pct_total: totalSaldo > 0 ? (c.saldo / totalSaldo * 100) : 0,
      pct_vencido: c.saldo > 0 ? (c.saldo_vencido / c.saldo * 100) : 0,
      riesgo: c.dias_mora_max > 360 ? 'alto' : c.dias_mora_max > 90 ? 'medio' : 'bajo',
    }));

  // ── Por vendedor ───────────────────────────
  const vendMap = {};
  records.forEach(r => {
    if (!vendMap[r.cod_vendedor]) {
      vendMap[r.cod_vendedor] = {
        cod_vendedor: r.cod_vendedor,
        vendedor: r.vendedor,
        docs: 0,
        saldo: 0,
        saldo_vencido: 0,
        saldo_corriente: 0,
        clientes: new Set(),
      };
    }
    const v = vendMap[r.cod_vendedor];
    v.docs++;
    v.saldo += r.saldo;
    if (r.dias_mora > 0) v.saldo_vencido += r.saldo;
    else v.saldo_corriente += r.saldo;
    v.clientes.add(r.cod_cliente);
  });
  const vendedorIndex = Object.values(vendMap)
    .sort((a, b) => b.saldo - a.saldo)
    .map(v => ({
      cod_vendedor: v.cod_vendedor,
      vendedor: v.vendedor,
      docs: v.docs,
      saldo: v.saldo,
      saldo_vencido: v.saldo_vencido,
      saldo_corriente: v.saldo_corriente,
      total_clientes: v.clientes.size,
      pct_total: totalSaldo > 0 ? (v.saldo / totalSaldo * 100) : 0,
      pct_vencido: v.saldo > 0 ? (v.saldo_vencido / v.saldo * 100) : 0,
    }));

  // ── Por mes ────────────────────────────────
  const mesMap = {};
  records.forEach(r => {
    if (!r.mes_key) return;
    if (!mesMap[r.mes_key]) {
      mesMap[r.mes_key] = { mes: r.mes_key, anio: r.anio, mes_num: r.mes, docs: 0, saldo: 0, saldo_vencido: 0, clientes: new Set() };
    }
    const m = mesMap[r.mes_key];
    m.docs++;
    m.saldo += r.saldo;
    if (r.dias_mora > 0) m.saldo_vencido += r.saldo;
    m.clientes.add(r.cod_cliente);
  });
  const periodIndex = Object.values(mesMap)
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .map(m => ({
      ...m,
      clientes: m.clientes.size,
      saldo_corriente: m.saldo - m.saldo_vencido,
    }));

  // ── Por tipo documento ─────────────────────
  const tipoMap = {};
  records.forEach(r => {
    if (!tipoMap[r.tipo_documento]) tipoMap[r.tipo_documento] = { tipo: r.tipo_documento, docs: 0, saldo: 0 };
    tipoMap[r.tipo_documento].docs++;
    tipoMap[r.tipo_documento].saldo += r.saldo;
  });
  const tipoDocIndex = Object.values(tipoMap).sort((a, b) => b.saldo - a.saldo);

  // ── KPIs snapshot ──────────────────────────
  const kpiSnapshot = {
    generado_en: new Date().toISOString(),
    fecha_referencia: isoDate(REF_DATE),
    total_registros: records.length,
    saldo_total: totalSaldo,
    cartera_vencida: carteraVencida,
    cartera_corriente: carteraCorriente,
    pct_vencida: totalSaldo > 0 ? (carteraVencida / totalSaldo * 100) : 0,
    dias_mora_promedio: diasMoraPromedio,
    total_clientes: uniqueClientes,
    total_vendedores: uniqueVendedores,
    // Rangos de fecha
    fecha_min_documento: records.filter(r=>r.fecha_documento).map(r=>r.fecha_documento).sort()[0] || null,
    fecha_max_documento: records.filter(r=>r.fecha_documento).map(r=>r.fecha_documento).sort().reverse()[0] || null,
    // Concentración (top 10 clientes vs total)
    concentracion_top10: clienteIndex.slice(0,10).reduce((s,c) => s+c.saldo, 0) / totalSaldo * 100,
  };

  return { aging, clienteIndex, vendedorIndex, periodIndex, tipoDocIndex, kpiSnapshot };
}

// ─────────────────────────────────────────────
// RESÚMENES FINANCIEROS
// ─────────────────────────────────────────────
function buildFinancialSummaries(records, indexes) {
  const { kpiSnapshot, aging, clienteIndex, vendedorIndex, periodIndex } = indexes;
  const fmt = n => '$' + Math.round(n).toLocaleString('es-CO');
  const fmtPct = n => n.toFixed(1) + '%';

  // Tendencia mensual (últimos 24 meses)
  const last24 = periodIndex.slice(-24);
  const avgMonthlySaldo = last24.length > 0 ? last24.reduce((s, m) => s + m.saldo, 0) / last24.length : 0;

  // Evolución anual
  const anioMap = {};
  periodIndex.forEach(m => {
    if (!anioMap[m.anio]) anioMap[m.anio] = { anio: m.anio, saldo: 0, saldo_vencido: 0, docs: 0, meses: 0 };
    anioMap[m.anio].saldo += m.saldo;
    anioMap[m.anio].saldo_vencido += m.saldo_vencido;
    anioMap[m.anio].docs += m.docs;
    anioMap[m.anio].meses++;
  });
  const evolucionAnual = Object.values(anioMap).sort((a, b) => a.anio - b.anio);

  // Clientes con riesgo alto
  const clientesRiesgoAlto = clienteIndex.filter(c => c.riesgo === 'alto').length;
  const clientesConMora = clienteIndex.filter(c => c.saldo_vencido > 0).length;

  return {
    generado_en: new Date().toISOString(),
    resumen_ejecutivo: {
      saldo_total: kpiSnapshot.saldo_total,
      saldo_total_fmt: fmt(kpiSnapshot.saldo_total),
      cartera_vencida: kpiSnapshot.cartera_vencida,
      cartera_vencida_fmt: fmt(kpiSnapshot.cartera_vencida),
      cartera_corriente: kpiSnapshot.cartera_corriente,
      cartera_corriente_fmt: fmt(kpiSnapshot.cartera_corriente),
      pct_vencida: kpiSnapshot.pct_vencida,
      pct_vencida_fmt: fmtPct(kpiSnapshot.pct_vencida),
      dias_mora_promedio: Math.round(kpiSnapshot.dias_mora_promedio),
      total_clientes: kpiSnapshot.total_clientes,
      total_clientes_mora: clientesConMora,
      total_vendedores: kpiSnapshot.total_vendedores,
      clientes_riesgo_alto: clientesRiesgoAlto,
      concentracion_top10_pct: kpiSnapshot.concentracion_top10,
    },
    aging: aging.map(b => ({
      ...b,
      saldo_fmt: fmt(b.saldo),
      pct_saldo_fmt: fmtPct(b.pct_saldo),
    })),
    top_clientes: clienteIndex.slice(0, 20).map(c => ({
      ...c,
      saldo_fmt: fmt(c.saldo),
      saldo_vencido_fmt: fmt(c.saldo_vencido),
      pct_total_fmt: fmtPct(c.pct_total),
    })),
    top_vendedores: vendedorIndex.slice(0, 20).map(v => ({
      ...v,
      saldo_fmt: fmt(v.saldo),
      pct_total_fmt: fmtPct(v.pct_total),
      pct_vencido_fmt: fmtPct(v.pct_vencido),
    })),
    tendencia_mensual: last24,
    evolucion_anual: evolucionAnual,
    saldo_mensual_promedio: avgMonthlySaldo,
    advertencias: [
      kpiSnapshot.pct_vencida > 90 ? { nivel: 'critico', msg: `${fmtPct(kpiSnapshot.pct_vencida)} de la cartera está vencida` } : null,
      kpiSnapshot.dias_mora_promedio > 365 ? { nivel: 'critico', msg: `Mora promedio superior a 1 año: ${Math.round(kpiSnapshot.dias_mora_promedio)} días` } : null,
      clientesRiesgoAlto > 0 ? { nivel: 'alto', msg: `${clientesRiesgoAlto} clientes con mora mayor a 360 días` } : null,
      kpiSnapshot.concentracion_top10 > 50 ? { nivel: 'medio', msg: `Alta concentración: top 10 clientes = ${fmtPct(kpiSnapshot.concentracion_top10)} del total` } : null,
    ].filter(Boolean),
    metricas_no_disponibles: [
      { metrica: 'Recaudo / Pagos', razon: 'El Excel no contiene tabla de pagos o abonos aplicados', alternativa: 'Usar Saldo Base vs Saldo actual como proxy' },
      { metrica: 'Facturación vs Recaudo mensual', razon: 'El Excel solo tiene saldos pendientes, no pagos recibidos', alternativa: 'N/A' },
      { metrica: 'Rentabilidad por cliente', razon: 'No hay columna de costo o margen', alternativa: 'N/A' },
    ],
  };
}

// ─────────────────────────────────────────────
// RAG CHUNKS
// ─────────────────────────────────────────────
function buildRAGChunks(records, indexes, summaries) {
  const { kpiSnapshot, aging, clienteIndex, vendedorIndex, periodIndex, tipoDocIndex } = indexes;
  const fmt = n => '$' + Math.round(n).toLocaleString('es-CO');
  const fmtPct = n => n.toFixed(1) + '%';

  const chunks = [];

  // Chunk 1: Resumen global
  chunks.push({
    id: 'global_summary',
    tipo: 'resumen_global',
    titulo: 'Estado General de la Cartera ADATEC',
    contenido: `La cartera de ADATEC tiene un saldo total de ${fmt(kpiSnapshot.saldo_total)} distribuido en ${kpiSnapshot.total_registros.toLocaleString('es-CO')} documentos de ${kpiSnapshot.total_clientes} clientes activos con ${kpiSnapshot.total_vendedores} vendedores. La cartera vencida asciende a ${fmt(kpiSnapshot.cartera_vencida)} (${fmtPct(kpiSnapshot.pct_vencida)} del total). La cartera corriente (sin mora) es de ${fmt(kpiSnapshot.cartera_corriente)}. El promedio de días de mora en documentos vencidos es de ${Math.round(kpiSnapshot.dias_mora_promedio)} días. Los 10 principales clientes concentran el ${fmtPct(kpiSnapshot.concentracion_top10)} del saldo total. Fecha de referencia: ${kpiSnapshot.fecha_referencia}.`,
    tags: ['resumen', 'kpi', 'global', 'saldo', 'vencida', 'corriente'],
    updated_at: new Date().toISOString(),
  });

  // Chunk 2: Aging
  const agingTexto = aging.map(b =>
    `${b.label}: ${b.docs.toLocaleString('es-CO')} documentos, ${fmt(b.saldo)} (${fmtPct(b.pct_saldo)} del total)`
  ).join('. ');
  chunks.push({
    id: 'aging_analysis',
    tipo: 'aging',
    titulo: 'Análisis de Antigüedad de Cartera (Aging)',
    contenido: `Distribución de la cartera por rango de vencimiento: ${agingTexto}. La mayor concentración está en documentos con más de 360 días de mora (${fmtPct(aging.find(b=>b.key==='mas_360')?.pct_saldo||0)} del total), lo que indica cartera de difícil recuperación.`,
    tags: ['aging', 'vencimiento', 'mora', 'distribucion'],
    updated_at: new Date().toISOString(),
  });

  // Chunk 3: Top clientes
  const top5 = clienteIndex.slice(0, 5);
  const top5texto = top5.map(c =>
    `${c.nombre_cliente} (${c.cod_cliente}): ${fmt(c.saldo)} (${fmtPct(c.pct_total)} del total, vencido: ${fmtPct(c.pct_vencido)})`
  ).join('; ');
  chunks.push({
    id: 'top_clientes',
    tipo: 'clientes',
    titulo: 'Top Clientes Deudores',
    contenido: `Los 5 principales clientes deudores son: ${top5texto}. Total de clientes con saldo pendiente: ${kpiSnapshot.total_clientes}. Clientes con mora alta (>360 días): ${clienteIndex.filter(c=>c.dias_mora_max>360).length}. Clientes con mora media (91-360 días): ${clienteIndex.filter(c=>c.dias_mora_max>90&&c.dias_mora_max<=360).length}.`,
    tags: ['clientes', 'deudores', 'top', 'concentracion'],
    updated_at: new Date().toISOString(),
  });

  // Chunk 4: Vendedores
  const topVend5 = vendedorIndex.slice(0, 5);
  const vend5texto = topVend5.map(v =>
    `${v.vendedor}: ${fmt(v.saldo)} (${fmtPct(v.pct_vencido)} vencido, ${v.total_clientes} clientes)`
  ).join('; ');
  chunks.push({
    id: 'vendedores_analysis',
    tipo: 'vendedores',
    titulo: 'Cartera por Vendedor',
    contenido: `Los 5 principales vendedores por saldo de cartera son: ${vend5texto}. Total vendedores activos: ${kpiSnapshot.total_vendedores}.`,
    tags: ['vendedores', 'cartera', 'distribucion'],
    updated_at: new Date().toISOString(),
  });

  // Chunk 5: Tendencia mensual
  const last6 = periodIndex.slice(-6);
  const trend6 = last6.map(m => `${m.mes}: ${fmt(m.saldo)} (${m.docs} docs, vencido: ${fmt(m.saldo_vencido)})`).join('; ');
  chunks.push({
    id: 'tendencia_mensual',
    tipo: 'tendencia',
    titulo: 'Tendencia Mensual de Cartera',
    contenido: `Últimos 6 meses de cartera: ${trend6}. Tendencia de los últimos 12 meses: ${periodIndex.slice(-12).map(m=>m.mes+': '+fmt(m.saldo)).join(', ')}.`,
    tags: ['tendencia', 'mensual', 'evolucion', 'periodo'],
    updated_at: new Date().toISOString(),
  });

  // Chunk 6: Riesgos
  const warnings = summaries.advertencias;
  chunks.push({
    id: 'risk_indicators',
    tipo: 'riesgos',
    titulo: 'Indicadores de Riesgo',
    contenido: `Indicadores de riesgo detectados: ${warnings.map(w=>`[${w.nivel.toUpperCase()}] ${w.msg}`).join('; ')}. Clientes con riesgo alto: ${summaries.resumen_ejecutivo.clientes_riesgo_alto}. Concentración top 10: ${fmtPct(kpiSnapshot.concentracion_top10)}. La cartera muestra señales de deterioro significativo dado que ${fmtPct(kpiSnapshot.pct_vencida)} está vencida.`,
    tags: ['riesgo', 'alertas', 'concentracion', 'deterioro'],
    updated_at: new Date().toISOString(),
  });

  // Chunk 7: Por tipo de documento
  const topTipos = tipoDocIndex.slice(0, 5);
  chunks.push({
    id: 'tipo_documento',
    tipo: 'tipos_documento',
    titulo: 'Distribución por Tipo de Documento',
    contenido: `Tipos de documento con mayor saldo: ${topTipos.map(t=>`${t.tipo}: ${t.docs} docs, ${fmt(t.saldo)}`).join('; ')}. Total tipos de documento: ${tipoDocIndex.length}.`,
    tags: ['tipo_documento', 'distribucion', 'facturas'],
    updated_at: new Date().toISOString(),
  });

  // Chunk 8: Métricas no disponibles
  chunks.push({
    id: 'data_limitations',
    tipo: 'limitaciones',
    titulo: 'Limitaciones y Métricas No Disponibles',
    contenido: `Métricas que NO se pueden calcular con los datos disponibles: ${summaries.metricas_no_disponibles.map(m=>`${m.metrica} (${m.razon})`).join('; ')}. El archivo Excel solo contiene saldos pendientes de cartera, no registros de pagos/recaudos, ni datos de facturación nueva. Los datos de cartera representan documentos con saldo > 0 al momento de la exportación.`,
    tags: ['limitaciones', 'datos_faltantes', 'metodologia'],
    updated_at: new Date().toISOString(),
  });

  // Chunks por cliente (top 20 individuales)
  clienteIndex.slice(0, 20).forEach(c => {
    chunks.push({
      id: `cliente_${c.cod_cliente}`,
      tipo: 'cliente_detalle',
      titulo: `Detalle Cliente: ${c.nombre_cliente}`,
      contenido: `Cliente ${c.nombre_cliente} (código ${c.cod_cliente}, NIT: ${c.nit||'N/D'}, ciudad: ${c.ciudad||'N/D'}): Saldo total ${fmt(c.saldo)} (${fmtPct(c.pct_total)} del total). Cartera vencida: ${fmt(c.saldo_vencido)} (${fmtPct(c.pct_vencido)}). Cartera corriente: ${fmt(c.saldo_corriente)}. Documentos: ${c.docs}. Días mora máximo: ${c.dias_mora_max}. Riesgo: ${c.riesgo}. Vendedor asignado: ${c.vendedor}.`,
      tags: ['cliente', c.cod_cliente, c.nombre_cliente.toLowerCase(), 'detalle'],
      updated_at: new Date().toISOString(),
    });
  });

  return chunks;
}

// ─────────────────────────────────────────────
// METADATA
// ─────────────────────────────────────────────
function buildMetadata(records, warnings, headers) {
  return {
    version: '2.0',
    generado_en: new Date().toISOString(),
    fuente: 'data/cartera_export.xlsx',
    total_registros_raw: records.length,
    columnas_fuente: headers.filter(Boolean),
    columnas_disponibles: [
      'empresa','cod_cliente','nombre_cliente','nit','ciudad','email',
      'cod_vendedor','vendedor','tipo_documento','nro_documento',
      'fecha_documento','fecha_vencimiento','dias_mora','saldo',
      'saldo_base','valor_impuestos','base_retencion','estado','proceso',
    ],
    columnas_derivadas: [
      'anio','mes','mes_key','trimestre','aging_bucket',
    ],
    columnas_no_disponibles: [
      { columna: 'recaudo', razon: 'No existe en el Excel exportado' },
      { columna: 'facturacion', razon: 'Saldo en cartera != facturación nueva' },
      { columna: 'costo', razon: 'No incluido en exportación de cartera' },
    ],
    advertencias: warnings,
    aging_buckets: AGING_BUCKETS.map(b => ({ key: b.key, label: b.label })),
    estados: { N: 'pendiente', Y: 'cerrado' },
    proceso: { Y: 'en_proceso', U: 'sin_proceso' },
  };
}

// ─────────────────────────────────────────────
// GUARDAR ARTEFACTOS
// ─────────────────────────────────────────────
function saveArtifacts(artifacts) {
  if (!fs.existsSync(PROCESSED)) fs.mkdirSync(PROCESSED, { recursive: true });

  const save = (name, obj) => {
    const fp = path.join(PROCESSED, name);
    fs.writeFileSync(fp, JSON.stringify(obj, null, 2));
    const kb = (fs.statSync(fp).size / 1024).toFixed(1);
    console.log(`  ✅ ${name} (${kb} KB)`);
  };

  // cartera_clean.json: muestra (primeros 500 registros para referencia)
  save('cartera_sample.json', artifacts.records.slice(0, 500));
  save('metadata.json',           artifacts.metadata);
  save('kpi_snapshots.json',      artifacts.kpiSnapshot);
  save('period_index.json',       artifacts.periodIndex);
  save('customer_index.json',     artifacts.clienteIndex);
  save('vendor_index.json',       artifacts.vendedorIndex);
  save('aging_index.json',        artifacts.aging);
  save('tipo_doc_index.json',     artifacts.tipoDocIndex);
  save('financial_summaries.json',artifacts.summaries);
  save('rag_chunks.json',         artifacts.ragChunks);

  // También copiar a public/data para acceso frontend
  const pubData = path.join(__dirname, '..', 'public', 'data');
  if (!fs.existsSync(pubData)) fs.mkdirSync(pubData, { recursive: true });
  fs.writeFileSync(path.join(pubData, 'rag_summaries.json'), JSON.stringify(artifacts.ragSummaries, null, 2));
  fs.writeFileSync(path.join(pubData, 'dashboard_data.json'), JSON.stringify(artifacts.dashboardData, null, 2));
  console.log(`  ✅ public/data/rag_summaries.json`);
  console.log(`  ✅ public/data/dashboard_data.json`);
}

// ─────────────────────────────────────────────
// DASHBOARD DATA (retrocompatible)
// ─────────────────────────────────────────────
function buildDashboardData(records, indexes) {
  const { kpiSnapshot, aging, clienteIndex, vendedorIndex, periodIndex, tipoDocIndex } = indexes;
  return {
    generado_en: new Date().toISOString(),
    kpis: {
      total_documentos: kpiSnapshot.total_registros,
      saldo_total: kpiSnapshot.saldo_total,
      cartera_vencida: kpiSnapshot.cartera_vencida,
      cartera_por_vencer: kpiSnapshot.cartera_corriente,
      pct_vencida: kpiSnapshot.pct_vencida,
      dias_mora_promedio: kpiSnapshot.dias_mora_promedio,
      total_clientes: kpiSnapshot.total_clientes,
      total_vendedores: kpiSnapshot.total_vendedores,
      saldo_base_total: records.reduce((s, r) => s + r.saldo_base, 0),
      base_retencion_total: records.reduce((s, r) => s + r.base_retencion, 0),
    },
    aging: aging.map(b => ({
      rango: b.label,
      key: b.key,
      documentos: b.docs,
      saldo: b.saldo,
      pct_del_total: b.pct_saldo,
    })),
    top_clientes: clienteIndex.slice(0, 20).map(c => ({
      codigo: c.cod_cliente,
      nombre: c.nombre_cliente,
      nit: c.nit || '',
      ciudad: c.ciudad || '',
      documentos: c.docs,
      saldo: c.saldo,
      saldo_vencido: c.saldo_vencido,
      saldo_base: c.saldo_base || c.saldo,
      pct_vencido: c.pct_vencido,
      pct_del_total: c.pct_total,
    })),
    cartera_vendedor: vendedorIndex.slice(0, 20).map(v => ({
      codigo: v.cod_vendedor,
      nombre: v.vendedor,
      documentos: v.docs,
      saldo_total: v.saldo,
      saldo_vencido: v.saldo_vencido,
      saldo_corriente: v.saldo_corriente,
      dias_mora_promedio: 0, // calculado en frontend o en detalle
    })),
    tipo_documento: tipoDocIndex.map(t => ({
      tipo: t.tipo,
      documentos: t.docs,
      saldo: t.saldo,
    })),
    // Facturación mensual (proxy: saldo por mes de documento)
    facturacion_mensual: periodIndex.map(m => ({
      mes: m.mes + '-01',
      documentos: m.docs,
      saldo: m.saldo,
      facturado: m.saldo,
    })),
    // Recaudos: no disponibles en este Excel
    recaudos_mensual: [],
    pedidos_mensual: [],
    generated_from: 'data/cartera_export.xlsx',
  };
}

// ─────────────────────────────────────────────
// RAG SUMMARIES (retrocompatible con server.js)
// ─────────────────────────────────────────────
function buildRAGSummaries(records, indexes, summaries) {
  const { kpiSnapshot, aging, clienteIndex, vendedorIndex, periodIndex } = indexes;
  const fmt = n => '$' + Math.round(n).toLocaleString('es-CO');
  const fmtPct = n => n.toFixed(1) + '%';

  return {
    generated_at: new Date().toISOString(),
    version: '2.0',
    data_source: 'data/cartera_export.xlsx',
    general_overview: {
      title: 'Resumen General de Cartera ADATEC',
      key_facts: [
        `Saldo total de cartera: ${fmt(kpiSnapshot.saldo_total)} en ${kpiSnapshot.total_registros.toLocaleString('es-CO')} documentos`,
        `Cartera vencida: ${fmt(kpiSnapshot.cartera_vencida)} (${fmtPct(kpiSnapshot.pct_vencida)} del total)`,
        `Cartera corriente (sin mora): ${fmt(kpiSnapshot.cartera_corriente)}`,
        `Días mora promedio (vencidos): ${Math.round(kpiSnapshot.dias_mora_promedio)} días`,
        `Total clientes con saldo pendiente: ${kpiSnapshot.total_clientes}`,
        `Total vendedores activos: ${kpiSnapshot.total_vendedores}`,
        `Fecha de corte: ${kpiSnapshot.fecha_referencia}`,
        `Concentración top 10 clientes: ${fmtPct(kpiSnapshot.concentracion_top10)}`,
      ],
      critical_alerts: summaries.advertencias.map(w => `[${w.nivel.toUpperCase()}] ${w.msg}`),
    },
    key_metrics: {
      metrics: {
        saldo_total:        { value: kpiSnapshot.saldo_total,        formatted: fmt(kpiSnapshot.saldo_total) },
        cartera_vencida:    { value: kpiSnapshot.cartera_vencida,    formatted: fmt(kpiSnapshot.cartera_vencida) },
        cartera_corriente:  { value: kpiSnapshot.cartera_corriente,  formatted: fmt(kpiSnapshot.cartera_corriente) },
        pct_vencida:        { value: kpiSnapshot.pct_vencida,        formatted: fmtPct(kpiSnapshot.pct_vencida) },
        dias_mora_promedio: { value: kpiSnapshot.dias_mora_promedio, formatted: Math.round(kpiSnapshot.dias_mora_promedio) + ' días' },
        total_documentos:   { value: kpiSnapshot.total_registros,    formatted: kpiSnapshot.total_registros.toLocaleString('es-CO') },
        total_clientes:     { value: kpiSnapshot.total_clientes,     formatted: kpiSnapshot.total_clientes.toLocaleString('es-CO') },
      },
    },
    aging_analysis: {
      rangos: aging.map(b => ({
        rango: b.label,
        key: b.key,
        documentos: b.docs,
        saldo: b.saldo,
        formatted: fmt(b.saldo),
        pct_del_total: fmtPct(b.pct_saldo),
      })),
    },
    client_analysis: {
      top_10_deudores: clienteIndex.slice(0, 10).map(c => ({
        codigo: c.cod_cliente,
        nombre: c.nombre_cliente,
        saldo: c.saldo,
        saldo_vencido: c.saldo_vencido,
        pct_del_total: c.pct_total.toFixed(1),
        pct_vencido: c.pct_vencido.toFixed(1),
        riesgo: c.riesgo,
        dias_mora_max: c.dias_mora_max,
      })),
    },
    vendor_analysis: {
      top_10_vendedores: vendedorIndex.slice(0, 10).map(v => ({
        codigo: v.cod_vendedor,
        nombre: v.vendedor,
        saldo_total: v.saldo,
        saldo_vencido: v.saldo_vencido,
        pct_vencido: v.pct_vencido.toFixed(1),
        total_clientes: v.total_clientes,
      })),
    },
    periodic_summaries: summaries.evolucion_anual.map(a => ({
      year: a.anio,
      facturacion_total: a.saldo,
      recaudo_total: 0, // No disponible en este dataset
      eficiencia: 'N/D',
      documentos: a.docs,
    })),
    trends: {
      saldo_mensual_promedio: { value: summaries.saldo_mensual_promedio, formatted: fmt(summaries.saldo_mensual_promedio) },
      facturacion_promedio_mensual: { value: summaries.saldo_mensual_promedio, formatted: fmt(summaries.saldo_mensual_promedio) },
      recaudo_promedio_mensual: { value: 0, formatted: 'N/D - no disponible en dataset' },
      brecha_promedio: { value: 0, formatted: 'N/D - requiere datos de recaudo' },
      tendencia_ultimos_6_meses: periodIndex.slice(-6).map(m => ({ mes: m.mes, saldo: m.saldo })),
    },
    risk_indicators: {
      riesgos: [
        { nivel: kpiSnapshot.pct_vencida > 90 ? 'CRITICO' : 'ALTO', indicador: 'Porcentaje cartera vencida', valor: fmtPct(kpiSnapshot.pct_vencida) },
        { nivel: kpiSnapshot.dias_mora_promedio > 365 ? 'CRITICO' : 'ALTO', indicador: 'Días mora promedio', valor: Math.round(kpiSnapshot.dias_mora_promedio) + ' días' },
        { nivel: 'ALTO', indicador: 'Clientes con mora +360 días', valor: clienteIndex.filter(c=>c.dias_mora_max>360).length.toString() },
        { nivel: kpiSnapshot.concentracion_top10 > 50 ? 'MEDIO' : 'BAJO', indicador: 'Concentración top 10 clientes', valor: fmtPct(kpiSnapshot.concentracion_top10) },
      ],
    },
    data_limitations: summaries.metricas_no_disponibles,
  };
}

// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────
async function main() {
  console.log('\n🚀 PIPELINE DE PREPROCESAMIENTO DE CARTERA');
  console.log('==========================================');

  try {
    // 1. Leer Excel
    const { headers, rows } = readCarteraExcel();

    // 2. Limpiar y normalizar
    console.log('\n🧹 Limpiando y normalizando datos...');
    const { records, warnings } = cleanAndNormalize(headers, rows);

    // 3. Construir índices
    console.log('\n📊 Construyendo índices y agregaciones...');
    const indexes = buildIndexes(records);
    const { aging, clienteIndex, vendedorIndex, periodIndex, tipoDocIndex, kpiSnapshot } = indexes;

    // 4. Resúmenes financieros
    console.log('\n💰 Generando resúmenes financieros...');
    const summaries = buildFinancialSummaries(records, indexes);

    // 5. RAG chunks
    console.log('\n🔍 Construyendo chunks RAG...');
    const ragChunks = buildRAGChunks(records, indexes, summaries);

    // 6. Dashboard data (retrocompatible)
    const dashboardData = buildDashboardData(records, indexes);
    const ragSummaries  = buildRAGSummaries(records, indexes, summaries);
    const metadata      = buildMetadata(records, warnings, headers);

    // 7. Guardar todo
    console.log('\n💾 Guardando artefactos...');
    saveArtifacts({
      records, metadata, kpiSnapshot, periodIndex,
      clienteIndex, vendedorIndex, aging, tipoDocIndex,
      summaries, ragChunks, dashboardData, ragSummaries,
    });

    console.log('\n✅ PIPELINE COMPLETADO');
    console.log('  KPIs:');
    console.log(`    Saldo total:     $${Math.round(kpiSnapshot.saldo_total).toLocaleString('es-CO')}`);
    console.log(`    Cartera vencida: $${Math.round(kpiSnapshot.cartera_vencida).toLocaleString('es-CO')} (${kpiSnapshot.pct_vencida.toFixed(1)}%)`);
    console.log(`    Total clientes:  ${kpiSnapshot.total_clientes}`);
    console.log(`    Chunks RAG:      ${ragChunks.length}`);
    if (warnings.length > 0) {
      console.log('\n⚠️  Advertencias de calidad:');
      warnings.forEach(w => console.log(`  - [${w.tipo}] ${w.mensaje}`));
    }

  } catch (err) {
    console.error('\n❌ Error en pipeline:', err.message);
    process.exit(1);
  }
}

main();
