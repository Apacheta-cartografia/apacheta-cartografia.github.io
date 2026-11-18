# Asistente con IA del visor — puesta en marcha

El asistente del visor funciona de entrada en **modo local**: busca por palabras clave en los datos del visor, sin IA y sin costo.
Para que responda con IA (Claude) hace falta este Worker, que guarda la clave de la API fuera del sitio público.

## 1. Clave de la API de Anthropic
1. Crear una cuenta en https://console.anthropic.com
2. Cargar crédito y fijar un **límite de gasto mensual** bajo.
3. Crear una API key y guardarla (no se publica nunca en el repositorio).

## 2. Worker en Cloudflare
1. Crear una cuenta gratuita en https://dash.cloudflare.com
2. Ir a **Workers & Pages** y crear un Worker nuevo, por ejemplo `apacheta-asistente`.
3. Editar el código, pegar el contenido de `worker.js` y publicar (**Deploy**).
4. En la configuración del Worker, agregar un **secreto** llamado `ANTHROPIC_API_KEY` con la clave del paso 1.
5. Copiar la dirección del Worker, del tipo `https://apacheta-asistente.<cuenta>.workers.dev`.

## 3. Conectar el visor
En `visor.html`, completar:

```html
<script>
  window.APACHETA_ASISTENTE_URL = 'https://apacheta-asistente.<cuenta>.workers.dev';
</script>
```

El asistente pasa a mostrar «Con IA». Si el Worker falla, responde solo en modo local.

## Qué controla el Worker
- Solo acepta pedidos desde `https://apacheta-cartografia.github.io`.
- Límite de 30 preguntas por IP y por día (ajustable en `MAX_PREGUNTAS_POR_IP_POR_DIA`).
- Le pasa a Claude únicamente los datos publicados en el visor y le prohíbe inventar datos de montaña.
- Modelo: `claude-haiku-5-5` (el más económico; se cambia en `MODELO`).

Cada vez que se suma un proyecto o una capa al sitio, el asistente la conoce sola en menos de una hora.
