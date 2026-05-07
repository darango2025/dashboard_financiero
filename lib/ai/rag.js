/**
 * lib/ai/rag.js
 * Sistema RAG híbrido para cartera ADATEC.
 * 
 * Combina:
 * 1. Búsqueda estructurada (filtros exactos sobre índices precomputados)
 * 2. Búsqueda semántica por keywords en chunks de texto
 * 3. Resúmenes precomputados para respuestas frecuentes
 * 
 * NO usa embeddings vectoriales (no hay API de embeddings configurada).
 * Usa búsqueda textual sobre chunks precomputados.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const PROCESSED = path.join(__dirname, '..', '..', 'data', 'processed');

let _ragChunks    = null;
let _summaries    = null;
let _customerIdx  = null;
let _vendorIdx    = null;
let _kpiSnapshot  = null;
let _periodIdx    = null;
let _agingIdx     = null;
let _loadedAt     = null;

// ─── Carga de artefactos ───────────────────────
function loadArtifacts() {
  if (_loadedAt) return; // ya cargado

  try {
    _ragChunks   = JSON.parse(fs.readFileSync(path.join(PROCESSED, 'rag_chunks.json'), 'utf8'));
    _summaries   = JSON.parse(fs.readFileSync(path.join(PROCESSED, 'financial_summaries.json'), 'utf8'));
    _customerIdx = JSON.parse(fs.readFileSync(path.join(PROCESSED, 'customer_index.json'), 'utf8'));
    _vendorIdx   = JSON.parse(fs.readFileSync(path.join(PROCESSED, 'vendor_index.json'), 'utf8'));
    _kpiSnapshot = JSON.parse(fs.readFileSync(path.join(PROCESSED, 'kpi_snapshots.json'), 'utf8'));
    _periodIdx   = JSON.parse(fs.readFileSync(path.join(PROCESSED, 'period_index.json'), 'utf8'));
    _agingIdx    = JSON.parse(fs.readFileSync(path.join(PROCESSED, 'aging_index.json'), 'utf8'));
    _loadedAt    = new Date().toISOString();
    console.log('[RAG] Artefactos cargados:', _ragChunks.length, 'chunks,', _customerIdx.length, 'clientes');
  } catch (err) {
    console.error('[RAG] Error cargando artefactos:', err.message);
    console.error('[RAG] Ejecuta: node scripts/preprocess_cartera.js');
  }
}

/** Recarga los artefactos (por si cambiaron los datos) */
function reload() {
  _loadedAt = null;
  _ragChunks = _summaries = _customerIdx = _vendorIdx = null;
  _kpiSnapshot = _periodIdx = _agingIdx = null;
  loadArtifacts();
}

// ─── Utilidades de búsqueda ───────────────────
const STOP_WORDS = new Set(['de','la','el','los','las','un','una','y','o','en','con','que','del','al','se','por','es','son','hay','cuánto','cuántos','cuál','cuáles','qué','quién','quiénes','cómo','dónde','cuándo']);

function tokenize(text) {
  return text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar tildes
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOP_WORDS.has(t));
}

function scoreChunk(chunk, queryTokens) {
  const chunkText = (chunk.titulo + ' ' + chunk.contenido + ' ' + chunk.tags.join(' ')).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let score = 0;
  for (const token of queryTokens) {
    const occurrences = (chunkText.match(new RegExp(token, 'g')) || []).length;
    score += occurrences;
    // Bonus si aparece en el título o tags
    if (chunk.titulo.toLowerCase().includes(token)) score += 3;
    if (chunk.tags.some(t => t.includes(token))) score += 2;
  }
  return score;
}

