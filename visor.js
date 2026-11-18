/* Visor territorial — Apacheta Cartografía
 * Leaflet 1.9.4. Proyectos en proyectos.geojson; cada proyecto puede tener
 * una capa de detalle (propiedad "capa") cuyas entidades se agrupan en
 * subcapas según su "tipo" (rutas, cumbres, refugios, etc.).
 */
(function () {
  'use strict';

  // ---------- Configuración ----------
  var CATEGORIAS = {
    'Cartografía':             '#2B566C',
    'Montaña y trekking':      '#6B4E9B',
    'Análisis territorial':    '#9A3F1C',
    'Análisis socioeconómico': '#4F5E35',
    'Análisis socioambiental': '#2E7D6B'
  };
  var COLOR_DEFECTO = '#4A524E';

  // Subcapas: orden, nombre, color y tipos que agrupa
  var SUBCAPAS = [
    { id: 'rutas',       nombre: 'Rutas',              color: '#C2410C', tipos: ['ruta'] },
    { id: 'cumbres',     nombre: 'Cumbres',            color: '#16201D', tipos: ['cumbre'] },
    { id: 'refugios',    nombre: 'Refugios',           color: '#9A3F1C', tipos: ['refugio'] },
    { id: 'campamentos', nombre: 'Campamentos',        color: '#D08A2E', tipos: ['campamento'] },
    { id: 'agua',        nombre: 'Agua',               color: '#2B7BB9', tipos: ['agua'] },
    { id: 'interes',     nombre: 'Puntos de interés',  color: '#6B4E9B', tipos: ['memorial', 'inicio', 'poi'] },
    { id: 'areas',       nombre: 'Áreas',              color: '#2B566C', tipos: ['area'] }
  ];
  var TIPO_NOMBRE = {
    ruta: 'Ruta', cumbre: 'Cumbre', refugio: 'Refugio', campamento: 'Campamento', agua: 'Agua',
    memorial: 'Memorial', inicio: 'Acceso', poi: 'Punto de interés', area: 'Área'
  };
  function subcapaDe(tipo) {
    for (var i = 0; i < SUBCAPAS.length; i++) if (SUBCAPAS[i].tipos.indexOf(tipo) >= 0) return SUBCAPAS[i];
    return SUBCAPAS[5];
  }

  // ---------- Mapa y mapas base ----------
  var mapa = L.map('mapa', { zoomControl: false, minZoom: 3 }).setView([-30.5, -69], 6);

  var bases = {
    'Satelital': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Imágenes &copy; Esri, Maxar, Earthstar Geographics'
    }),
    'Topográfico': L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      maxZoom: 17,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, SRTM | &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)'
    })
  };
  var baseActual = 'Satelital';
  bases[baseActual].addTo(mapa);
  mapa.on('baselayerchange', function (e) { baseActual = e.name; });
  function usarBase(nombre) {
    if (!bases[nombre] || nombre === baseActual) return;
    mapa.removeLayer(bases[baseActual]);
    bases[nombre].addTo(mapa);
    baseActual = nombre;
  }

  var capaProyectos = L.layerGroup().addTo(mapa);
  var capaDetalle = L.layerGroup().addTo(mapa);

  L.control.zoom({ position: 'topright', zoomInTitle: 'Acercar', zoomOutTitle: 'Alejar' }).addTo(mapa);
  L.control.layers(bases, null, { position: 'topright', collapsed: true }).addTo(mapa);
  L.control.scale({ imperial: false, position: 'bottomright' }).addTo(mapa);

  var Coords = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd: function () { this._div = L.DomUtil.create('div', 'coords'); this._div.textContent = '—'; return this._div; },
    actualizar: function (ll) { this._div.textContent = dms(ll.lat, 'S', 'N') + ' · ' + dms(ll.lng, 'O', 'E'); }
  });
  var coords = new Coords().addTo(mapa);
  mapa.on('mousemove', function (e) { coords.actualizar(e.latlng); });

  function dms(valor, neg, pos) {
    var h = valor < 0 ? neg : pos, a = Math.abs(valor), g = Math.floor(a);
    var m = Math.floor((a - g) * 60), s = Math.round(((a - g) * 60 - m) * 60);
    if (s === 60) { s = 0; m += 1; }
    if (m === 60) { m = 0; g += 1; }
    return g + '°' + pad(m) + '′' + pad(s) + '″ ' + h;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // ---------- Estado ----------
  var proyectos = [];
  var activas = {};
  var seleccionado = null;
  var cacheCapas = {};
  var subActual = {};      // id de subcapa -> { grupo: L.featureGroup, cuenta: n }
  var subOcultas = {};     // id de subcapa -> true si está apagada

  var $ = function (id) { return document.getElementById(id); };
  var elLista = $('lista'), elFiltros = $('filtros'), elBuscar = $('buscar'), elContador = $('contador');
  var elPanel = $('panel'), elToggle = $('toggle-panel'), elFicha = $('ficha');

  // ---------- Datos ----------
  fetch('proyectos.geojson')
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(iniciar)
    .catch(function (err) {
      elLista.innerHTML = '';
      var li = document.createElement('li');
      li.className = 'vacio';
      li.textContent = 'No se pudo cargar proyectos.geojson (' + err.message + ').';
      elLista.appendChild(li);
    });

  function iniciar(geojson) {
    geojson.features.forEach(function (f) {
      var p = f.properties || {};
      if (!p.id) return;
      var color = CATEGORIAS[p.categoria] || COLOR_DEFECTO;
      var layer = L.geoJSON(f, {
        pointToLayer: function (feat, ll) { return L.circleMarker(ll, estiloMarcador(color, false)); },
        style: function () { return { color: color, weight: 2, fillOpacity: 0.12 }; }
      });
      layer.on('click', function () { seleccionar(p.id, true); });
      layer.bindTooltip(p.titulo, { direction: 'top', offset: [0, -8] });
      proyectos.push({ id: p.id, props: p, feature: f, layer: layer, color: color });
    });

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
    vistaGeneral();
    leerHash();
    window.addEventListener('hashchange', leerHash);
  }

  function vistaGeneral() {
    if (!proyectos.length) return;
    var todos = L.featureGroup(proyectos.map(function (x) { return x.layer; }));
    mapa.fitBounds(todos.getBounds().pad(0.2), { maxZoom: 8 });
  }

  function estiloMarcador(color, activo) {
    return { radius: activo ? 10 : 7, color: '#FFFFFF', weight: activo ? 3 : 2, fillColor: color, fillOpacity: 1 };
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

  // ---------- Lista con árbol de capas ----------
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
      var abierto = x.id === seleccionado;
      if (abierto) li.className = 'abierto';

      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'item';
      b.setAttribute('aria-expanded', String(abierto));
      if (abierto) b.setAttribute('aria-current', 'true');
      var dot = document.createElement('span');
      dot.className = 'punto';
      dot.style.background = x.color;
      var txt = document.createElement('span');
      txt.className = 'item-texto';
      txt.appendChild(span('item-cat', x.props.categoria));
      txt.appendChild(span('item-titulo', x.props.titulo));
      txt.appendChild(span('item-lugar', [x.props.lugar, x.props.anio].filter(Boolean).join(' · ')));
      var flecha = span('item-flecha', x.props.capa ? (abierto ? '▾' : '▸') : '');
      flecha.setAttribute('aria-hidden', 'true');
      b.appendChild(dot);
      b.appendChild(txt);
      b.appendChild(flecha);
      b.addEventListener('click', function () {
        if (x.id === seleccionado) deseleccionar(); else seleccionar(x.id, true);
      });
      li.appendChild(b);

      if (abierto && x.props.capa) li.appendChild(arbolSubcapas());
      elLista.appendChild(li);
    });
    elContador.textContent = vis.length + (vis.length === 1 ? ' proyecto' : ' proyectos');
    actualizarMarcadores();
  }

  function arbolSubcapas() {
    var ul = document.createElement('ul');
    ul.className = 'subcapas';
    ul.setAttribute('aria-label', 'Capas del proyecto');
    var hay = false;
    SUBCAPAS.forEach(function (s) {
      var info = subActual[s.id];
      if (!info) return;
      hay = true;
      var li = document.createElement('li');
      var label = document.createElement('label');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !subOcultas[s.id];
      cb.addEventListener('change', function () {
        subOcultas[s.id] = !cb.checked;
        if (cb.checked) capaDetalle.addLayer(info.grupo); else capaDetalle.removeLayer(info.grupo);
      });
      var muestra = document.createElement('i');
      muestra.className = s.id === 'rutas' ? 'muestra linea' : 'muestra';
      if (s.id === 'rutas') muestra.style.borderTopColor = s.color; else muestra.style.background = s.color;
      label.appendChild(cb);
      label.appendChild(muestra);
      label.appendChild(document.createTextNode(s.nombre));
      label.appendChild(span('cuenta', String(info.cuenta)));
      li.appendChild(label);
      ul.appendChild(li);
    });
    if (!hay) {
      var c = document.createElement('li');
      c.className = 'cargando';
      c.textContent = 'Cargando capas…';
      ul.appendChild(c);
    }
    return ul;
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
        if (l instanceof L.CircleMarker) {
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
    subActual = {};
    subOcultas = {};
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
    subActual = {};
    elFicha.hidden = true;
    capaDetalle.clearLayers();
    history.replaceState(null, '', location.pathname + location.search);
    renderizar();
    vistaGeneral();
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
    var nota = $('ficha-leyenda');
    nota.textContent = p.ubicacion === 'aproximada' ? 'Ubicación aproximada.' : '';
    nota.hidden = !nota.textContent;
    elFicha.hidden = false;
  }

  function boton(href, texto, primario) {
    var a = document.createElement('a');
    a.href = href;
    a.className = 'boton' + (primario ? ' primario' : '');
    a.textContent = texto;
    a.target = /^https?:/.test(href) ? '_blank' : '_top';
    if (a.target === '_blank') a.rel = 'noopener';
    return a;
  }

  // ---------- Capa de detalle, separada en subcapas ----------
  function cargarDetalle(x) {
    capaDetalle.clearLayers();
    var url = x.props.capa;
    if (!url) {
      mapa.flyTo(x.layer.getBounds().getCenter(), x.props.zoom || 10, { duration: 0.8 });
      return;
    }
    var promesa = cacheCapas[url] || (cacheCapas[url] = fetch(url).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    }));
    promesa.then(function (gj) {
      if (seleccionado !== x.id) return;
      var grupos = {};
      gj.features.forEach(function (f) {
        var p = f.properties || {};
        var s = subcapaDe(p.tipo);
        if (!grupos[s.id]) grupos[s.id] = { grupo: L.featureGroup(), cuenta: 0 };
        var capa = L.geoJSON(f, {
          pointToLayer: function (feat, ll) {
            return L.circleMarker(ll, { radius: p.tipo === 'cumbre' ? 7 : 6, color: '#FFFFFF', weight: 2, fillColor: s.color, fillOpacity: 1 });
          },
          style: function () {
            return { color: s.color, weight: 3.5, opacity: 0.9, dashArray: f.geometry.type === 'LineString' ? '8 6' : null, fillOpacity: 0.1 };
          },
          onEachFeature: function (feat, l) {
            if (p.nombre) {
              var etiqueta = p.nombre + (p.altitud ? ' · ' + p.altitud + ' m' : '');
              if (feat.geometry.type === 'Point') {
                l.bindTooltip(etiqueta, { permanent: true, direction: 'right', offset: [8, 0], className: 'etiqueta' });
              } else {
                l.bindTooltip(etiqueta, { sticky: true, className: 'etiqueta' });
              }
            }
            l.bindPopup(popupDetalle(p, s));
          }
        });
        grupos[s.id].grupo.addLayer(capa);
        grupos[s.id].cuenta += 1;
      });
      subActual = grupos;
      Object.keys(grupos).forEach(function (k) { capaDetalle.addLayer(grupos[k].grupo); });
      renderizar();
      var limites = L.featureGroup(Object.keys(grupos).map(function (k) { return grupos[k].grupo; })).getBounds();
      if (limites.isValid()) mapa.flyToBounds(limites.pad(0.25), { duration: 0.8, maxZoom: x.props.zoom || 14 });
    }).catch(function () {
      mapa.flyTo(x.layer.getBounds().getCenter(), x.props.zoom || 10, { duration: 0.8 });
    });
  }

  function popupDetalle(p, s) {
    var d = document.createElement('div');
    var t = document.createElement('strong');
    t.textContent = p.nombre || '';
    d.appendChild(t);
    var info = [TIPO_NOMBRE[p.tipo], p.altitud ? p.altitud + ' m' : null].filter(Boolean).join(' · ');
    if (info) { d.appendChild(document.createElement('br')); d.appendChild(document.createTextNode(info)); }
    if (p.nota) { var n = document.createElement('p'); n.style.margin = '6px 0 0'; n.textContent = p.nota; d.appendChild(n); }
    return d;
  }

  // ---------- Panel en el celular ----------
  elToggle.addEventListener('click', function () {
    var abierto = elPanel.classList.toggle('abierto');
    elToggle.setAttribute('aria-expanded', String(abierto));
  });
})();
