# Chatbot Financiero ADATEC - Dashboard de Cartera

## Descripción

Sistema de chatbot con RAG (Retrieval-Augmented Generation) para análisis financiero de la cartera de ADATEC. Integrado con el dashboard existente y desplegado en Vercel.

## Características

- **Autenticación**: Sistema de login para proteger el acceso al chatbot
- **RAG Strategy**: Resúmenes pre-computados por períodos para respuestas precisas
- **DeepSeek AI**: Integración con modelo deepseek-v4-pro
- **Análisis Financiero**: Acceso completo a datos de cartera, clientes, recaudos y tendencias

## Estructura del Proyecto

```
dashboard_financiero/
├── api/                      # Funciones serverless para Vercel
│   ├── chat.js              # Endpoint del chatbot con RAG
│   ├── login.js             # Autenticación
│   ├── logout.js            # Cierre de sesión
│   ├── verify.js            # Verificación de sesión
│   ├── health.js            # Health check
│   └── sessions.js          # Gestión de sesiones
├── public/
│   ├── index.html           # Dashboard principal
│   ├── chatbot.html         # Interfaz del chatbot
│   └── data/
│       ├── dashboard_data.json      # Datos crudos
│       ── rag_summaries.json       # Resúmenes RAG
├── scripts/
│   ├── extract_dashboard_data.js    # Extracción de datos SQL
│   └── generate_rag_summaries.js    # Generación de resúmenes RAG
├── server.js                # Servidor local para desarrollo
── .env                     # Variables de entorno (local)
├── vercel.json              # Configuración de Vercel
└── package.json
```

## RAG Strategy (Retrieval-Augmented Generation)

### Problema Resuelto

Para evitar alucinaciones y errores de la IA, se implementó una estrategia de resúmenes pre-computados:

1. **Pre-procesamiento**: Los datos crudos se transforman en resúmenes estructurados
2. **Contexto Preciso**: La IA recibe datos formateados y validados
3. **Múltiples Dimensiones**: Resúmenes por períodos, clientes, vendedores, riesgos, etc.

### Resúmenes Generados

- **general_overview**: Estado actual de la cartera
- **periodic_summaries**: Análisis por año (facturación, recaudo, eficiencia)
- **client_analysis**: Top deudores y concentración
- **vendor_analysis**: Cartera por vendedor
- **aging_analysis**: Antigüedad de la cartera
- **efficiency_analysis**: Eficiencia de recaudo histórica
- **key_metrics**: Métricas clave formateadas
- **trends**: Tendencias recientes (últimos 12 meses)
- **risk_indicators**: Indicadores de riesgo identificados

### Generación de Resúmenes

```bash
npm run generate-rag
```

Este script lee `dashboard_data.json` y genera `rag_summaries.json` con todos los resúmenes estructurados.

## Configuración

### Variables de Entorno

Crear archivo `.env` con:

```env
API_KEY_DS=sk-4410d2d7292046b282b4048843871223
DEEPSEEK_MODEL=deepseek-v4-pro
SESSION_SECRET=naprolab_financial_dashboard_secret_2026
```

**Nota**: En Vercel, configurar estas variables en el dashboard de proyecto.

### Credenciales de Acceso

- **Usuario**: naprolab
- **Contraseña**: naprolab

## Instalación y Desarrollo Local

```bash
# Instalar dependencias
npm install

# Extraer datos y generar resúmenes RAG
npm run extract
npm run generate-rag

# Iniciar servidor local
npm run serve

# O todo en uno
npm run dev
```

El servidor local corre en `http://localhost:3000`

### Servidor API Local (opcional)

Para desarrollo con el servidor Express completo:

```bash
node server.js
```

Esto inicia la API en `http://localhost:3001`

## Despliegue en Vercel

### Configuración

1. Las variables de entorno ya están configuradas en Vercel
2. El archivo `vercel.json` configura las funciones serverless
3. Los archivos en `api/` se despliegan automáticamente como funciones

### Comandos

```bash
# Instalar Vercel CLI si no está instalado
npm i -g vercel

# Desplegar
vercel

# Desplegar a producción
vercel --prod
```

### URLs

- **Dashboard**: https://tu-proyecto.vercel.app
- **Chatbot**: https://tu-proyecto.vercel.app/chatbot
- **API Health**: https://tu-proyecto.vercel.app/api/health

