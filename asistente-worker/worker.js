/* Asistente del visor — Apacheta Cartografía
 * Cloudflare Worker que recibe la pregunta del visor, le pasa a Claude los datos
 * publicados en el sitio (proyectos.geojson y sus capas) y devuelve:
 *   { texto: "...", acciones: [ {tipo:'proyecto', id} | {tipo:'punto', id, nombre} ] }
 * La clave de la API va como secreto del Worker: ANTHROPIC_API_KEY.
 */

const SITIO = 'https://apacheta-cartografia.github.io';
const MODELO = 'claude-haiku-5-5';
const MAX_PREGUNTAS_POR_IP_POR_DIA = 30;   // límite simple, por instancia del Worker

let cache = null;
let cacheHora = 0;
const usos = new Map();

function cors(origen) {
  return {
    'Access-Control-Allow-Origin': SITIO,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  };
}

function json(cuerpo, estado, origen) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, cors(origen))
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
      } catch (err) { /* capa no disponible: el proyecto queda sin detalle */ }
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
  cache = { texto, ids: proyectos.map(x => x.p.id) };
  cacheHora = Date.now();
  return cache;
}

function sistema(contexto) {
  return `Sos el asistente del visor territorial de Apacheta Cartografía (Mendoza, Argentina). Respondés en español rioplatense, breve y claro (hasta 6 líneas).

REGLAS:
1. Respondé SOLO con la información de DATOS DEL VISOR. No uses conocimiento propio para dar coordenadas, altitudes, distancias, tiempos, ubicaciones de agua, refugios o rutas.
2. Si el dato no está, decí exactamente que no está cargado en el visor y sugerí qué sí podés responder. Nunca inventes.
3. Si los datos traen una advertencia (trazado esquemático, ubicación aproximada, agua que puede faltar, altitudes distintas según la fuente), mencionala.
4. Para clima, permisos vigentes, estado de caminos o rescate, recomendá consultar las fuentes oficiales; no tenés esa información.
5. Cuando la respuesta se refiera a un proyecto o a un elemento, usá la herramienta mostrar_en_mapa para mostrarlo. Escribí siempre la respuesta en texto además de usar la herramienta.
6. Si te preguntan algo ajeno a los mapas y proyectos del visor, decí amablemente que solo respondés sobre eso.

DATOS DEL VISOR:
${contexto}`;
}

function herramientas(ids) {
  return [{
    name: 'mostrar_en_mapa',
    description: 'Mueve el visor para mostrar un proyecto y, opcionalmente, uno de sus elementos (refugio, cumbre, ruta, etc.). Usar el nombre del elemento tal como figura en los datos.',
    input_schema: {
      type: 'object',
      properties: {
        proyecto_id: { type: 'string', enum: ids, description: 'id del proyecto' },
        nombre_elemento: { type: 'string', description: 'Nombre exacto del elemento, si corresponde' }
      },
      required: ['proyecto_id']
    }
  }];
}

function limpiarMensajes(mensajes) {
  if (!Array.isArray(mensajes)) return null;
  const ok = mensajes.slice(-6)
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role, content: m.content.slice(0, 600) }));
  while (ok.length && ok[0].role !== 'user') ok.shift();
  if (!ok.length || ok[ok.length - 1].role !== 'user') return null;
  return ok;
}

export default {
  async fetch(request, env) {
    const origen = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors(origen) });
    if (request.method !== 'POST') return json({ error: 'Método no permitido' }, 405, origen);
    if (origen !== SITIO) return json({ error: 'Origen no permitido' }, 403, origen);
    if (!env.ANTHROPIC_API_KEY) return json({ error: 'Falta configurar ANTHROPIC_API_KEY' }, 500, origen);

    // Límite simple de uso por IP y por día
    const ip = request.headers.get('CF-Connecting-IP') || 'anon';
    const clave = ip + '|' + new Date().toISOString().slice(0, 10);
    const n = (usos.get(clave) || 0) + 1;
    usos.set(clave, n);
    if (n > MAX_PREGUNTAS_POR_IP_POR_DIA) {
      return json({ texto: 'Llegaste al límite de preguntas por hoy. Podés seguir explorando el visor.', acciones: [] }, 200, origen);
    }

    let cuerpo;
    try { cuerpo = await request.json(); } catch (e) { return json({ error: 'JSON inválido' }, 400, origen); }
    const mensajes = limpiarMensajes(cuerpo.mensajes);
    if (!mensajes) return json({ error: 'Mensajes inválidos' }, 400, origen);

    const ctx = await datos();
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 600,
        system: sistema(ctx.texto),
        tools: herramientas(ctx.ids),
        messages: mensajes
      })
    });
    if (!r.ok) return json({ error: 'Error de la IA', estado: r.status }, 502, origen);
    const res = await r.json();

    let texto = '';
    const acciones = [];
    for (const b of res.content || []) {
      if (b.type === 'text') texto += b.text;
      if (b.type === 'tool_use' && b.name === 'mostrar_en_mapa' && b.input && b.input.proyecto_id) {
        if (b.input.nombre_elemento) acciones.push({ tipo: 'punto', id: b.input.proyecto_id, nombre: b.input.nombre_elemento });
        else acciones.push({ tipo: 'proyecto', id: b.input.proyecto_id });
      }
    }
    if (!texto.trim()) texto = acciones.length ? 'Te lo muestro en el mapa.' : 'No tengo ese dato cargado en el visor.';
    return json({ texto: texto.trim(), acciones }, 200, origen);
  }
};