// ─── Búsqueda estructurada ───────────────────
function structuredSearch(query) {
  const qLow = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const results = [];

  // Detectar búsqueda por cliente
  const clientMatch = _customerIdx?.filter(c => {
    const name = (c.nombre_cliente || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const cod  = (c.cod_cliente || '').toLowerCase();
    return name.split(' ').some(w => qLow.includes(w) && w.length > 3) || qLow.includes(cod);
  }).slice(0, 3);

  if (clientMatch?.length > 0) {
    results.push({
      tipo: 'cliente_estructurado',
      datos: clientMatch,
      relevancia: 'alta',
    });
  }

  // Detectar búsqueda por vendedor
  const vendMatch = _vendorIdx?.filter(v => {
    const name = (v.vendedor || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return name.split(' ').some(w => qLow.includes(w) && w.length > 3);
  }).slice(0, 3);

  if (vendMatch?.length > 0) {
    results.push({
      tipo: 'vendedor_estructurado',
      datos: vendMatch,
      relevancia: 'alta',
    });
  }

  // Detectar preguntas de KPI global
  const kpiKeywords = ['total','saldo','cartera','vencida','mora','corriente','porcentaje','pct'];
  if (kpiKeywords.some(k => qLow.includes(k))) {
    results.push({
      tipo: 'kpi_global',
      datos: _kpiSnapshot,
      relevancia: 'alta',
    });
  }

  // Detectar preguntas de aging
  const agingKeywords = ['aging','vencimiento','antiguedad','antigüedad','rango','bucket','dias','días'];
  if (agingKeywords.some(k => qLow.includes(k))) {
    results.push({
      tipo: 'aging',
      datos: _agingIdx,
      relevancia: 'alta',
    });
  }

  // Detectar preguntas de tendencia / periodo
  const tendKeywords = ['mes','mensual','año','anual','trimestre','tendencia','evolucion','evolución','periodo','período'];
  if (tendKeywords.some(k => qLow.includes(k))) {
    results.push({
      tipo: 'tendencia',
      datos: _periodIdx?.slice(-24),
      relevancia: 'media',
    });
  }

  return results;
}

// ─── Búsqueda semántica (keyword-based) ──────
function semanticSearch(query, topK = 4) {
  if (!_ragChunks?.length) return [];
  const tokens = tokenize(query);
  if (tokens.length === 0) return _ragChunks.slice(0, 2);

  return _ragChunks
    .map(chunk => ({ chunk, score: scoreChunk(chunk, tokens) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(r => r.chunk);
}

// ─── Contexto RAG completo ───────────────────
/**
 * Recupera contexto relevante para una consulta.
 * @param {string} query - Pregunta del usuario
 * @param {Object} activeFilters - Filtros activos de la UI { desde, hasta, vendedor, cliente }
 * @returns {Object} - Contexto estructurado para el prompt
 */
function retrieveContext(query, activeFilters = {}) {
  loadArtifacts();
  if (!_ragChunks) {
    return {
      available: false,
      error: 'Datos RAG no disponibles. Ejecuta: node scripts/preprocess_cartera.js',
    };
  }

  const structuredResults = structuredSearch(query);
  const semanticResults   = semanticSearch(query, 5);

  // Construir contexto formateado para el prompt
  const fmt = n => '$' + Math.round(n).toLocaleString('es-CO');
  const fmtPct = n => Number(n).toFixed(1) + '%';

  return {
    available: true,
    query,
    activeFilters,
    structured: structuredResults,
    semantic: semanticResults,
    // Siempre incluir métricas globales como ancla
    keyMetrics: _kpiSnapshot ? [
      { label: 'Saldo total cartera', valor: fmt(_kpiSnapshot.saldo_total) },
      { label: 'Cartera vencida', valor: `${fmt(_kpiSnapshot.cartera_vencida)} (${fmtPct(_kpiSnapshot.pct_vencida)})` },
      { label: 'Cartera corriente', valor: fmt(_kpiSnapshot.cartera_corriente) },
      { label: 'Días mora promedio', valor: `${Math.round(_kpiSnapshot.dias_mora_promedio)} días` },
      { label: 'Total clientes', valor: _kpiSnapshot.total_clientes },
      { label: 'Total vendedores', valor: _kpiSnapshot.total_vendedores },
      { label: 'Fecha de corte', valor: _kpiSnapshot.fecha_referencia },
    ] : [],
    agingData: (_agingIdx || []).map(b => ({
      label: b.label,
      saldo_fmt: fmt(b.saldo),
      docs: b.docs,
      pct: fmtPct(b.pct_saldo),
    })),
    topClientes: (_summaries?.top_clientes || []).slice(0, 10).map(c => ({
      nombre: c.nombre_cliente,
      saldo_fmt: fmt(c.saldo),
      pct_total: c.pct_total?.toFixed(1),
      pct_vencido: c.pct_vencido?.toFixed(1),
      riesgo: c.riesgo,
    })),
    topVendedores: (_summaries?.top_vendedores || []).slice(0, 10).map(v => ({
      vendedor: v.vendedor,
      saldo_fmt: fmt(v.saldo),
      pct_vencido: v.pct_vencido?.toFixed(1),
    })),
    advertencias: _summaries?.advertencias || [],
    limitaciones: _summaries?.metricas_no_disponibles || [],
    generado_en: _loadedAt,
  };
}

/**
 * Formatea el contexto RAG como texto para incluir en el prompt.
 */
function formatContextForPrompt(context) {
  if (!context.available) return `[ERROR RAG] ${context.error}`;

  const parts = [];

  // Contexto semántico (chunks relevantes)
  if (context.semantic?.length > 0) {
    parts.push('INFORMACIÓN RELEVANTE:');
    context.semantic.forEach(c => {
      parts.push(`\n[${c.titulo}]\n${c.contenido}`);
    });
  }

  // Contexto estructurado adicional
  if (context.structured?.length > 0) {
    parts.push('\nDATOS ESTRUCTURADOS ESPECÍFICOS:');
    context.structured.forEach(s => {
      if (s.tipo === 'cliente_estructurado') {
        s.datos.forEach(c => {
          parts.push(`Cliente ${c.nombre_cliente}: saldo $${Math.round(c.saldo).toLocaleString('es-CO')}, vencido: ${c.pct_vencido?.toFixed(1)}%, riesgo: ${c.riesgo}`);
        });
      } else if (s.tipo === 'vendedor_estructurado') {
        s.datos.forEach(v => {
          parts.push(`Vendedor ${v.vendedor}: saldo $${Math.round(v.saldo).toLocaleString('es-CO')}, vencido: ${v.pct_vencido?.toFixed(1)}%`);
        });
      }
    });
  }

  return parts.join('\n');
}

module.exports = { retrieveContext, formatContextForPrompt, reload, loadArtifacts };
