# Asistente con IA del visor

El asistente del visor responde preguntas sobre los mapas usando **Cloudflare Workers AI** (plan gratuito, sin tarjeta).
Si el Worker no responde, el visor pasa solo al **modo local** (búsqueda por palabras clave, sin IA).

## Estado actual
- Worker: `apacheta-asistente`
- Dirección: `https://apacheta-asistente.apacheta-cartografia.workers.dev`
- Vinculación (binding) de Workers AI llamada `AI`
- Modelo: `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (se cambia en `MODELO`)

## Cómo actualizar el código
1. Entrar a https://dash.cloudflare.com → Workers y Pages → `apacheta-asistente` → Editar código.
2. Reemplazar el contenido por el de `worker.js` y tocar **Implementar**.

## Qué controla el Worker
- Solo acepta pedidos desde `https://apacheta-cartografia.github.io`.
- Límite de 30 preguntas por IP y por día (`MAX_PREGUNTAS_POR_IP_POR_DIA`).
- Le pasa al modelo únicamente los datos publicados en el visor y le prohíbe inventar datos de montaña.
- Cupo gratuito de Cloudflare: 10.000 Neurons por día. Si se agota, el bot vuelve a responder al día siguiente; no se cobra nada.

Cada vez que se suma un proyecto o una capa al sitio, el asistente la conoce sola en menos de una hora.
