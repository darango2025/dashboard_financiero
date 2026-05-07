const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const publicDataDir = path.join(__dirname, '..', 'public', 'data');
const apiDataDir = path.join(__dirname, '..', 'api');

function loadData() {
  const rawData = fs.readFileSync(path.join(dataDir, 'dashboard_data.json'), 'utf-8');
  return JSON.parse(rawData);
}

function fmt(n) {
  if (n === null || n === undefined) return 'N/A';
  return '$' + Number(n).toLocaleString('es-CO', { maximumFractionDigits: 0 });
}

function fmtPct(n) {
  return Number(n).toFixed(1) + '%';
}

function generateRAGSummaries() {
  const data = loadData();
  const summaries = {
    generated_at: new Date().toISOString(),
    version: '1.0',
    general_overview: generateGeneralOverview(data),
    periodic_summaries: generatePeriodicSummaries(data),
    client_analysis: generateClientAnalysis(data),
    vendor_analysis: generateVendorAnalysis(data),
    aging_analysis: generateAgingAnalysis(data),
    efficiency_analysis: generateEfficiencyAnalysis(data),
    key_metrics: generateKeyMetrics(data),
    trends: generateTrends(data),
    risk_indicators: generateRiskIndicators(data)
  };

  const publicPath = path.join(publicDataDir, 'rag_summaries.json');
  const apiPath = path.join(apiDataDir, 'rag_summaries.json');
  
  fs.writeFileSync(publicPath, JSON.stringify(summaries, null, 2));
  fs.writeFileSync(apiPath, JSON.stringify(summaries, null, 2));
  
  console.log(`RAG summaries generated: ${publicPath}`);
  console.log(`RAG summaries copied to API: ${apiPath}`);
  console.log(`File size: ${(fs.statSync(publicPath).size / 1024).toFixed(1)} KB`);
  
  return summaries;
}

function generateGeneralOverview(data) {
  const k = data.kpis;
  const pctVencida = (k.cartera_vencida / k.saldo_total * 100).toFixed(1);
  
  return {
    title: "Resumen General de Cartera",
    description: "Vista general del estado actual de la cartera de ADATEC",
    key_facts: [
      `Saldo total de cartera: ${fmt(k.saldo_total)} en ${k.total_documentos} documentos`,
      `Cartera vencida: ${fmt(k.cartera_vencida)} (${pctVencida}% del total)`,
      `Cartera corriente: ${fmt(k.cartera_por_vencer)}`,
      `Días mora promedio: ${Math.round(k.dias_mora_promedio)} días`,
      `Total clientes con saldo pendiente: ${k.total_clientes}`,
      `Total vendedores activos: ${k.total_vendedores}`,
      `Saldo base original: ${fmt(k.saldo_base_total)}`,
      `Diferencia base vs actual (pagos aplicados): ${fmt(k.saldo_base_total - k.saldo_total)}`
    ],
    critical_alerts: [
      pctVencida > 80 ? `ALERTA CRÍTICA: ${pctVencida}% de la cartera está vencida` : null,
      k.dias_mora_promedio > 365 ? `ALERTA: Mora promedio superior a 1 año (${Math.round(k.dias_mora_promedio)} días)` : null
    ].filter(Boolean)
  };
}

function generatePeriodicSummaries(data) {
  const fact = data.facturacion_mensual;
  const recaudo = data.recaudos_mensual;
  
  const years = {};
  
  fact.forEach(f => {
    const year = new Date(f.mes).getFullYear();
    if (!years[year]) {
      years[year] = {
        year,
        facturacion: 0,
        documentos: 0,
        meses_con_datos: new Set()
      };
    }
    years[year].facturacion += f.facturado || 0;
    years[year].documentos += f.documentos || 0;
    years[year].meses_con_datos.add(new Date(f.mes).getMonth());
  });
  
  recaudo.forEach(r => {
    const year = new Date(r.mes).getFullYear();
    if (!years[year]) {
      years[year] = { year, facturacion: 0, documentos: 0, recaudo: 0, meses_con_datos: new Set() };
    }
    years[year].recaudo = (years[year].recaudo || 0) + r.recaudado;
  });
  
  const result = Object.values(years)
    .filter(y => y.year >= 2020)
    .sort((a, b) => b.year - a.year)
    .map(y => ({
      year: y.year,
      facturacion_total: y.facturacion,
      recaudo_total: y.recaudo || 0,
      eficiencia: y.facturacion > 0 ? ((y.recaudo || 0) / y.facturacion * 100).toFixed(1) : 0,
      documentos: y.documentos,
      resumen: `Año ${y.year}: Facturación ${fmt(y.facturacion)}, Recaudo ${fmt(y.recaudo || 0)}, Eficiencia ${y.facturacion > 0 ? ((y.recaudo || 0) / y.facturacion * 100).toFixed(1) + '%' : 'N/A'}`
    }));
  
  return result;
}

