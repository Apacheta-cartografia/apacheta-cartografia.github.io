/* Visor territorial — Apacheta Cartografía
 * Leaflet 1.9.4. Los proyectos se leen de proyectos.geojson.
 * Para sumar un proyecto: agregar un Feature a ese archivo.
 */
(function () {
  'use strict';

  // ---------- Configuración ----------
  var CATEGORIAS = {
    'Análisis territorial':    '#9A3F1C',
    'Análisis socioeconómico': '#4F5E35',
    'Análisis socioambiental': '#2E7D6B',
    'Cartografía':             '#2B566C'
  };
  var COLOR_DEFECTO = '#4A524E';

  // Estilo de los elementos de las capas de detalle, según la propiedad "tipo"
  var TIPOS = {
    cumbre:     { color: '#16201D', nombre: 'Cumbre' },
    refugio:    { color: '#9A3F1C', nombre: 'Refugio' },
    campamento: { color: '#D08A2E', nombre: 'Campamento' },
    agua:       { color: '#2B7BB9', nombre: 'Agua' },
    ruta:       { color: '#9A3F1C', nombre: 'Ruta' },
    area:       { color: '#2B566C', nombre: 'Área de estudio' }
  };

  var VISTA_INICIAL = { centro: [-30.0, -68.5], zoom: 6 };

  // ---------- Mapa y mapas base ----------
  var mapa = L.map('mapa', { zoomControl: false, minZoom: 3 })
    .setView(VISTA_INICIAL.centro, VISTA_INICIAL.zoom);

  var bases = {
    'Claro': L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19, subdomains: 'abcd',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
    }),
    'Topográfico': L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      maxZoom: 17,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, SRTM | &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)'
    }),
    'Satelital': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Imágenes &copy; Esri, Maxar, Earthstar Geographics'
    })
  };
  bases['Claro'].addTo(mapa);

  var capaProyectos = L.layerGroup().addTo(mapa);
  var capaDetalle = L.layerGroup().addTo(mapa);

  L.control.zoom({ position: 'topright', zoomInTitle: 'Acercar', zoomOutTitle: 'Alejar' }).addTo(mapa);
  L.control.layers(bases, { 'Proyectos': capaProyectos, 'Detalle del proyecto': capaDetalle },
    { position: 'topright', collapsed: true }).addTo(mapa);
  L.control.scale({ imperial: false, position: 'bottomright' }).addTo(mapa);

  // Coordenadas del cursor en grados, minutos y segundos
  var Coords = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd: function () {
      this._div = L.DomUtil.create('div', 'coords');
      this._div.textContent = '—';
      return this._div;
    },
    actualizar: function (ll) { this._div.textContent = dms(ll.lat, 'S', 'N') + ' · ' + dms(ll.lng, 'O', 'E'); }
  });
  var coords = new Coords().addTo(mapa);
  mapa.on('mousemove', function (e) { coords.actualizar(e.latlng); });

  function dms(valor, neg, pos) {
    var h = valor < 0 ? neg : pos;
    var a = Math.abs(valor);
    var g = Math.floor(a);
    var m = Math.floor((a - g) * 60);
    var s = Math.round(((a - g) * 60 - m) * 60);
    if (s === 60) { s = 0; m += 1; }
    if (m === 60) { m = 0; g += 1; }
    return g + '°' + pad(m) + '′' + pad(s) + '″ ' + h;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // ---------- Estado ----------
  var proyectos = [];          // { id, props, feature, layer }
  var activas = {};            // categorías visibles
  var seleccionado = null;
  var cacheCapas = {};

  // ---------- Elementos ----------
  var $ = function (id) { return document.getElementById(id); };
  var elLista = $('lista'), elFiltros = $('filtros'), elBuscar = $('buscar'), elContador = $('contador');
  var elPanel = $('panel'), elToggle = $('toggle-panel');
  var elFicha = $('ficha');

  // ---------- Carga de datos ----------
  fetch('proyectos.geojson')
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(iniciar)
    .catch(function (err) {
      elLista.innerHTML = '';
      var li = document.createElement('li');
      li.className = 'vacio';
      li.textContent = 'No se pudo cargar proyectos.geojson (' + err.message + '). Si abriste el archivo con doble clic, servilo con un servidor local.';
      elLista.appendChild(li);
    });

  function iniciar(geojson) {
    geojson.features.forEach(function (f) {
      var p = f.properties || {};
      if (!p.id) return;
      var color = CATEGORIAS[p.categoria] || COLOR_DEFECTO;
      var layer = L.geoJSON(f, {
        pointToLayer: function (feat, ll) {
          return L.circleMarker(ll, estiloMarcador(color, false));
        },
        style: function () { return { color: color, weight: 2, fillOpacity: 0.12 }; }
      });
      layer.on('click', function () { seleccionar(p.id, true); });
      layer.bindTooltip(p.titulo, { direction: 'top', offset: [0, -8] });
      proyectos.push({ id: p.id, props: p, feature: f, layer: layer, color: color });
    });

    // Filtros: solo las categorías presentes
    var cats = [];
    proyectos.forEach(function (x) { if (cats.indexOf(x.props.categoria) < 0) cats.push(x.props.categoria); });
    cats.forEach(function (c) {
      activas[c] = true;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'filtro';
      b.setAttribute('aria-pressed', 'true');
      var dot = document.createElement('span');
      dot.className = 'punto';
      dot.style.background = CATEGORIAS[c] || COLOR_DEFECTO;
      b.appendChild(dot);
      b.appendChild(document.createTextNode(c));
      b.addEventListener('click', function () {
        activas[c] = !activas[c];
        b.setAttribute('aria-pressed', String(activas[c]));
        renderizar();
      });
      elFiltros.appendChild(b);
    });

    elBuscar.addEventListener('input', renderizar);
    renderizar();

    var todos = L.featureGroup(proyectos.map(function (x) { return x.layer; }));
    if (proyectos.length) mapa.fitBounds(todos.getBounds().pad(0.3), { maxZoom: 8 });

    // Enlace directo: #id-del-proyecto
    leerHash();
    window.addEventListener('hashchange', leerHash);
  }

  function estiloMarcador(color, activo) {
    return {
      radius: activo ? 10 : 7,
      color: '#FFFFFF', weight: activo ? 3 : 2,
      fillColor: color, fillOpacity: 1
    };
  }

  function normalizar(s) {
    return (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function visibles() {
    var q = normalizar(elBuscar.value);
    return proyectos.filter(function (x) {
      if (!activas[x.props.categoria]) return false;
      if (!q) return true;
      var p = x.props;
      return normalizar([p.titulo, p.lugar, p.categoria, p.descripcion, (p.etiquetas || []).join(' ')].join(' ')).indexOf(q) >= 0;
    });
  }

  // ---------- Lista y marcadores ----------
  function renderizar() {
    var vis = visibles();
    capaProyectos.clearLayers();
    vis.forEach(function (x) { capaProyectos.addLayer(x.layer); });

    elLista.innerHTML = '';
    if (!vis.length) {
      var v = document.createElement('li');
      v.className = 'vacio';
      v.textContent = 'Ningún proyecto coincide con la búsqueda.';
      elLista.appendChild(v);
    }
    vis.forEach(function (x) {
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'item';
      if (x.id === seleccionado) b.setAttribute('aria-current', 'true');
      var dot = document.createElement('span');
      dot.className = 'punto';
      dot.style.background = x.color;
      var txt = document.createElement('span');
      txt.appendChild(span('item-cat', x.props.categoria));
      txt.appendChild(span('item-titulo', x.props.titulo));
      txt.appendChild(span('item-lugar', [x.props.lugar, x.props.anio].filter(Boolean).join(' · ')));
      b.appendChild(dot);
      b.appendChild(txt);
      b.addEventListener('click', function () { seleccionar(x.id, true); cerrarPanelMovil(); });
      li.appendChild(b);
      elLista.appendChild(li);
    });
    elContador.textContent = vis.length + (vis.length === 1 ? ' proyecto' : ' proyectos');
    actualizarMarcadores();
  }

  function span(cls, texto) {
    var s = document.createElement('span');
    s.className = cls;
    s.textContent = texto || '';
    return s;
  }

  function actualizarMarcadores() {
    proyectos.forEach(function (x) {
      x.layer.eachLayer(function (l) {
        if (l.setStyle && l instanceof L.CircleMarker) {
          l.setStyle(estiloMarcador(x.color, x.id === seleccionado));
          if (x.id === seleccionado) l.bringToFront();
        }
      });
    });
  }

  // ---------- Selección ----------
  function seleccionar(id, actualizarHash) {
    var x = proyectos.filter(function (p) { return p.id === id; })[0];
    if (!x) return;
    seleccionado = id;
    if (actualizarHash && location.hash !== '#' + id) history.replaceState(null, '', '#' + id);
    renderizar();
    mostrarFicha(x);
    cargarDetalle(x);
  }

  function leerHash() {
    var id = decodeURIComponent(location.hash.replace('#', ''));
    if (id && id !== seleccionado) seleccionar(id, false);
  }

  function deseleccionar() {
    seleccionado = null;
    elFicha.hidden = true;
    capaDetalle.clearLayers();
    history.replaceState(null, '', location.pathname + location.search);
    renderizar();
  }
  $('ficha-cerrar').addEventListener('click', deseleccionar);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !elFicha.hidden && elFicha.contains(document.activeElement)) deseleccionar();
  });

  function mostrarFicha(x) {
    var p = x.props;
    $('ficha-cat').textContent = p.categoria || '';
    $('ficha-titulo').textContent = p.titulo || '';
    $('ficha-meta').textContent = [p.lugar, p.anio, p.cliente].filter(Boolean).join(' · ');
    $('ficha-desc').textContent = p.descripcion || '';

    var img = $('ficha-img');
    if (p.imagen) { img.src = p.imagen; img.alt = p.titulo; img.hidden = false; }
    else { img.hidden = true; img.removeAttribute('src'); }

    var acc = $('ficha-acciones');
    acc.innerHTML = '';
    if (p.tienda) acc.appendChild(boton(p.tienda, 'Comprar mapa impreso', true));
    if (p.enlace) acc.appendChild(boton(p.enlace, 'Ver proyecto', !p.tienda));

    $('ficha-leyenda').hidden = true;
    elFicha.hidden = false;
  }

  function boton(href, texto, primario) {
    var a = document.createElement('a');
    a.href = href;
    a.className = 'boton' + (primario ? ' primario' : '');
    a.textContent = texto;
    if (/^https?:/.test(href)) { a.target = '_blank'; a.rel = 'noopener'; }
    return a;
  }

  // ---------- Capa de detalle de cada proyecto ----------
  function cargarDetalle(x) {
    capaDetalle.clearLayers();
    var url = x.props.capa;
    if (!url) {
      if (x.feature.geometry.type === 'Point') {
        mapa.flyTo(x.layer.getBounds().getCenter(), x.props.zoom || 10, { duration: 0.8 });
      } else {
        mapa.flyToBounds(x.layer.getBounds().pad(0.2), { duration: 0.8 });
      }
      return;
    }
    var promesa = cacheCapas[url] || (cacheCapas[url] = fetch(url).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    }));
    promesa.then(function (gj) {
      if (seleccionado !== x.id) return;
      var tiposPresentes = {};
      var capa = L.geoJSON(gj, {
        pointToLayer: function (f, ll) {
          var t = TIPOS[f.properties.tipo] || { color: COLOR_DEFECTO };
          tiposPresentes[f.properties.tipo] = true;
          return L.circleMarker(ll, { radius: 6, color: '#FFFFFF', weight: 2, fillColor: t.color, fillOpacity: 1 });
        },
        style: function (f) {
          var t = TIPOS[f.properties.tipo] || { color: COLOR_DEFECTO };
          tiposPresentes[f.properties.tipo] = true;
          return { color: t.color, weight: 3, dashArray: f.properties.tipo === 'ruta' ? '6 6' : null, fillOpacity: 0.1 };
        },
        onEachFeature: function (f, l) {
          var p = f.properties || {};
          if (p.nombre) l.bindTooltip(p.nombre + (p.altitud ? ' · ' + p.altitud + ' m' : ''),
            { permanent: true, direction: 'right', offset: [8, 0], className: 'etiqueta' });
          l.bindPopup(popupDetalle(p));
        }
      });
      capaDetalle.addLayer(capa);
      leyendaDetalle(tiposPresentes);
      mapa.flyToBounds(capa.getBounds().pad(0.25), { duration: 0.8, maxZoom: x.props.zoom || 14 });
    }).catch(function () {
      mapa.flyTo(x.layer.getBounds().getCenter(), x.props.zoom || 10, { duration: 0.8 });
    });
  }

  function popupDetalle(p) {
    var d = document.createElement('div');
    var t = document.createElement('strong');
    t.textContent = p.nombre || '';
    d.appendChild(t);
    var info = [TIPOS[p.tipo] && TIPOS[p.tipo].nombre, p.altitud ? p.altitud + ' m' : null].filter(Boolean).join(' · ');
    if (info) { d.appendChild(document.createElement('br')); d.appendChild(document.createTextNode(info)); }
    if (p.nota) { var n = document.createElement('p'); n.style.margin = '6px 0 0'; n.textContent = p.nota; d.appendChild(n); }
    return d;
  }

  function leyendaDetalle(tipos) {
    var el = $('ficha-leyenda');
    el.innerHTML = '';
    Object.keys(tipos).forEach(function (k) {
      if (!TIPOS[k]) return;
      var s = document.createElement('span');
      var i = document.createElement('i');
      i.style.background = TIPOS[k].color;
      s.appendChild(i);
      s.appendChild(document.createTextNode(TIPOS[k].nombre));
      el.appendChild(s);
    });
    el.hidden = !el.children.length;
  }

  // ---------- Panel en el celular ----------
  elToggle.addEventListener('click', function () {
    var abierto = elPanel.classList.toggle('abierto');
    elToggle.setAttribute('aria-expanded', String(abierto));
  });
  function cerrarPanelMovil() {
    elPanel.classList.remove('abierto');
    elToggle.setAttribute('aria-expanded', 'false');
  }
})();
