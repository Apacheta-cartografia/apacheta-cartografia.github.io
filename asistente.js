/* Asistente del visor — Apacheta Cartografía (prototipo)
 * Responde SOLO con los datos cargados en el visor (proyectos.geojson y sus capas).
 * Dos modos:
 *  - Local (por defecto): búsqueda por palabras clave, sin IA y sin costo.
 *  - IA: si window.APACHETA_ASISTENTE_URL apunta al Worker, la pregunta se
 *    envía a Claude, que responde con los mismos datos y puede mover el mapa.
 */
(function () {
  'use strict';

  var URL_IA = window.APACHETA_ASISTENTE_URL || '';
  var AVISO = 'Información orientativa tomada de los datos del visor. Verificala antes de salir a la montaña.';
  var datos = null;            // { proyectos: [ {props, elementos:[props...]} ] }
  var historial = [];          // [{role, content}] para el modo IA

  var $ = function (id) { return document.getElementById(id); };
  var elPanel = $('asistente'), elAbrir = $('asistente-abrir'), elCerrar = $('asistente-cerrar');
  var elMensajes = $('asistente-mensajes'), elForm = $('asistente-form'), elInput = $('asistente-input');
  var elModo = $('asistente-modo'), elSugerencias = $('asistente-sugerencias');

  elModo.textContent = URL_IA ? 'Con IA' : 'Modo local';

  // ---------- Abrir y cerrar ----------
  function abrir() {
    elPanel.hidden = false;
    elAbrir.setAttribute('aria-expanded', 'true');
    var panel = $('panel');
    if (panel) panel.classList.remove('abierto');
    elInput.focus();
    if (!elMensajes.children.length) {
      agregar('bot', 'Hola. Puedo contarte sobre los proyectos del visor: rutas, refugios, campamentos, agua y cumbres. ¿Qué querés saber?');
    }
  }
  function cerrar() {
    elPanel.hidden = true;
    elAbrir.setAttribute('aria-expanded', 'false');
    elAbrir.focus();
  }
  elAbrir.addEventListener('click', function () { if (elPanel.hidden) abrir(); else cerrar(); });
  elCerrar.addEventListener('click', cerrar);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !elPanel.hidden && elPanel.contains(document.activeElement)) cerrar();
  });

  elSugerencias.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    preguntar(b.textContent);
  });

  elForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var q = elInput.value.trim();
    if (!q) return;
    elInput.value = '';
    preguntar(q);
  });

  // ---------- Mensajes ----------
  function agregar(quien, texto, fuente) {
    var div = document.createElement('div');
    div.className = 'msj msj-' + quien;
    texto.split('\n').forEach(function (linea, i) {
      if (i) div.appendChild(document.createElement('br'));
      div.appendChild(document.createTextNode(linea));
    });
    if (fuente) {
      var f = document.createElement('p');
      f.className = 'msj-fuente';
      f.textContent = fuente;
      div.appendChild(f);
    }
    elMensajes.appendChild(div);
    elMensajes.scrollTop = elMensajes.scrollHeight;
    return div;
  }

  function preguntar(q) {
    elSugerencias.hidden = true;
    agregar('yo', q);
    var espera = agregar('bot', 'Buscando…');
    espera.classList.add('msj-espera');
    cargarDatos()
      .then(function () { return URL_IA ? responderIA(q) : responderLocal(q); })
      .then(function (r) {
        espera.remove();
        agregar('bot', r.texto, AVISO);
        (r.acciones || []).forEach(ejecutar);
      })
      .catch(function () {
        espera.remove();
        var r = responderLocal(q);
        agregar('bot', r.texto, AVISO + (URL_IA ? ' (El asistente con IA no respondió; contesté en modo local.)' : ''));
        (r.acciones || []).forEach(ejecutar);
      });
  }

  // ---------- Acciones sobre el mapa ----------
  function ejecutar(a) {
    var v = window.ApachetaVisor;
    if (!v || !a) return;
    if (a.tipo === 'proyecto' && a.id) v.seleccionar(a.id);
    if (a.tipo === 'punto' && a.id && a.nombre) v.irA(a.id, a.nombre);
  }

  // ---------- Datos ----------
  function cargarDatos() {
    if (datos) return Promise.resolve(datos);
    return fetch('proyectos.geojson').then(function (r) { return r.json(); }).then(function (gj) {
      var lista = gj.features.map(function (f) { return { props: f.properties || {}, elementos: [] }; });
      return Promise.all(lista.map(function (p) {
        if (!p.props.capa) return null;
        return fetch(p.props.capa).then(function (r) { return r.json(); }).then(function (c) {
          p.elementos = c.features.map(function (f) { return f.properties || {}; });
        }).catch(function () {});
      })).then(function () { datos = { proyectos: lista }; return datos; });
    });
  }

  // ---------- Modo local: palabras clave ----------
  function normalizar(s) {
    return (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  // Coincidencia al comienzo de una palabra («refugios» sí, «aconcagua» no cuenta como «agua»)
  function contiene(q, c) {
    return new RegExp('(^|[^a-z0-9])' + c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(q);
  }

  var TIPOS = [
    { tipos: ['agua'], claves: ['agua', 'fuente', 'tomar'], nombre: 'agua' },
    { tipos: ['refugio'], claves: ['refugio'], nombre: 'refugios' },
    { tipos: ['campamento'], claves: ['campamento', 'acampar', 'camp', 'base'], nombre: 'campamentos' },
    { tipos: ['cumbre'], claves: ['cumbre', 'cima', 'altura', 'alto', 'mide', 'metros', 'cerro', 'volcan'], nombre: 'cumbres' },
    { tipos: ['ruta'], claves: ['ruta', 'camino', 'sendero', 'subir', 'llego', 'llegar', 'como se', 'distancia', 'cuanto hay', 'horas', 'tiempo', 'trekking'], nombre: 'rutas' },
    { tipos: ['inicio', 'memorial', 'poi'], claves: ['inicio', 'acceso', 'entrada', 'memorial', 'avion', 'empieza', 'arranca'], nombre: 'accesos y puntos de interés' }
  ];

  var ALIAS = {
    'ojo-del-salado': ['ojo del salado', 'ojos del salado', 'salado', 'tejos', 'atacama'],
    'aconcagua': ['aconcagua', 'horcones', 'plaza de mulas', 'confluencia'],
    'valle-de-las-lagrimas': ['lagrimas', 'sosneado', 'avion', 'uruguayos', 'seler', '571'],
    'laguna-del-diamante': ['diamante', 'maipo'],
    'cinturon-verde': ['cinturon verde', 'horticola', 'cvamm'],
    'oasis-norte': ['oasis norte', 'uso del suelo', 'siip']
  };

  function describir(e) {
    var partes = [e.nombre];
    if (e.altitud) partes.push(e.altitud + ' m');
    var linea = '• ' + partes.join(', ');
    if (e.nota) linea += '. ' + e.nota;
    return linea;
  }

  function responderLocal(pregunta) {
    var q = normalizar(pregunta);
    var lista = datos ? datos.proyectos : [];

    // 1) ¿Nombra un elemento puntual? (ej.: "Plaza de Mulas", "Refugio Tejos")
    var mejor = null;
    lista.forEach(function (p) {
      p.elementos.forEach(function (e) {
        var n = normalizar(e.nombre);
        var nucleo = n.replace(/^(refugio|campamento|volcan|cerro|laguna( de)?|cumbre( del)?)\s+/, '').replace(/\s*\(.*\)$/, '');
        if (nucleo.length > 4 && contiene(q, nucleo) && (!mejor || nucleo.length > mejor.largo)) {
          mejor = { p: p, e: e, largo: nucleo.length };
        }
      });
    });

    // 2) ¿Qué proyecto?
    var proyecto = null;
    lista.forEach(function (p) {
      var claves = (ALIAS[p.props.id] || []).concat([normalizar(p.props.titulo)]);
      if (claves.some(function (c) { return contiene(q, c); })) proyecto = proyecto || p;
    });
    if (mejor && proyecto && mejor.p !== proyecto) mejor = null;
    if (mejor && !proyecto) proyecto = mejor.p;

    // 3) ¿Qué tipo de dato?
    var tipo = null;
    TIPOS.forEach(function (t) {
      if (!tipo && t.claves.some(function (c) { return contiene(q, c); })) tipo = t;
    });

    if (mejor && (!tipo || tipo.tipos.indexOf(mejor.e.tipo) >= 0 || tipo.nombre === 'cumbres')) {
      return {
        texto: mejor.p.props.titulo + ':\n' + describir(mejor.e),
        acciones: [{ tipo: 'punto', id: mejor.p.props.id, nombre: mejor.e.nombre }]
      };
    }

    if (proyecto && tipo) {
      var encontrados = proyecto.elementos.filter(function (e) { return tipo.tipos.indexOf(e.tipo) >= 0; });
      if (!encontrados.length) {
        return {
          texto: 'No tengo cargados ' + tipo.nombre + ' para ' + proyecto.props.titulo + '. Ese dato no está en el visor, así que no te lo puedo confirmar.',
          acciones: [{ tipo: 'proyecto', id: proyecto.props.id }]
        };
      }
      return {
        texto: proyecto.props.titulo + ' — ' + tipo.nombre + ':\n' + encontrados.map(describir).join('\n'),
        acciones: [{ tipo: 'punto', id: proyecto.props.id, nombre: encontrados[0].nombre }]
      };
    }

    if (proyecto) {
      var resumen = proyecto.props.titulo + '\n' + (proyecto.props.descripcion || '');
      if (proyecto.elementos.length) {
        var tiposHay = {};
        proyecto.elementos.forEach(function (e) { tiposHay[e.tipo] = true; });
        var disponibles = TIPOS.filter(function (t) { return t.tipos.some(function (x) { return tiposHay[x]; }); })
          .map(function (t) { return t.nombre; });
        resumen += '\n\nPodés preguntarme por: ' + disponibles.join(', ') + '.';
      }
      return { texto: resumen, acciones: [{ tipo: 'proyecto', id: proyecto.props.id }] };
    }

    return {
      texto: 'No encontré eso en los datos del visor. Puedo responder sobre: ' +
        lista.map(function (p) { return p.props.titulo; }).join('; ') +
        '.\nProbá, por ejemplo: «refugios del Ojo del Salado» o «altura del Maipo».',
      acciones: []
    };
  }

  // ---------- Modo IA: Worker con Claude ----------
  function responderIA(pregunta) {
    historial.push({ role: 'user', content: pregunta });
    historial = historial.slice(-6);
    return fetch(URL_IA, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensajes: historial })
    }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    }).then(function (r) {
      historial.push({ role: 'assistant', content: r.texto || '' });
      return { texto: r.texto || 'No tengo ese dato en el visor.', acciones: r.acciones || [] };
    });
  }
})();
