/**
 * lib/dataTransformer.js — Transforma datos de RSales al formato del dashboard
 */

function transformRsalesToDashboard(receivables, customers = [], sellers = []) {
  const now = new Date();
  
  // Mapas de referencia
  const customerMap = {};
  customers.forEach(c => { customerMap[c.code || c.client_code] = c; });
  
  const sellerMap = {};
  sellers.forEach(s => { sellerMap[s.code || s.seller_code] = s; });

  // ========== KPIs ==========
  const totalDocs = receivables.length;
  const saldoTotal = receivables.reduce((s, r) => s + (r.balance || 0), 0);
  const saldoBaseTotal = receivables.reduce((s, r) => s + (r.base_balance || r.balance || 0), 0);
  const baseRetencionTotal = receivables.reduce((s, r) => s + (r.withholding_base || 0), 0);
  
  const vencidos = receivables.filter(r => r.due_date && new Date(r.due_date) < now);
  const carteraVencida = vencidos.reduce((s, r) => s + (r.balance || 0), 0);
  const carteraCorriente = saldoTotal - carteraVencida;
  
  // Días mora promedio ponderado
  let totalDiasMora = 0;
  let pesoMora = 0;
  vencidos.forEach(r => {
    const dias = Math.floor((now - new Date(r.due_date)) / (1000 * 60 * 60 * 24));
    const bal = r.balance || 0;
    totalDiasMora += dias * bal;
    pesoMora += bal;
  });
  const diasMoraPromedio = pesoMora > 0 ? totalDiasMora / pesoMora : 0;
  
  const uniqueClients = new Set(receivables.map(r => r.client_code).filter(Boolean));
  const uniqueSellers = new Set(receivables.map(r => r.seller_code).filter(Boolean));

  const kpis = {
    total_documentos: totalDocs,
    saldo_total: saldoTotal,
    saldo_promedio: totalDocs > 0 ? saldoTotal / totalDocs : 0,
    saldo_base_total: saldoBaseTotal,
    cartera_vencida: carteraVencida,
    cartera_por_vencer: carteraCorriente,
    total_clientes: uniqueClients.size,
    total_vendedores: uniqueSellers.size,
    dias_mora_promedio: diasMoraPromedio,
    base_retencion_total: baseRetencionTotal
  };

  // ========== Aging ==========
  const agingBuckets = {
    'Corriente': { documentos: 0, saldo: 0, saldo_base: 0 },
    '1-30 dias': { documentos: 0, saldo: 0, saldo_base: 0 },
    '31-60 dias': { documentos: 0, saldo: 0, saldo_base: 0 },
    '61-90 dias': { documentos: 0, saldo: 0, saldo_base: 0 },
    '+90 dias': { documentos: 0, saldo: 0, saldo_base: 0 }
  };

  receivables.forEach(r => {
    const bal = r.balance || 0;
    const base = r.base_balance || bal;
    let bucket = 'Corriente';
    
    if (r.due_date) {
      const dias = Math.floor((now - new Date(r.due_date)) / (1000 * 60 * 60 * 24));
      if (dias > 90) bucket = '+90 dias';
      else if (dias > 60) bucket = '61-90 dias';
      else if (dias > 30) bucket = '31-60 dias';
      else if (dias > 0) bucket = '1-30 dias';
    }
    
    agingBuckets[bucket].documentos++;
    agingBuckets[bucket].saldo += bal;
    agingBuckets[bucket].saldo_base += base;
  });

  const aging = Object.entries(agingBuckets).map(([rango, vals]) => ({
    rango,
    documentos: vals.documentos,
    saldo: vals.saldo,
    saldo_base: vals.saldo_base
  }));

  // ========== Top Clientes ==========
  const clientGroups = {};
  receivables.forEach(r => {
    const code = r.client_code || 'SIN_CODIGO';
    if (!clientGroups[code]) {
      const customer = customerMap[code] || {};
      clientGroups[code] = {
        codigo: code,
        nombre: customer.name || customer.business_name || code,
        nit: customer.nit || customer.identification || '',
        ciudad: customer.city || '',
        documentos: 0,
        saldo: 0,
        saldo_vencido: 0,
        saldo_base: 0
      };
    }
    const bal = r.balance || 0;
    const base = r.base_balance || bal;
    clientGroups[code].documentos++;
    clientGroups[code].saldo += bal;
    clientGroups[code].saldo_base += base;
    if (r.due_date && new Date(r.due_date) < now) {
      clientGroups[code].saldo_vencido += bal;
    }
  });

  const topClientes = Object.values(clientGroups)
    .sort((a, b) => b.saldo - a.saldo)
    .slice(0, 20);

  // ========== Cartera por Vendedor ==========
  const sellerGroups = {};
  receivables.forEach(r => {
    const code = r.seller_code || 'SIN_VENDEDOR';
    if (!sellerGroups[code]) {
      const seller = sellerMap[code] || {};
      sellerGroups[code] = {
        codigo: code,
        nombre: seller.name || seller.full_name || code,
        documentos: 0,
        saldo_total: 0,
        saldo_vencido: 0,
        saldo_corriente: 0,
        dias_mora_promedio: 0
      };
    }
    const bal = r.balance || 0;
    sellerGroups[code].documentos++;
    sellerGroups[code].saldo_total += bal;
    
    if (r.due_date && new Date(r.due_date) < now) {
      sellerGroups[code].saldo_vencido += bal;
    } else {
      sellerGroups[code].saldo_corriente += bal;
    }
  });

  // Calcular días mora promedio por vendedor
  Object.keys(sellerGroups).forEach(code => {
    const sellerRecs = receivables.filter(r => r.seller_code === code && r.due_date && new Date(r.due_date) < now);
    if (sellerRecs.length > 0) {
      let totalDias = 0;
      let totalBal = 0;
      sellerRecs.forEach(r => {
        const dias = Math.floor((now - new Date(r.due_date)) / (1000 * 60 * 60 * 24));
        const bal = r.balance || 0;
        totalDias += dias * bal;
        totalBal += bal;
      });
      sellerGroups[code].dias_mora_promedio = totalBal > 0 ? Math.round(totalDias / totalBal * 10) / 10 : 0;
    }
  });

  const carteraVendedor = Object.values(sellerGroups)
    .sort((a, b) => b.saldo_total - a.saldo_total);

  // ========== Tipo de Documento ==========
  const tipoDocGroups = {};
  receivables.forEach(r => {
    const tipo = r.document_type || 'SIN_TIPO';
    if (!tipoDocGroups[tipo]) {
      tipoDocGroups[tipo] = { tipo, documentos: 0, saldo: 0 };
    }
    tipoDocGroups[tipo].documentos++;
    tipoDocGroups[tipo].saldo += r.balance || 0;
  });

  const tipoDocumento = Object.values(tipoDocGroups)
    .sort((a, b) => b.saldo - a.saldo);

  // ========== Evolución Cartera (acumulado por mes de creación) ==========
  const evolMap = {};
  receivables.forEach(r => {
    const date = r.created_at ? new Date(r.created_at) : (r.document_date ? new Date(r.document_date) : now);
    const mes = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01T00:00:00.000Z`;
    if (!evolMap[mes]) {
      evolMap[mes] = { mes, saldo_acumulado: 0, saldo_vencido: 0, docs_acumulados: 0 };
    }
    evolMap[mes].saldo_acumulado += r.balance || 0;
    if (r.due_date && new Date(r.due_date) < now) {
      evolMap[mes].saldo_vencido += r.balance || 0;
    }
    evolMap[mes].docs_acumulados++;
  });

  const evolucionCartera = Object.values(evolMap)
    .sort((a, b) => new Date(a.mes) - new Date(b.mes));

  // Calcular acumulado real (running total)
  let runningSaldo = 0;
  let runningVencido = 0;
  let runningDocs = 0;
  evolucionCartera.forEach(e => {
    runningSaldo += e.saldo_acumulado;
    runningVencido += e.saldo_vencido;
    runningDocs += e.docs_acumulados;
    e.saldo_acumulado = runningSaldo;
    e.saldo_vencido = runningVencido;
    e.docs_acumulados = runningDocs;
  });

  // ========== Facturación Mensual (aproximada desde created_at) ==========
  const factMap = {};
  receivables.forEach(r => {
    const date = r.document_date ? new Date(r.document_date) : (r.created_at ? new Date(r.created_at) : now);
    const mes = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01T00:00:00.000Z`;
    if (!factMap[mes]) {
      factMap[mes] = { mes, documentos: 0, saldo: 0, facturado: 0 };
    }
    factMap[mes].documentos++;
    factMap[mes].saldo += r.balance || 0;
    factMap[mes].facturado += r.base_balance || r.balance || 0;
  });

  const facturacionMensual = Object.values(factMap)
    .sort((a, b) => new Date(a.mes) - new Date(b.mes));

  // ========== Concentración (Pareto) ==========
  const sortedClients = Object.values(clientGroups).sort((a, b) => b.saldo - a.saldo);
  const totalClientes = sortedClients.length;
  const concentracion = [];
  let cumulativeSaldo = 0;
  
  for (let i = 0; i < Math.min(totalClientes, 100); i++) {
    cumulativeSaldo += sortedClients[i].saldo;
    concentracion.push({
      num_clientes: String(i + 1),
      pct_clientes: parseFloat(((i + 1) / totalClientes * 100).toFixed(1)),
      pct_saldo: parseFloat((cumulativeSaldo / saldoTotal * 100).toFixed(1))
    });
  }

  // ========== Eficiencia Recaudo (placeholder - no tenemos recaudos reales) ==========
  // Usamos datos aproximados: asumimos que documentos corrientes = "recaudados"
  const currentYear = now.getFullYear();
  const eficienciaRecaudo = [];
  for (let year = currentYear - 4; year <= currentYear; year++) {
    const yearRecs = receivables.filter(r => {
      const d = r.document_date ? new Date(r.document_date) : (r.created_at ? new Date(r.created_at) : null);
      return d && d.getFullYear() === year;
    });
    const facturado = yearRecs.reduce((s, r) => s + (r.base_balance || r.balance || 0), 0);
    // Aproximación: cartera corriente del año = "recaudado"
    const recaudado = yearRecs.filter(r => r.due_date && new Date(r.due_date) >= now)
      .reduce((s, r) => s + (r.balance || 0), 0);
    const porcentaje = facturado > 0 ? parseFloat((recaudado / facturado * 100).toFixed(1)) : 0;
    
    eficienciaRecaudo.push({
      anio: year,
      facturado,
      recaudado,
      porcentaje
    });
  }

  // ========== Recaudos Mensual (placeholder) ==========
  // Aproximación: documentos que pasaron de vencido a corriente por mes
  const recaudosMensual = facturacionMensual.map(f => ({
    mes: f.mes,
    recibos: Math.floor(f.documentos * 0.3), // placeholder
    recaudado: f.facturado * 0.3 // placeholder
  }));

  // ========== Pedidos Mensual (placeholder) ==========
  const pedidosMensual = facturacionMensual.map(f => ({
    mes: f.mes,
    pedidos: f.documentos,
    valor_ventas: f.facturado
  }));

  return {
    generated_at: new Date().toISOString(),
    source: 'rsales',
    kpis,
    aging,
    facturacion_mensual: facturacionMensual,
    recaudos_mensual: recaudosMensual,
    pedidos_mensual: pedidosMensual,
    top_clientes: topClientes,
    cartera_vendedor: carteraVendedor,
    tipo_documento: tipoDocumento,
    evolucion_cartera: evolucionCartera,
    eficiencia_recaudo: eficienciaRecaudo,
    concentracion
  };
}

module.exports = { transformRsalesToDashboard };