## Uso del Chatbot

### Acceso

1. Navegar a `/chatbot.html` o hacer clic en el botón "🤖 Chatbot" del dashboard
2. Iniciar sesión con las credenciales
3. La sesión se mantiene en localStorage

### Preguntas Sugeridas

El chatbot incluye botones de preguntas rápidas:

- **Estado cartera**: Resumen general de la cartera
- **Top deudores**: Principales clientes deudores
- **Eficiencia recaudo**: Análisis de eficiencia de recaudo
- **Riesgos**: Indicadores de riesgo identificados
- **Tendencias**: Análisis de tendencias facturación vs recaudo

### Ejemplos de Preguntas

```
¿Cuál es el saldo total de la cartera?
¿Quiénes son los 5 principales deudores?
¿Cuál es la eficiencia de recaudo del último año?
¿Qué riesgos identificas en la cartera?
Analiza la tendencia de facturación vs recaudo
¿Cuál es el porcentaje de cartera vencida?
¿Qué vendedor tiene mayor cartera vencida?
```

## Actualización de Datos

Para mantener el chatbot actualizado:

```bash
# Extraer datos frescos de SQL Server
npm run extract

# Regenerar resúmenes RAG
npm run generate-rag

# Los archivos se actualizan en public/data/
```

En Vercel, esto se puede automatizar con:
- GitHub Actions para extraer datos periódicamente
- Webhooks para trigger de actualización
- Cron jobs de Vercel (si está disponible)

## API Endpoints

### POST /api/login
Autenticación de usuario

```json
{
  "username": "naprolab",
  "password": "naprolab"
}
```

Response:
```json
{
  "success": true,
  "sessionId": "abc123...",
  "message": "Login exitoso"
}
```

### POST /api/chat
Enviar mensaje al chatbot

```json
{
  "sessionId": "abc123...",
  "message": "¿Cuál es el estado de la cartera?",
  "conversationHistory": [...]
}
```

### GET /api/verify
Verificar sesión activa

Headers: `X-Session-Id: abc123...`

### POST /api/logout
Cerrar sesión

```json
{
  "sessionId": "abc123..."
}
```

### GET /api/health
Health check del servicio

## Seguridad

- **Autenticación requerida** para acceder al chatbot
- **Sesiones con timeout** (gestión en servidor)
- **API key protegida** en variables de entorno
- **CORS configurado** para permitir acceso desde el frontend
- **Rate limiting** recomendado para producción

## Optimizaciones

### Para Respuestas Precisas

1. **Temperature baja (0.3)**: Reduce creatividad, aumenta precisión
2. **Contexto estructurado**: Datos pre-procesados en formato claro
3. **Instrucciones explícitas**: La IA debe usar solo los datos proporcionados
4. **Historial limitado**: Últimas 10 mensagens para mantener contexto relevante

### Para Performance

1. **Resúmenes pre-computados**: Evita procesamiento en tiempo real
2. **Funciones serverless**: Escalado automático en Vercel
3. **Cache de sesiones**: Mapa en memoria para validación rápida
4. **Datos estáticos**: JSON servido directamente desde CDN

## Solución de Problemas

### Error: "Sesión no válida"
- La sesión expiró o es inválida
- Solución: Volver a iniciar sesión

### Error: "Error al procesar la solicitud"
- Problema con la API de DeepSeek
- Verificar que `API_KEY_DS` esté configurada correctamente
- Revisar logs en Vercel

### Datos desactualizados
- Ejecutar `npm run extract` y `npm run generate-rag`
- Verificar conexión a SQL Server

### Chatbot no carga
- Verificar que los archivos estén en `public/`
- Revisar configuración de `vercel.json`

## Mantenimiento

### Regenerar Resúmenes RAG

Cada vez que se actualicen los datos:

```bash
npm run generate-rag
```

### Rotación de API Key

1. Actualizar variable `API_KEY_DS` en Vercel
2. Actualizar `.env` local
3. Redesplegar si es necesario

### Cambiar Credenciales

Editar en:
- `api/login.js` (VALID_USER, VALID_PASSWORD)
- `server.js` (VALID_USER, VALID_PASSWORD)

## Licencia

Propietario - ADATEC

## Contacto

Para soporte o consultas sobre el sistema.
