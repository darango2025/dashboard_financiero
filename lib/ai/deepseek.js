/**
 * lib/ai/deepseek.js
 * Capa de abstracción para DeepSeek API.
 * Compatible con la API de OpenAI (mismo SDK).
 * 
 * No expone claves. Lee todo desde process.env.
 * Soporta cambio de proveedor en el futuro editando solo este módulo.
 */
'use strict';

const { OpenAI } = require('openai');

// ─── Validación de configuración ───────────────
const API_KEY = process.env.API_KEY_DS || process.env.DEEPSEEK_API_KEY;
const MODEL   = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
const TIMEOUT_MS = parseInt(process.env.AI_TIMEOUT_MS || '30000', 10);
const MAX_RETRIES = parseInt(process.env.AI_MAX_RETRIES || '2', 10);

if (!API_KEY) {
  console.warn('[DeepSeek] ⚠️  API_KEY_DS no definida. El chat AI estará deshabilitado.');
}

const client = API_KEY ? new OpenAI({
  apiKey: API_KEY,
  baseURL: BASE_URL,
  timeout: TIMEOUT_MS,
  maxRetries: MAX_RETRIES,
}) : null;

/**
 * Llamada principal al modelo.
 * @param {Object} opts
 * @param {Array}  opts.messages    - Array de mensajes [{role, content}]
 * @param {number} opts.maxTokens   - Máximo de tokens (default 2000)
 * @param {number} opts.temperature - Temperatura (default 0.3)
 * @returns {Promise<{content: string, model: string, usage: object}>}
 */
async function chat({ messages, maxTokens = 2000, temperature = 0.3 }) {
  if (!client) {
    throw new Error('DeepSeek no configurado. Define API_KEY_DS en .env');
  }

  const completion = await client.chat.completions.create({
    model: MODEL,
    messages,
    max_tokens: maxTokens,
    temperature,
    top_p: 0.9,
  });

  const choice = completion.choices?.[0];
  if (!choice || !choice.message?.content) {
    throw new Error('Respuesta vacía o inválida del modelo');
  }

  return {
    content: choice.message.content,
    model: completion.model || MODEL,
    usage: completion.usage || {},
    finish_reason: choice.finish_reason,
  };
}

/**
 * Genera texto de análisis financiero con temperatura baja.
 * Para insights, interpretaciones y resúmenes ejecutivos.
 */
async function analyzeFinancial({ systemPrompt, userMessage, context = '', maxTokens = 1500 }) {
  const messages = [
    { role: 'system', content: systemPrompt },
  ];
  if (context) {
    messages.push({ role: 'user', content: `Contexto de datos:\n${context}` });
    messages.push({ role: 'assistant', content: 'Entendido. Tengo los datos de referencia.' });
  }
  messages.push({ role: 'user', content: userMessage });

  return chat({ messages, maxTokens, temperature: 0.2 });
}

/**
 * Retorna el modelo configurado (para logging).
 */
function getModel() {
  return MODEL;
}

/**
 * Verifica si el cliente está activo.
 */
function isAvailable() {
  return !!client;
}

module.exports = { chat, analyzeFinancial, getModel, isAvailable };