function generateClientAnalysis(data) {
  const top10 = data.top_clientes.slice(0, 10);
  const totalSaldo = data.kpis.saldo_total;
  
  return {
    title: "Análisis de Clientes",
    top_10_deudores: top10.map((c, i) => ({
      posicion: i + 1,
      nombre: c.nombre,
      nit: c.nit,
      ciudad: c.ciudad,
      saldo: c.saldo,
      saldo_vencido: c.saldo_vencido,
      pct_del_total: (c.saldo / totalSaldo * 100).toFixed(1),
      documentos: c.documentos
    })),
    concentracion: {
      top_1_pct: (top10[0].saldo / totalSaldo * 100).toFixed(1),
      top_5_pct: (top10.slice(0, 5).reduce((s, c) => s + c.saldo, 0) / totalSaldo * 100).toFixed(1),
      top_10_pct: (top10.reduce((s, c) => s + c.saldo, 0) / totalSaldo * 100).toFixed(1)
    },
    resumen: `El cliente principal (${top10[0].nombre}) representa ${(top10[0].saldo / totalSaldo * 100).toFixed(1)}% de toda la cartera con ${fmt(top10[0].saldo)}`
  };
}

function generateVendorAnalysis(data) {
  const vendedores = data.cartera_vendedor.filter(v => v.codigo !== '101').slice(0, 10);
  const totalSaldo = data.kpis.saldo_total;
  
  return {
    title: "Análisis por Vendedor",
    top_10_vendedores: vendedores.map((v, i) => ({
      posicion: i + 1,
      codigo: v.codigo,
      nombre: v.nombre,
      saldo_total: v.saldo_total,
      saldo_vencido: v.saldo_vencido,
      saldo_corriente: v.saldo_corriente,
      pct_vencido: (v.saldo_vencido / v.saldo_total * 100).toFixed(1),
      dias_mora_promedio: v.dias_mora_promedio,
      documentos: v.documentos
    })),
    resumen: `Top 3 vendedores con mayor cartera: ${vendedores.slice(0, 3).map(v => v.nombre).join(', ')}`
  };
}

function generateAgingAnalysis(data) {
  const aging = data.aging;
  const total = data.kpis.saldo_total;
  
  return {
    title: "Análisis de Antigüedad (Aging)",
    rangos: aging.map(a => ({
      rango: a.rango,
      documentos: a.documentos,
      saldo: a.saldo,
      pct_del_total: (a.saldo / total * 100).toFixed(1),
      saldo_base: a.saldo_base
    })),
    resumen: `${(aging.find(a => a.rango === '+90 dias')?.saldo / total * 100).toFixed(1)}% de la cartera tiene más de 90 días de vencida`
  };
}

function generateEfficiencyAnalysis(data) {
  const eficiencia = data.eficiencia_recaudo.filter(e => e.anio >= 2020);
  
  return {
    title: "Eficiencia de Recaudo",
    por_anio: eficiencia.map(e => ({
      anio: e.anio,
      facturado: e.facturado,
      recaudado: e.recaudado,
      porcentaje: e.porcentaje
    })),
    tendencia: eficiencia.length >= 2 ? 
      eficiencia[eficiencia.length - 1].porcentaje > eficiencia[eficiencia.length - 2].porcentaje ? 'Mejorando' : 'Empeorando' : 'Sin datos suficientes',
    resumen: `Eficiencia más reciente: ${eficiencia[eficiencia.length - 1]?.porcentaje || 0}%`
  };
}

