/**
 * scripts/validate_pipeline.js
 * Verifica que todos los artefactos del pipeline estén presentes y sean válidos.
 * Ejecutar con: node scripts/validate_pipeline.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const PROCESSED = path.join(__dirname, '..', 'data', 'processed');
const PUBLIC    = path.join(__dirname, '..', 'public', 'data');

let passed = 0, failed = 0;

function check(label, fn) {
  try {
    const result = fn();
    if (result === true || result === undefined) {
      console.log(`  ✅ ${label}`);
      passed++;
    } else {
      console.log(`  ❌ ${label}: ${result}`);
      failed++;
    }
  } catch (err) {
    console.log(`  ❌ ${label}: ${err.message}`);
    failed++;
  }
}

function readJson(fp) {
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}

console.log('\n🔍 ADATEC — Validación del Pipeline\n');

// ─── 1. Artefactos en data/processed/ ────────────────────────────────────────
console.log('1. Artefactos en data/processed/');
const REQUIRED_FILES = [
  'metadata.json',
  'kpi_snapshots.json',
  'aging_index.json',
  'customer_index.json',
  'vendor_index.json',
  'period_index.json',
  'tipo_doc_index.json',
  'financial_summaries.json',
  'rag_chunks.json',
  'cartera_sample.json',
];

REQUIRED_FILES.forEach(f => {
  const fp = path.join(PROCESSED, f);
  check(f, () => fs.existsSync(fp) || `No encontrado: ${fp}`);
});

// ─── 2. Artefactos en public/data/ ───────────────────────────────────────────
console.log('\n2. Artefactos en public/data/');
['dashboard_data.json', 'rag_summaries.json'].forEach(f => {
  check(f, () => fs.existsSync(path.join(PUBLIC, f)) || 'No encontrado');
});

// ─── 3. Integridad de KPIs ───────────────────────────────────────────────────
console.log('\n3. Integridad de KPIs');
check('kpi_snapshots.json tiene saldo_total', () => {
  const kpis = readJson(path.join(PROCESSED, 'kpi_snapshots.json'));
  return !!kpis.saldo_total || 'Falta saldo_total';
});
check('saldo_total > 0', () => {
  const kpis = readJson(path.join(PROCESSED, 'kpi_snapshots.json'));
  const st = kpis.saldo_total;
  return (st > 0) || `saldo_total=${st}`;
});
check('total_clientes > 0', () => {
  const kpis = readJson(path.join(PROCESSED, 'kpi_snapshots.json'));
  return (kpis.total_clientes > 0) || 'total_clientes=0';
});

// ─── 4. RAG chunks ───────────────────────────────────────────────────────────
console.log('\n4. RAG chunks');
check('rag_chunks.json tiene >= 10 chunks', () => {
  const chunks = readJson(path.join(PROCESSED, 'rag_chunks.json'));
  return Array.isArray(chunks) && chunks.length >= 10 || `Solo ${chunks.length} chunks`;
});
check('Todos los chunks tienen campo contenido', () => {
  const chunks = readJson(path.join(PROCESSED, 'rag_chunks.json'));
  const missing = chunks.filter(c => !c.contenido && !c.content).length;
  return missing === 0 || `${missing} chunks sin contenido/content`;
});

// ─── 5. Índice de clientes ───────────────────────────────────────────────────
console.log('\n5. Índice de clientes');
check('customer_index tiene >= 100 clientes', () => {
  const idx = readJson(path.join(PROCESSED, 'customer_index.json'));
  const n = Object.keys(idx).length;
  return n >= 100 || `Solo ${n} clientes`;
});

// ─── 6. Dashboard data ───────────────────────────────────────────────────────
console.log('\n6. dashboard_data.json (public)');
check('Tiene campo kpis', () => {
  const d = readJson(path.join(PUBLIC, 'dashboard_data.json'));
  return !!d.kpis || 'Falta campo kpis';
});
check('Tiene aging array', () => {
  const d = readJson(path.join(PUBLIC, 'dashboard_data.json'));
  return Array.isArray(d.aging) && d.aging.length > 0 || 'aging vacío';
});
check('Tiene top_clientes array', () => {
  const d = readJson(path.join(PUBLIC, 'dashboard_data.json'));
  return Array.isArray(d.top_clientes) && d.top_clientes.length > 0 || 'top_clientes vacío';
});

// ─── 7. Server modules ───────────────────────────────────────────────────────
console.log('\n7. Módulos del servidor');
['lib/ai/deepseek.js', 'lib/ai/rag.js', 'lib/ai/prompts.js', 'lib/ai/guardrails.js',
 'lib/reports/reportDataBuilder.js', 'lib/reports/docxGenerator.js',
 'lib/reports/xlsxGenerator.js', 'lib/reports/pptxGenerator.js', 'lib/reports/pdfGenerator.js'
].forEach(mod => {
  check(mod, () => {
    require(path.join(__dirname, '..', mod));
    return true;
  });
});

// ─── Resumen ─────────────────────────────────────────────────────────────────
console.log('\n─────────────────────────────────────────');
console.log(`Resultado: ${passed} pasaron ✅ / ${failed} fallaron ❌`);
if (failed === 0) {
  console.log('✅ Pipeline completamente validado.\n');
  process.exit(0);
} else {
  console.log(`❌ ${failed} verificación(es) fallaron. Ejecuta: node scripts/preprocess_cartera.js\n`);
  process.exit(1);
}
