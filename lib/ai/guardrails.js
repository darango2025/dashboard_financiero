/**
 * lib/ai/guardrails.js
 * Guardrails para evitar alucinaciones del modelo.
 * Valida respuestas antes de enviarlas al usuario.
 */
'use strict';

// Patrones que indican cifras inventadas o respuestas problemáticas
const HALLUCINATION_PATTERNS = [
  /\$[\d,.]+ (millones|billones|miles)/i,        // cifras en palabras que pueden diferir de los datos
  /aproximadamente \$[\d,.]+/i,                   // aproximaciones no basadas en datos
  /se estima (que|un)/i,                          // estimaciones
  /podría (ser|haber|existir)/i,                  // condicionales especulativos
  /supongamos que/i,
  /asumiendo que/i,
];

// Palabras que indican información fuera de contexto
const OUT_OF_SCOPE_INDICATORS = [
  'bolsa de valores',
  'mercado de acciones',
  'precio de la acción',
  'inflación colombiana',  // si el modelo inventa datos macroeconómicos
  'banco de la república', // si inventa datos del banco central
];

/**
 * Valida una respuesta del modelo.
 * @param {string} response - Respuesta generada
 * @param {Object} context - Contexto RAG usado
 * @returns {{ valid: boolean, warnings: string[], sanitized: string }}
 */
function validateResponse(response, context = {}) {
  const warnings = [];
  let sanitized = response;

  if (!response || typeof response !== 'string') {
    return {
      valid: false,
      warnings: ['Respuesta vacía o inválida del modelo'],
      sanitized: 'Lo siento, no pude generar una respuesta. Por favor intenta de nuevo.',
    };
  }

  // Verificar longitud razonable
  if (response.length < 20) {
    warnings.push('Respuesta muy corta');
  }

  if (response.length > 8000) {
    warnings.push('Respuesta muy larga, posible problema de token overflow');
    sanitized = response.substring(0, 7500) + '\n\n[Respuesta truncada por longitud]';
  }

  // Verificar indicadores fuera de alcance
  const outOfScope = OUT_OF_SCOPE_INDICATORS.filter(ind =>
    response.toLowerCase().includes(ind.toLowerCase())
  );
  if (outOfScope.length > 0) {
    warnings.push(`Respuesta puede contener información fuera del alcance del dataset: ${outOfScope.join(', ')}`);
  }

  // Si el RAG no estaba disponible pero el modelo generó cifras, advertir
  if (!context.available) {
    const hasCifras = /\$[\d,.]+/.test(response);
    if (hasCifras) {
      warnings.push('El modelo generó cifras sin datos RAG disponibles. Verificar confiabilidad.');
      sanitized += '\n\n⚠️ *Nota: Los datos de cartera no estaban disponibles en este momento. Las cifras mencionadas son aproximadas.*';
    }
  }

  return {
    valid: warnings.length === 0 || !warnings.some(w => w.includes('inválida')),
    warnings,
    sanitized,
  };
}

/**
 * Sanitiza el input del usuario para evitar prompt injection.
 * @param {string} userInput
 * @returns {string}
 */
function sanitizeUserInput(userInput) {
  if (!userInput || typeof userInput !== 'string') return '';

  // Truncar inputs muy largos
  let sanitized = userInput.substring(0, 2000);

  // Eliminar secuencias que intentan inyectar instrucciones al sistema
  const injectionPatterns = [
    /ignore (previous|all|your) instructions?/gi,
    /forget (what|everything|all)/gi,
    /you are now/gi,
    /act as (if|a|an)/gi,
    /\[SYSTEM\]/gi,
    /\[INST\]/gi,
    /<\|im_start\|>/gi,
    /<\|im_end\|>/gi,
  ];

  for (const pattern of injectionPatterns) {
    if (pattern.test(sanitized)) {
      console.warn('[Guardrails] Posible prompt injection detectado:', sanitized.substring(0, 100));
      sanitized = sanitized.replace(pattern, '[texto eliminado]');
    }
  }

  return sanitized.trim();
}

module.exports = { validateResponse, sanitizeUserInput };
