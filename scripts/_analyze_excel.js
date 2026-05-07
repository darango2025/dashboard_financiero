const XLSX = require('xlsx');
const wb = XLSX.readFile('data/cartera_export.xlsx');
const ws = wb.Sheets['Cartera'];
const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
const headers = data[0];
const rows = data.slice(1);

function excelDateToDate(n) {
  if (!n || typeof n !== 'number') return null;
  return new Date(Math.round((n - 25569) * 86400 * 1000));
}

const idx = {};
headers.forEach((h, i) => { idx[h] = i; });

// Date range
const fechas = rows.map(r => excelDateToDate(r[idx['Fecha Documento']])).filter(Boolean).sort((a,b)=>a-b);
const vencFechas = rows.map(r => excelDateToDate(r[idx['Fecha Vencimiento']])).filter(Boolean).sort((a,b)=>a-b);
console.log('Fecha Documento range:', fechas[0].toISOString().substring(0,10), 'to', fechas[fechas.length-1].toISOString().substring(0,10));
console.log('Fecha Vencimiento range:', vencFechas[0].toISOString().substring(0,10), 'to', vencFechas[vencFechas.length-1].toISOString().substring(0,10));

// Days mora
const moras = rows.map(r => r[idx['Días Mora']]);
console.log('Días Mora min:', Math.min(...moras), 'max:', Math.max(...moras));

// Top 5 clientes by saldo
const clienteSaldo = {};
rows.forEach(r => {
  const c = r[idx['Nombre Cliente']] || 'Sin nombre';
  clienteSaldo[c] = (clienteSaldo[c] || 0) + (r[idx['Saldo']] || 0);
});
const topClientes = Object.entries(clienteSaldo).sort((a,b) => b[1]-a[1]).slice(0,10);
console.log('\nTop 10 Clientes:');
topClientes.forEach(([name, saldo]) => console.log('  ', name, ':', saldo.toLocaleString('es-CO', {maximumFractionDigits:0})));

// Tipos documento
const tipoCount = {};
const tipoSaldo = {};
rows.forEach(r => {
  const t = r[idx['Tipo Documento']];
  tipoCount[t] = (tipoCount[t] || 0) + 1;
  tipoSaldo[t] = (tipoSaldo[t] || 0) + (r[idx['Saldo']] || 0);
});
console.log('\nTipos documento (count):', JSON.stringify(tipoCount));

// Aging buckets
const aging = {Corriente:0,'1-30d':0,'31-60d':0,'61-90d':0,'+90d':0};
const agingSaldo = {Corriente:0,'1-30d':0,'31-60d':0,'61-90d':0,'+90d':0};
rows.forEach(r => {
  const m = r[idx['Días Mora']];
  const s = r[idx['Saldo']] || 0;
  let bucket;
  if (m <= 0) bucket = 'Corriente';
  else if (m <= 30) bucket = '1-30d';
  else if (m <= 60) bucket = '31-60d';
  else if (m <= 90) bucket = '61-90d';
  else bucket = '+90d';
  aging[bucket]++;
  agingSaldo[bucket] += s;
});
console.log('\nAging (docs):', aging);
console.log('Aging (saldo COP):');
Object.entries(agingSaldo).forEach(([k,v]) => console.log('  ', k, ':', v.toLocaleString('es-CO', {maximumFractionDigits:0})));

// Year distribution
const yearSaldo = {};
rows.forEach(r => {
  const d = excelDateToDate(r[idx['Fecha Documento']]);
  if (!d) return;
  const y = d.getFullYear();
  yearSaldo[y] = (yearSaldo[y] || 0) + (r[idx['Saldo']] || 0);
});
console.log('\nSaldo by year:');
Object.entries(yearSaldo).sort().forEach(([y,v]) => console.log('  ', y, ':', v.toLocaleString('es-CO', {maximumFractionDigits:0})));

// Top 5 vendedores
const vendSaldo = {};
rows.forEach(r => {
  const v = r[idx['Vendedor']] || 'Sin asignar';
  vendSaldo[v] = (vendSaldo[v] || 0) + (r[idx['Saldo']] || 0);
});
const topVend = Object.entries(vendSaldo).sort((a,b) => b[1]-a[1]).slice(0,10);
console.log('\nTop 10 Vendedores:');
topVend.forEach(([name, saldo]) => console.log('  ', name, ':', saldo.toLocaleString('es-CO', {maximumFractionDigits:0})));

// Monthly trend (last 24 months)
const monthSaldo = {};
const monthDocs = {};
rows.forEach(r => {
  const d = excelDateToDate(r[idx['Fecha Documento']]);
  if (!d) return;
  const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
  monthSaldo[key] = (monthSaldo[key] || 0) + (r[idx['Saldo']] || 0);
  monthDocs[key] = (monthDocs[key] || 0) + 1;
});
const lastMonths = Object.entries(monthSaldo).sort().slice(-18);
console.log('\nLast 18 months saldo:');
lastMonths.forEach(([k,v]) => console.log('  ', k, ':', v.toLocaleString('es-CO', {maximumFractionDigits:0}), '(docs:', monthDocs[k] + ')'));

// Estado and Proceso
const estadoSaldo = {};
rows.forEach(r => {
  const e = r[idx['Estado']];
  estadoSaldo[e] = (estadoSaldo[e] || 0) + (r[idx['Saldo']] || 0);
});
console.log('\nEstado (saldo):', JSON.stringify(Object.fromEntries(Object.entries(estadoSaldo).map(([k,v])=>[k, v.toLocaleString('es-CO',{maximumFractionDigits:0})]))));

const procSaldo = {};
rows.forEach(r => {
  const p = r[idx['Proceso']];
  procSaldo[p] = (procSaldo[p] || 0) + (r[idx['Saldo']] || 0);
});
console.log('Proceso (saldo):', JSON.stringify(Object.fromEntries(Object.entries(procSaldo).map(([k,v])=>[k, v.toLocaleString('es-CO',{maximumFractionDigits:0})]))));

// Unique clients/vendors/cobradores
const uniqueClientes = new Set(rows.map(r => r[idx['Cód. Cliente']])).size;
const uniqueVendedores = new Set(rows.map(r => r[idx['Cód. Vendedor']])).size;
const uniqueCobradores = new Set(rows.map(r => r[idx['Cód. Cobrador']])).size;
console.log('\nUnique Clientes:', uniqueClientes);
console.log('Unique Vendedores:', uniqueVendedores);
console.log('Unique Cobradores:', uniqueCobradores);

// Resumen sheet
const ws2 = wb.Sheets['Resumen'];
if (ws2) {
  const res = XLSX.utils.sheet_to_json(ws2, { header: 1, defval: null });
  console.log('\nRESUMEN SHEET:');
  res.slice(0,15).forEach(r => console.log('  ', JSON.stringify(r)));
}
