# Asistente con IA del visor — puesta en marcha

El asistente del visor funciona de entrada en **modo local**: busca por palabras clave en los datos del visor, sin IA y sin costo.
Con este Worker responde con IA usando **Workers AI de Cloudflare**, dentro del plan gratuito: sin tarjeta y sin claves externas.

## Puesta en marcha
1. Cuenta gratuita en https://dash.cloudflare.com
2. Crear un Worker (por ejemplo `apacheta-asistente`) con el contenido de `worker.js`.
3. Agregarle una vinculación (binding) de **Workers AI** con el nombre `AI`.
4. Publicarlo en `workers.dev` y copiar su dirección.
5. En `visor.html`, completar `window.APACHETA_ASISTENTE_URL` con esa dirección.

## Límites
- Workers AI incluye 10.000 Neurons por día gratis; en el plan gratuito, al pasarse, los pedidos fallan (no se cobra) y el visor responde en modo local.
- El Worker acepta pedidos solo desde `https://apacheta-cartografia.github.io` y limita a 30 preguntas por IP y por día.
- Modelo: `@cf/meta/llama-3.3-70b-instruct-fp8-fast`. Para estirar la cuota diaria, cambiar `MODELO` por `@cf/meta/llama-3.1-8b-instruct`.
- El modelo recibe solo los datos publicados en el visor y tiene prohibido inventar datos de montaña.