function generateKeyMetrics(data) {
  const k = data.kpis;
  
  return {
    title: "Métricas Clave",
    metrics: {
      saldo_total: { value: k.saldo_total, formatted: fmt(k.saldo_total), description: 'Saldo total de cartera' },
      cartera_vencida: { value: k.cartera_vencida, formatted: fmt(k.cartera_vencida), description: 'Cartera vencida' },
      cartera_corriente: { value: k.cartera_por_vencer, formatted: fmt(k.cartera_por_vencer), description: 'Cartera corriente' },
      pct_vencida: { value: (k.cartera_vencida / k.saldo_total * 100), formatted: fmtPct(k.cartera_vencida / k.saldo_total * 100), description: 'Porcentaje vencido' },
      dias_mora_promedio: { value: k.dias_mora_promedio, formatted: Math.round(k.dias_mora_promedio) + ' días', description: 'Días mora promedio' },
      total_documentos: { value: k.total_documentos, formatted: k.total_documentos.toLocaleString(), description: 'Total documentos' },
      total_clientes: { value: k.total_clientes, formatted: k.total_clientes.toLocaleString(), description: 'Total clientes' },
      saldo_promedio: { value: k.saldo_promedio, formatted: fmt(k.saldo_promedio), description: 'Saldo promedio por documento' }
    }
  };
}

function generateTrends(data) {
  const fact = data.facturacion_mensual.slice(-12);
  const recaudo = data.recaudos_mensual.slice(-12);
  
  const avgFact = fact.reduce((s, f) => s + (f.facturado || 0), 0) / fact.length;
  const avgRecaudo = recaudo.reduce((s, r) => s + r.recaudado, 0) / recaudo.length;
  
  return {
    title: "Tendencias Recientes (Últimos 12 meses)",
    facturacion_promedio_mensual: { value: avgFact, formatted: fmt(avgFact) },
    recaudo_promedio_mensual: { value: avgRecaudo, formatted: fmt(avgRecaudo) },
    brecha_promedio: { value: avgFact - avgRecaudo, formatted: fmt(avgFact - avgRecaudo) },
    resumen: `Brecha promedio mensual: ${fmt(avgFact - avgRecaudo)} (facturación supera recaudo)`
  };
}

function generateRiskIndicators(data) {
  const k = data.kpis;
  const top1 = data.top_clientes[0];
  const mas90 = data.aging.find(a => a.rango === '+90 dias');
  
  const riesgos = [];
  
  if (k.cartera_vencida / k.saldo_total > 0.8) {
    riesgos.push({
      nivel: 'CRÍTICO',
      indicador: 'Cartera altamente vencida',
      valor: fmtPct(k.cartera_vencida / k.saldo_total * 100),
      descripcion: 'Más del 80% de la cartera está vencida'
    });
  }
  
  if (top1.saldo / k.saldo_total > 0.3) {
    riesgos.push({
      nivel: 'ALTO',
      indicador: 'Concentración extrema en cliente',
      valor: fmtPct(top1.saldo / k.saldo_total * 100),
      descripcion: `Cliente ${top1.nombre} concentra más del 30% de la cartera`
    });
  }
  
  if (k.dias_mora_promedio > 365) {
    riesgos.push({
      nivel: 'ALTO',
      indicador: 'Mora prolongada',
      valor: Math.round(k.dias_mora_promedio) + ' días',
      descripcion: 'Mora promedio superior a 1 año'
    });
  }
  
  if (mas90 && mas90.saldo / k.saldo_total > 0.5) {
    riesgos.push({
      nivel: 'CRÍTICO',
      indicador: 'Cartera +90 días',
      valor: fmtPct(mas90.saldo / k.saldo_total * 100),
      descripcion: 'Más del 50% de la cartera tiene más de 90 días vencida'
    });
  }
  
  return {
    title: "Indicadores de Riesgo",
    riesgos,
    resumen: `Se identificaron ${riesgos.length} indicadores de riesgo`
  };
}

generateRAGSummaries();
