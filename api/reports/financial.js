'use strict';
/**
 * api/reports/financial.js  — Vercel serverless function
 * Genera informes financieros (docx, xlsx, pptx, pdf)
 */

const { verifyToken } = require('../auth');
const { buildFinancialReportData } = require('../../lib/reports/reportDataBuilder');
const { generateFinancialDocx }    = require('../../lib/reports/docxGenerator');
const { generateFinancialXlsx }    = require('../../lib/reports/xlsxGenerator');
const { generateFinancialPptx }    = require('../../lib/reports/pptxGenerator');
const { generateFinancialPdf }     = require('../../lib/reports/pdfGenerator');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-session-id');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const decoded = verifyToken(req);
  if (!decoded) return res.status(401).json({ error: 'No autenticado' });

  const { format, filters = {} } = req.body || {};
  const allowed = ['docx', 'xlsx', 'pptx', 'pdf'];
  if (!allowed.includes(format)) {
    return res.status(400).json({ error: `Formato inválido. Permitidos: ${allowed.join(', ')}` });
  }

  try {
    const reportData = buildFinancialReportData(filters);
    let buffer, contentType, filename;

    switch (format) {
      case 'docx':
        buffer      = await generateFinancialDocx(reportData);
        contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        filename    = `informe_cartera_${Date.now()}.docx`;
        break;
      case 'xlsx':
        buffer      = await generateFinancialXlsx(reportData);
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        filename    = `informe_cartera_${Date.now()}.xlsx`;
        break;
      case 'pptx':
        buffer      = await generateFinancialPptx(reportData);
        contentType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
        filename    = `informe_cartera_${Date.now()}.pptx`;
        break;
      case 'pdf':
        buffer      = await generateFinancialPdf(reportData);
        contentType = 'application/pdf';
        filename    = `informe_cartera_${Date.now()}.pdf`;
        break;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err) {
    console.error('[reports/financial]', err.message);
    res.status(500).json({ error: 'Error generando reporte: ' + err.message });
  }
};
