'use strict';
/**
 * api/reports/conversation.js  — Vercel serverless function
 * Genera reportes de conversación del chatbot (docx, pptx, pdf)
 */

const { verifyToken } = require('../auth');
const { buildConversationReportData }  = require('../../lib/reports/reportDataBuilder');
const { generateConversationDocx }     = require('../../lib/reports/docxGenerator');
const { generateConversationPptx }     = require('../../lib/reports/pptxGenerator');
const { generateConversationPdf }      = require('../../lib/reports/pdfGenerator');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-session-id');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const decoded = verifyToken(req);
  if (!decoded) return res.status(401).json({ error: 'No autenticado' });

  const { format, messages, filters = {}, insights = '' } = req.body || {};
  const allowed = ['docx', 'pptx', 'pdf'];
  if (!allowed.includes(format)) {
    return res.status(400).json({ error: `Formato inválido. Permitidos: ${allowed.join(', ')}` });
  }
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Se requiere el historial de mensajes' });
  }

  try {
    const convData = buildConversationReportData({ messages, filters, insights });
    let buffer, contentType, filename;

    switch (format) {
      case 'docx':
        buffer      = await generateConversationDocx(convData);
        contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        filename    = `conversacion_${Date.now()}.docx`;
        break;
      case 'pptx':
        buffer      = await generateConversationPptx(convData);
        contentType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
        filename    = `conversacion_${Date.now()}.pptx`;
        break;
      case 'pdf':
        buffer      = await generateConversationPdf(convData);
        contentType = 'application/pdf';
        filename    = `conversacion_${Date.now()}.pdf`;
        break;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err) {
    console.error('[reports/conversation]', err.message);
    res.status(500).json({ error: 'Error generando reporte: ' + err.message });
  }
};
