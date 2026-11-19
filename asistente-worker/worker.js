/* Asistente del visor — Apacheta Cartografía
 * Cloudflare Worker con Workers AI (plan gratuito, sin tarjeta ni clave externa).
 * Recibe la pregunta del visor, le pasa al modelo los datos publicados en el sitio
 * (proyectos.geojson y sus capas) y devuelve:
 *   { texto: "...", acciones: [ {tipo:'proyecto', id} | {tipo:'punto', id, nombre} ] }
 * Requiere una vinculación (binding) de Workers AI llamada AI.
 */

const SITIO = 'https://apacheta-cartografia.github.io';
const MODELO = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';   // más liviano: '@cf/meta/llama-3.1-8b-instruct'
const MAX_PREGUNTAS_POR_IP_POR_DIA = 30;

let cache = null;
let cacheHora = 0;
const usos = new Map();

const CORS = {
  'Access-Control-Allow-Origin': SITIO,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Vary': 'Origin'
};

function json(cuerpo, estado) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, CORS)
  });
}

// Lee los datos publicados y arma el contexto (se renueva cada hora)
async function datos() {
  if (cache && Date.now() - cacheHora < 3600 * 1000) return cache;
  const pj = await (await fetch(SITIO + '/proyectos.geojson')).json();
  const proyectos = [];
  for (const f of pj.features) {
    const p = f.properties || {};
    const elementos = [];
    if (p.capa) {
      try {
        const c = await (await fetch(SITIO + '/' + p.capa)).json();
        for (const e of c.features) elementos.push(e.properties || {});
      } catch (err) { /* capa no disponible */ }
    }
    proyectos.push({ p, elementos });
  }
  const texto = proyectos.map(({ p, elementos }) => {
    const cab = `### Proyecto id=${p.id}\nTítulo: ${p.titulo}\nCategoría: ${p.categoria}\nLugar: ${p.lugar || '—'}\nDescripción: ${p.descripcion || '—'}` +
      (p.ubicacion === 'aproximada' ? '\nUbicación: aproximada' : '');
    const els = elementos.map(e =>
      `- ${e.nombre} (tipo: ${e.tipo}${e.altitud ? ', altitud: ' + e.altitud + ' m' : ''})${e.nota ? ': ' + e.nota : ''}`
    ).join('\n');
    return cab + (els ? '\nElementos:\n' + els : '\nElementos: ninguno cargado');
  }).join('\n\n');
  const nombres = {};
  proyectos.forEach(({ p, elementos }) => { nombres[p.id] = elementos.map(e => e.nombre); });
  cache = { texto, ids: proyectos.map(x => x.p.id), nombres };
  cacheHora = Date.now();
  return cache;
}

function sistema(contexto) {
  return `Sos el asistente del visor territorial de Apacheta Cartografía (Mendoza, Argentina). Respondés en español rioplatense, breve y claro (hasta 6 líneas).

REGLAS:
1. Respondé SOLO con la información de DATOS DEL VISOR. No uses conocimiento propio para dar coordenadas, altitudes, distancias, tiempos, ubicaciones de agua, refugios o rutas.
2. Si el dato no está, decí que no está cargado en el visor y sugerí qué sí podés responder. Nunca inventes. Usá cada nombre y cada tipo exactamente como figuran en los datos: no conviertas un campamento en refugio ni le agregues palabras a un nombre. Si preguntan por un tipo (refugios, campamentos, agua, cumbres), listá solo los elementos de ese tipo; si no hay, decilo.
3. Si los datos traen una advertencia (trazado esquemático, ubicación aproximada, agua que puede faltar, altitudes distintas según la fuente), mencionala.
4. Para clima, permisos vigentes, estado de caminos o rescate, recomendá consultar las fuentes oficiales.
5. Si te preguntan algo ajeno a los mapas y proyectos del visor, decí amablemente que solo respondés sobre eso.

FORMATO DE SALIDA: respondé SIEMPRE y solo con un objeto JSON:
{"texto": "tu respuesta", "proyecto_id": "id del proyecto a mostrar o vacío", "elemento": "nombre exacto del elemento a mostrar o vacío"}

DATOS DEL VISOR:
${contexto}`;
}

const ESQUEMA = {
  type: 'json_schema',
  json_schema: {
    type: 'object',
    properties: {
      texto: { type: 'string' },
      proyecto_id: { type: 'string' },
      elemento: { type: 'string' }
    },
    required: ['texto']
  }
};

function limpiarMensajes(mensajes) {
  if (!Array.isArray(mensajes)) return null;
  const ok = mensajes.slice(-6)
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role, content: m.content.slice(0, 600) }));
  while (ok.length && ok[0].role !== 'user') ok.shift();
  if (!ok.length || ok[ok.length - 1].role !== 'user') return null;
  return ok;
}

function leerSalida(res) {
  let r = res && res.response !== undefined ? res.response : res;
  if (typeof r === 'string') {
    try { r = JSON.parse(r); } catch (e) {
      const m = r.match(/\{[\s\S]*\}/);
      try { r = m ? JSON.parse(m[0]) : { texto: r }; } catch (e2) { r = { texto: r }; }
    }
  }
  return r && typeof r === 'object' ? r : { texto: String(r || '') };
}

export default {
  async fetch(request, env) {
    const origen = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (request.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
    if (origen !== SITIO) return json({ error: 'Origen no permitido' }, 403);
    if (!env.AI) return json({ error: 'Falta la vinculación de Workers AI llamada AI' }, 500);

    const ip = request.headers.get('CF-Connecting-IP') || 'anon';
    const clave = ip + '|' + new Date().toISOString().slice(0, 10);
    const n = (usos.get(clave) || 0) + 1;
    usos.set(clave, n);
    if (n > MAX_PREGUNTAS_POR_IP_POR_DIA) {
      return json({ texto: 'Llegaste al límite de preguntas por hoy. Podés seguir explorando el visor.', acciones: [] });
    }

    let cuerpo;
    try { cuerpo = await request.json(); } catch (e) { return json({ error: 'JSON inválido' }, 400); }
    const mensajes = limpiarMensajes(cuerpo.mensajes);
    if (!mensajes) return json({ error: 'Mensajes inválidos' }, 400);

    const ctx = await datos();
    let salida;
    try {
      const res = await env.AI.run(MODELO, {
        messages: [{ role: 'system', content: sistema(ctx.texto) }].concat(mensajes),
        max_tokens: 500,
        temperature: 0.2,
        response_format: ESQUEMA
      });
      salida = leerSalida(res);
    } catch (e) {
      return json({ error: 'Error del modelo', detalle: String(e && e.message || e) }, 502);
    }

    const texto = (salida.texto || '').toString().trim() || 'No tengo ese dato cargado en el visor.';
    const acciones = [];
    const id = (salida.proyecto_id || '').toString();
    if (ctx.ids.indexOf(id) >= 0) {
      const el = (salida.elemento || '').toString();
      if (el && ctx.nombres[id].indexOf(el) >= 0) acciones.push({ tipo: 'punto', id, nombre: el });
      else acciones.push({ tipo: 'proyecto', id });
    }
    return json({ texto, acciones });
  }
};
