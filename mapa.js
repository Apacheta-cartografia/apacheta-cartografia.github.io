(function () {
  'use strict';

  /* ================= Configuración ================= */
  var C = { tinta: '#16201D', texto: '#3B4440', gris: '#5A625E', linea: '#DCDDD8', acento: '#9A3F1C', claro: '#E3A383' };

  // Fondos gratuitos (todos probados para poder incluirse en el PDF)
  var FONDOS = [
    { id: 'topografico', nombre: 'Topográfico', nota: 'OpenTopoMap', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', nativo: 17, credito: 'OpenTopoMap (CC-BY-SA), SRTM' },
    { id: 'outdoor', nombre: 'Outdoor', nota: 'CyclOSM', url: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', nativo: 18, credito: 'CyclOSM, servido por OpenStreetMap France' },
    { id: 'satelital', nombre: 'Satelital', nota: 'Esri', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', nativo: 18, credito: 'Esri World Imagery (Esri, Maxar, Earthstar Geographics)' },
    { id: 'relieve', nombre: 'Relieve', nota: 'Esri Hillshade', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}', nativo: 13, credito: 'Esri World Hillshade (Esri, USGS, NGA, NASA, CGIAR y otros)' }
  ];
  var FONDO = {}; FONDOS.forEach(function (f) { FONDO[f.id] = f; });

  // Rutas marcadas y deporte (superposiciones transparentes)
  var SUPER = [
    { id: 'senderismo', nombre: 'Senderismo', url: 'https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png', nativo: 17, credito: 'Waymarked Trails (CC BY-SA)' },
    { id: 'ciclismo', nombre: 'Ciclismo', url: 'https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png', nativo: 17, credito: 'Waymarked Trails (CC BY-SA)' },
    { id: 'mtb', nombre: 'Bici de montaña', url: 'https://tile.waymarkedtrails.org/mtb/{z}/{x}/{y}.png', nativo: 17, credito: 'Waymarked Trails (CC BY-SA)' },
    { id: 'nieve', nombre: 'Pistas de nieve', url: 'https://tiles.opensnowmap.org/pistes/{z}/{x}/{y}.png', nativo: 18, credito: 'OpenSnowMap (CC BY-SA)' }
  ];
  var SUPERID = {}; SUPER.forEach(function (s) { SUPERID[s.id] = s; });

  // Capas de OpenStreetMap
  var CAPAS = [
    { id: 'caminos',     nombre: 'Caminos y rutas',   tipo: 'linea', color: '#F2C14E', ancho: 0.55, on: false },
    { id: 'senderos',    nombre: 'Senderos',          tipo: 'linea', color: '#F08A5D', ancho: 0.42, guion: [1.4, 0.9], on: false },
    { id: 'rios',        nombre: 'Ríos, arroyos y canales', tipo: 'linea', color: '#5AB0E6', ancho: 0.42, on: false },
    { id: 'agua',        nombre: 'Lagunas y lagos',   tipo: 'area',  color: '#5AB0E6', on: false },
    { id: 'cumbres',     nombre: 'Cumbres',           tipo: 'punto', simbolo: 'triangulo', color: C.acento, on: false },
    { id: 'refugios',    nombre: 'Refugios',          tipo: 'punto', simbolo: 'casa', color: '#6B4E9B', on: false },
    { id: 'localidades', nombre: 'Localidades',       tipo: 'punto', simbolo: 'circulo', color: C.tinta, on: false },
    { id: 'interes',     nombre: 'Puntos de interés', tipo: 'punto', simbolo: 'rombo', color: '#2E7D6B', on: false }
  ];
  var CAPA = {}; CAPAS.forEach(function (c) { CAPA[c.id] = c; });

  // Elementos dibujados por la persona
  var PROPIOS = {
    punto: { nombre: 'Puntos propios', tipo: 'punto', simbolo: 'propio', color: C.acento, icono: '●' },
    linea: { nombre: 'Recorridos propios', tipo: 'linea-propia', color: C.acento, ancho: 0.7, icono: '╱' },
    poligono: { nombre: 'Áreas propias', tipo: 'area-propia', color: C.acento, icono: '▱' }
  };

  var HOJAS = { a4: { w: 210, h: 297 }, a3: { w: 297, h: 420 } };
  var DPI = 200, PPM = DPI / 25.4;
  var ZOOM_MIN_DATOS = 10, MAX_PROPIOS = 30;

  /* ================= Estado ================= */
  var estado = { fondo: 'topografico', datos: null, claveDatos: '', propios: [], pdf: null };
  var dib = { modo: null, verts: [] };
  var $ = function (id) { return document.getElementById(id); };
  var medidor = document.createElement('canvas').getContext('2d');
  var K = 3;                                   // píxeles de pantalla por milímetro de hoja
  var px = function (v) { return (v * K) + 'px'; };

  /* ================= Mapa ================= */
  var map = L.map('mapa', { zoomControl: true, attributionControl: false, maxZoom: 18, preferCanvas: true }).setView([-32.98, -69.24], 12);
  var capaFondo = {};
  FONDOS.forEach(function (f) {
    capaFondo[f.id] = L.tileLayer(f.url, { maxZoom: 18, maxNativeZoom: f.nativo, subdomains: 'abc', crossOrigin: 'anonymous' });
  });
  var capaSuper = {};
  SUPER.forEach(function (s) {
    capaSuper[s.id] = L.tileLayer(s.url, { maxZoom: 18, maxNativeZoom: s.nativo, crossOrigin: 'anonymous', zIndex: 5 });
  });
  capaFondo[estado.fondo].addTo(map);
  var grupoDatos = L.layerGroup().addTo(map);
  var grupoPropios = L.layerGroup().addTo(map);
  var grupoTemp = L.layerGroup().addTo(map);
  var aviso = document.createElement('div'); aviso.className = 'aviso-marco'; aviso.hidden = true;
  $('mapa').appendChild(aviso);

  function nodoTexto(t) { var s = document.createElement('span'); s.textContent = t; return s; }

  /* ================= Hoja ================= */
  function hoja() {
    var f = HOJAS[$('tamano').value], vertical = $('orientacion').value === 'vertical';
    var W = vertical ? f.w : f.h, H = vertical ? f.h : f.w;
    var m = 10, cab = 21, pie = 34;
    var mapa = { x: m, y: m + cab, w: W - 2 * m, h: H - 2 * m - cab - pie };
    return { W: W, H: H, m: m, mapa: mapa, py: mapa.y + mapa.h + 5 };
  }

  function tamTexto(texto, peso, familia, inicial, minimo, anchoMm) {
    var t = inicial;
    medidor.font = peso + ' ' + (t * 10) + 'px ' + familia;
    while (medidor.measureText(texto).width / 10 > anchoMm && t > minimo) { t -= .1; medidor.font = peso + ' ' + (t * 10) + 'px ' + familia; }
    return t;
  }
  function tamTitulo(h, titulo) { return tamTexto(titulo, '700', 'Inter', 7.2, 4, h.W - 2 * h.m - 54); }

  function textoCreditos() {
    var partes = ['Datos: © colaboradores de OpenStreetMap (ODbL), vía OpenFreeMap © OpenMapTiles', 'Fondo: ' + FONDO[estado.fondo].credito];
    var sup = superElegidas().map(function (id) { return SUPERID[id].credito; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
    if (sup.length) partes.push('Rutas: ' + sup.join(', '));
    partes.push('Web Mercator · Información orientativa: verificala antes de salir');
    partes.push('Apacheta Cartografía · ' + new Date().toLocaleDateString('es-AR'));
    return partes.join(' · ');
  }

  function escala(h) {
    var lat = map.getCenter().lat, z = map.getZoom(), anchoPx = map.getSize().x || 1;
    var mPorPx = 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, z);
    var mPorMm = mPorPx * anchoPx / h.mapa.w;
    var largoM = escalaLinda(mPorMm * 36), largoMm = largoM / mPorMm;
    var den = mPorMm * 1000, red = escalaLinda(den) / 10;
    return { mPorMm: mPorMm, largoM: largoM, largoMm: largoMm, den: Math.round(den / red) * red };
  }
  function escalaLinda(v) {
    var p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p;
    return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * p;
  }
  function textoDistancia(m) { return m >= 1000 ? (m / 1000).toLocaleString('es-AR') + ' km' : m + ' m'; }

  function itemsLeyenda() {
    var it = [], d = estado.datos, el = capasElegidas();
    CAPAS.forEach(function (c) { if (el.indexOf(c.id) >= 0 && d && d[c.id] && d[c.id].length) it.push(c); });
    superElegidas().forEach(function (id) { it.push({ nombre: SUPERID[id].nombre, tipo: 'super' }); });
    ['punto', 'linea', 'poligono'].forEach(function (t) {
      if (estado.propios.some(function (p) { return p.tipo === t; })) it.push(PROPIOS[t]);
    });
    return it;
  }
  var LEY = { filas: 5, alto: 4.2, ancho: function (h) { return h.W - 2 * h.m - 72; } };
  function colLeyenda(h, n) { return Math.max(38, LEY.ancho(h) / Math.max(1, Math.ceil(n / LEY.filas))); }

  // Posiciona todo dentro de la hoja en vivo (1em = 1 mm)
  function maquetar() {
    var h = hoja(), wrap = $('mapa-wrap'), pad = 22;
    var k = Math.min((wrap.clientWidth - 2 * pad) / h.W, (wrap.clientHeight - 2 * pad) / h.H);
    k = Math.max(k, .8); K = k;
    var hj = $('hoja');
    hj.style.fontSize = k + 'px';
    hj.style.width = h.W + 'em'; hj.style.height = h.H + 'em';
    function pos(id, x, y, w, alto) {
      var e = $(id); e.style.left = px(x); e.style.top = px(y);
      if (w !== undefined) e.style.width = px(w);
      if (alto !== undefined) e.style.height = px(alto);
    }
    pos('h-titulo', h.m, h.m + 1.8);
    pos('h-sub', h.m, h.m + 12.3, h.W - 2 * h.m - 54);
    pos('h-marca', h.W - h.m - 52, h.m + 4.3, 52);
    pos('h-regla', h.m, h.m + 18.25, h.W - 2 * h.m);
    var mp = $('mapa'); mp.style.left = px(h.mapa.x); mp.style.top = px(h.mapa.y); mp.style.width = px(h.mapa.w); mp.style.height = px(h.mapa.h);
    mp.style.outlineWidth = px(.4);
    $('ma-centro').style.fontSize = px(Math.min(h.mapa.w, h.mapa.h) * .045);
    var me = $('ma-esquina'); me.style.fontSize = px(3); me.style.right = px(4); me.style.bottom = px(3.4);
    pos('h-rot-ley', h.m, h.py + .4);
    pos('h-ley', h.m, h.py + 4.4, LEY.ancho(h) + 30, 22);
    pos('h-linea-cred', h.m, h.H - h.m - 4, h.W - 2 * h.m);
    pos('h-cred', h.m, h.H - h.m - 2.3);
    map.invalidateSize();
    pintar();
  }

  // Actualiza textos, referencias, escala y créditos de la hoja en vivo
  function pintar() {
    var h = hoja();
    var titulo = $('titulo').value.trim() || 'Mi mapa';
    var t = $('h-titulo'); t.textContent = titulo; t.style.fontSize = tamTitulo(h, titulo) + 'em';
    $('h-sub').textContent = $('subtitulo').value.trim();

    // Referencias
    var items = itemsLeyenda(), ley = $('h-ley'), colW = colLeyenda(h, items.length);
    ley.innerHTML = '';
    items.forEach(function (it, i) {
      var col = Math.floor(i / LEY.filas), fil = i % LEY.filas;
      if (col * colW + 30 > LEY.ancho(h) + 30) return;
      var d = document.createElement('div'); d.className = 'item';
      d.style.left = px(col * colW); d.style.top = px(fil * LEY.alto);
      var img = document.createElement('img'); img.alt = ''; img.src = iconoURL(it);
      d.appendChild(img); d.appendChild(nodoTexto(it.nombre));
      ley.appendChild(d);
    });
    if (!items.length) { var v = document.createElement('div'); v.className = 'item'; v.appendChild(nodoTexto('Mapa base sin capas agregadas.')); ley.appendChild(v); }

    // Escala gráfica y norte
    var e = escala(h), ex = h.W - h.m - 18 - e.largoMm, ey = h.py + 8;
    var esc = $('h-esc'); esc.innerHTML = '';
    esc.style.left = px(ex); esc.style.top = px(ey);
    var barra = document.createElement('div'); barra.id = 'h-barra'; barra.style.width = e.largoMm + 'em';
    [C.acento, '#fff', C.tinta, '#fff'].forEach(function (c) { var s = document.createElement('i'); s.style.background = c; barra.appendChild(s); });
    esc.appendChild(barra);
    [0, .5, 1].forEach(function (f) {
      var n = document.createElement('div'); n.className = 'h-num';
      n.style.left = px(e.largoMm * f); n.style.top = px(3.3);
      n.textContent = f ? textoDistancia(Math.round(e.largoM * f)) : '0';
      esc.appendChild(n);
    });
    var rot = $('h-rot-esc'); rot.style.left = px(ex); rot.style.top = px(h.py + .4);
    var txt = $('h-esc-txt'); txt.textContent = 'Escala aproximada 1:' + e.den.toLocaleString('es-AR');
    txt.style.left = px(h.W - h.m - 12); txt.style.top = px(ey + 8.1); txt.style.transform = 'translateX(-100%)';
    var no = $('h-norte'); no.style.left = px(h.W - h.m - 10); no.style.top = px(h.py + 1.3); no.style.width = px(8); no.style.height = px(17);

    // Créditos
    var cred = textoCreditos(), tc = tamTexto(cred, '400', 'Montserrat', 2.1, 1.3, h.W - 2 * h.m);
    var cr = $('h-cred'); cr.textContent = cred; cr.style.fontSize = tc + 'em';
  }

  window.addEventListener('resize', maquetar);
  $('tamano').addEventListener('change', maquetar);
  $('orientacion').addEventListener('change', maquetar);
  $('titulo').addEventListener('input', pintar);
  $('subtitulo').addEventListener('input', pintar);
  map.on('zoomend moveend', pintar);

  /* ================= Símbolos e íconos ================= */
  function simbolo(cx, tipo, x, y, s, color) {
    cx.save(); cx.lineJoin = 'round'; cx.lineWidth = Math.max(1, s * 0.14); cx.strokeStyle = '#fff'; cx.fillStyle = color;
    cx.beginPath();
    if (tipo === 'triangulo') { cx.moveTo(x, y - s * .55); cx.lineTo(x + s * .55, y + s * .42); cx.lineTo(x - s * .55, y + s * .42); cx.closePath(); }
    else if (tipo === 'casa') { var a = s * .42; cx.moveTo(x, y - s * .55); cx.lineTo(x + a, y - s * .12); cx.lineTo(x + a, y + s * .45); cx.lineTo(x - a, y + s * .45); cx.lineTo(x - a, y - s * .12); cx.closePath(); }
    else if (tipo === 'rombo') { cx.moveTo(x, y - s * .5); cx.lineTo(x + s * .42, y); cx.lineTo(x, y + s * .5); cx.lineTo(x - s * .42, y); cx.closePath(); }
    else if (tipo === 'propio') { cx.arc(x, y, s * .45, 0, Math.PI * 2); }
    else { cx.arc(x, y, s * .36, 0, Math.PI * 2); }
    cx.stroke(); cx.fill();
    if (tipo === 'propio') { cx.beginPath(); cx.fillStyle = '#fff'; cx.arc(x, y, s * .15, 0, Math.PI * 2); cx.fill(); }
    cx.restore();
  }

  // Ícono de referencia: (x, y) = borde izquierdo y centro vertical; mm() convierte milímetros a píxeles
  function dibujarIcono(cx, it, x, y, mm) {
    cx.save();
    if (it.tipo === 'linea') {
      cx.lineCap = 'round'; cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x + mm(7), y);
      cx.lineWidth = mm(it.ancho + .45); cx.strokeStyle = C.tinta; cx.stroke();
      if (it.guion) cx.setLineDash([mm(it.guion[0]), mm(it.guion[1])]);
      cx.lineWidth = mm(it.ancho); cx.strokeStyle = it.color; cx.stroke();
    } else if (it.tipo === 'area') {
      cx.fillStyle = 'rgba(90,176,230,.6)'; cx.fillRect(x, y - mm(1.6), mm(7), mm(3.2));
      cx.lineWidth = mm(.2); cx.strokeStyle = '#2F7FB5'; cx.strokeRect(x, y - mm(1.6), mm(7), mm(3.2));
    } else if (it.tipo === 'linea-propia') {
      cx.lineCap = 'round'; cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x + mm(7), y);
      cx.lineWidth = mm(it.ancho + .5); cx.strokeStyle = '#fff'; cx.stroke();
      cx.lineWidth = mm(it.ancho); cx.strokeStyle = it.color; cx.stroke();
    } else if (it.tipo === 'area-propia') {
      cx.fillStyle = 'rgba(154,63,28,.2)'; cx.fillRect(x, y - mm(1.6), mm(7), mm(3.2));
      cx.setLineDash([mm(.9), mm(.6)]); cx.lineWidth = mm(.4); cx.strokeStyle = C.acento; cx.strokeRect(x, y - mm(1.6), mm(7), mm(3.2));
    } else if (it.tipo === 'super') {
      cx.fillStyle = '#EDEEEA'; cx.fillRect(x, y - mm(1.6), mm(7), mm(3.2));
      cx.beginPath(); cx.rect(x, y - mm(1.6), mm(7), mm(3.2)); cx.clip();
      cx.strokeStyle = C.gris; cx.lineWidth = mm(.3);
      for (var i = -3; i < 8; i += 1.4) { cx.beginPath(); cx.moveTo(x + mm(i), y + mm(1.6)); cx.lineTo(x + mm(i + 3.2), y - mm(1.6)); cx.stroke(); }
    } else {
      simbolo(cx, it.simbolo, x + mm(3.5), y, mm(3.4), it.color);
    }
    cx.restore();
  }
  var cacheIconos = {};
  function iconoURL(it) {
    var clave = it.nombre + it.tipo;
    if (cacheIconos[clave]) return cacheIconos[clave];
    var f = 6, cv = document.createElement('canvas'); cv.width = 7.6 * f; cv.height = 5 * f;
    dibujarIcono(cv.getContext('2d'), it, .3 * f, 2.5 * f, function (v) { return v * f; });
    return (cacheIconos[clave] = cv.toDataURL());
  }

  /* ================= Fondo y superposiciones ================= */
  FONDOS.forEach(function (f) {
    var l = document.createElement('label');
    l.innerHTML = '<input type="radio" name="fondo" value="' + f.id + '"' + (f.id === estado.fondo ? ' checked' : '') + '><span>' + f.nombre + '<small>' + f.nota + '</small></span>';
    $('fondos').appendChild(l);
  });
  $('fondos').addEventListener('change', function (e) {
    map.removeLayer(capaFondo[estado.fondo]);
    estado.fondo = e.target.value;
    capaFondo[estado.fondo].addTo(map).bringToBack();
    pintar();
  });

  SUPER.forEach(function (s) {
    var l = document.createElement('label');
    l.innerHTML = '<input type="checkbox" value="' + s.id + '"><img class="muestra" alt="" src="' + iconoURL({ nombre: s.nombre, tipo: 'super' }) + '"><span>' + s.nombre + '</span>';
    $('superposiciones').appendChild(l);
  });
  function superElegidas() {
    return Array.prototype.slice.call(document.querySelectorAll('#superposiciones input:checked')).map(function (i) { return i.value; });
  }
  $('superposiciones').addEventListener('change', function (e) {
    var c = capaSuper[e.target.value];
    if (e.target.checked) c.addTo(map); else map.removeLayer(c);
    pintar();
  });

  /* ================= Capas de OpenStreetMap ================= */
  CAPAS.forEach(function (c) {
    var l = document.createElement('label');
    l.innerHTML = '<input type="checkbox" value="' + c.id + '"' + (c.on ? ' checked' : '') + '><img class="muestra" alt="" src="' + iconoURL(c) + '"><span>' + c.nombre + '</span>';
    $('capas').appendChild(l);
  });
  function capasElegidas() {
    return Array.prototype.slice.call(document.querySelectorAll('#capas input:checked')).map(function (i) { return i.value; });
  }
  $('capas').addEventListener('change', function () { dibujarDatos(); pintar(); clearTimeout(temporizador); cargar().catch(function () {}); });

  // Lector mínimo de teselas vectoriales (Mapbox Vector Tile / protobuf)
  function leerMVT(buf, capasQueremos) {
    var b = new Uint8Array(buf), dec = new TextDecoder('utf-8'), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    var p = 0;
    function varint() { var r = 0, m = 1, c; do { c = b[p++]; r += (c & 127) * m; m *= 128; } while (c & 128); return r; }
    function saltar(t) { if (t === 0) varint(); else if (t === 1) p += 8; else if (t === 2) { var l = varint(); p += l; } else if (t === 5) p += 4; }
    function valor(fin) {
      var v = null;
      while (p < fin) {
        var k = varint(), f = k >> 3, t = k & 7;
        if (f === 1) { var l = varint(); v = dec.decode(b.subarray(p, p + l)); p += l; }
        else if (f === 2) { v = dv.getFloat32(p, true); p += 4; }
        else if (f === 3) { v = dv.getFloat64(p, true); p += 8; }
        else if (f === 4 || f === 5) v = varint();
        else if (f === 6) { var n = varint(); v = (n % 2) ? -(n + 1) / 2 : n / 2; }
        else if (f === 7) v = !!varint();
        else saltar(t);
      }
      return v;
    }
    var salida = {};
    while (p < b.length) {
      var k = varint();
      if ((k >> 3) !== 3 || (k & 7) !== 2) { saltar(k & 7); continue; }
      var largo = varint(), finCapa = p + largo;
      var nombre = '', claves = [], valores = [], extent = 4096, crudos = [];
      while (p < finCapa) {
        var kk = varint(), f = kk >> 3, t = kk & 7;
        if (f === 1) { var l1 = varint(); nombre = dec.decode(b.subarray(p, p + l1)); p += l1; }
        else if (f === 2) { var l2 = varint(); crudos.push([p, p + l2]); p += l2; }
        else if (f === 3) { var l3 = varint(); claves.push(dec.decode(b.subarray(p, p + l3))); p += l3; }
        else if (f === 4) { var l4 = varint(), fin4 = p + l4; valores.push(valor(fin4)); p = fin4; }
        else if (f === 5) extent = varint();
        else saltar(t);
      }
      if (capasQueremos && capasQueremos.indexOf(nombre) < 0) continue;
      var feats = [];
      crudos.forEach(function (rg) {
        var q = p; p = rg[0];
        var tags = [], tipo = 0, geom = [];
        while (p < rg[1]) {
          var kf = varint(), ff = kf >> 3, tf = kf & 7;
          if (ff === 2) { var lt = varint(), ft = p + lt; while (p < ft) tags.push(varint()); }
          else if (ff === 3) tipo = varint();
          else if (ff === 4) { var lg = varint(), fg = p + lg; while (p < fg) geom.push(varint()); }
          else saltar(tf);
        }
        p = q;
        var props = {};
        for (var i = 0; i + 1 < tags.length; i += 2) props[claves[tags[i]]] = valores[tags[i + 1]];
        // geometría: comandos MoveTo / LineTo / ClosePath con zigzag
        var anillos = [], actual = null, x = 0, y = 0, j = 0;
        while (j < geom.length) {
          var cmd = geom[j] & 7, cnt = geom[j] >> 3; j++;
          if (cmd === 1 || cmd === 2) {
            for (var c = 0; c < cnt; c++) {
              var dx = geom[j++], dy = geom[j++];
              x += (dx >>> 1) ^ -(dx & 1); y += (dy >>> 1) ^ -(dy & 1);
              if (cmd === 1) { actual = []; anillos.push(actual); }
              actual.push([x, y]);
            }
          } else if (cmd === 7 && actual && actual.length) { actual.push(actual[0].slice()); }
        }
        feats.push({ tipo: tipo, props: props, anillos: anillos });
      });
      salida[nombre] = { extent: extent, features: feats };
    }
    return salida;
  }

  /* Capas de OpenStreetMap servidas como teselas vectoriales por OpenFreeMap (esquema OpenMapTiles) */
  var CAPA_MVT = { caminos: 'transportation', senderos: 'transportation', rios: 'waterway', agua: 'water', cumbres: 'mountain_peak', localidades: 'place', refugios: 'poi', interes: 'poi' };
  var cacheTeselas = {}, plantillaOFM = null;
  function urlOFM() {
    if (!plantillaOFM) plantillaOFM = fetch('https://tiles.openfreemap.org/planet')
      .then(function (r) { return r.json(); })
      .then(function (j) { return j.tiles[0]; })
      .catch(function (e) { plantillaOFM = null; throw e; });
    return plantillaOFM;
  }
  function teselaVector(z, x, y) {
    var k = z + '/' + x + '/' + y;
    if (!cacheTeselas[k]) {
      cacheTeselas[k] = urlOFM().then(function (u) {
        return fetch(u.replace('{z}', z).replace('{x}', x).replace('{y}', y));
      }).then(function (r) {
        if (r.status === 204 || r.status === 404) return null;
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.arrayBuffer();
      }).then(function (buf) {
        return { z: z, x: x, y: y, buf: buf };
      }).catch(function (e) { delete cacheTeselas[k]; throw e; });
    }
    return cacheTeselas[k];
  }

  // Recorta un anillo al cuadrado de la tesela (Sutherland-Hodgman) para evitar costuras
  function recortar(anillo, E) {
    var bordes = [
      function (q) { return q[0] >= 0; }, function (q) { return q[0] <= E; },
      function (q) { return q[1] >= 0; }, function (q) { return q[1] <= E; }
    ];
    var corte = [
      function (a, b) { var t = (0 - a[0]) / (b[0] - a[0]); return [0, a[1] + t * (b[1] - a[1])]; },
      function (a, b) { var t = (E - a[0]) / (b[0] - a[0]); return [E, a[1] + t * (b[1] - a[1])]; },
      function (a, b) { var t = (0 - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), 0]; },
      function (a, b) { var t = (E - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), E]; }
    ];
    var salida = anillo;
    for (var i = 0; i < 4 && salida.length; i++) {
      var entrada = salida; salida = [];
      for (var j = 0; j < entrada.length; j++) {
        var a = entrada[j], b = entrada[(j + 1) % entrada.length];
        var ain = bordes[i](a), bin = bordes[i](b);
        if (ain && bin) salida.push(b);
        else if (ain && !bin) salida.push(corte[i](a, b));
        else if (!ain && bin) { salida.push(corte[i](a, b)); salida.push(b); }
      }
    }
    return salida;
  }

  function nombreDe(pr) { return pr['name:es'] || pr.name || pr['name:latin'] || ''; }

  function procesarTeselas(lista, zoomMapa, elegidas) {
    var d = {}; CAPAS.forEach(function (c) { d[c.id] = []; });
    var quiero = function (id) { return elegidas.indexOf(id) >= 0; };
    var mvt = elegidas.map(function (id) { return CAPA_MVT[id]; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
    var vistos = {};
    var CAMINOS = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'track'];
    if (zoomMapa >= 13) CAMINOS.push('minor');
    lista.forEach(function (tt) {
      if (!tt || !tt.buf) return;
      var t = { z: tt.z, x: tt.x, y: tt.y, d: leerMVT(tt.buf, mvt) };
      var n = Math.pow(2, t.z);
      function aLatLng(E) {
        return function (q) {
          var lon = (t.x + q[0] / E) / n * 360 - 180;
          var m = Math.PI - 2 * Math.PI * (t.y + q[1] / E) / n;
          return [Math.atan(Math.sinh(m)) * 180 / Math.PI, lon];
        };
      }
      function puntos(capa, fn) {
        var c = t.d[capa]; if (!c) return;
        var E = c.extent, conv = aLatLng(E);
        c.features.forEach(function (f) {
          if (f.tipo !== 1 || !f.anillos.length) return;
          var q = f.anillos[0][0];
          if (q[0] < 0 || q[0] > E || q[1] < 0 || q[1] > E) return;
          fn(f.props, conv(q));
        });
      }
      function lineas(capa, fn) {
        var c = t.d[capa]; if (!c) return;
        var conv = aLatLng(c.extent);
        c.features.forEach(function (f) {
          if (f.tipo !== 2) return;
          var id = fn(f.props); if (!id || !quiero(id)) return;
          f.anillos.forEach(function (a) { if (a.length > 1) d[id].push({ coords: a.map(conv) }); });
        });
      }
      lineas('transportation', function (pr) {
        if (pr.class === 'path') return 'senderos';
        return CAMINOS.indexOf(pr.class) >= 0 ? 'caminos' : null;
      });
      lineas('waterway', function (pr) { return /^(river|stream|canal)$/.test(pr.class) ? 'rios' : null; });
      var agua = quiero('agua') && t.d.water;
      if (agua) {
        var E = agua.extent, conv = aLatLng(E);
        agua.features.forEach(function (f) {
          if (f.tipo !== 3 || pr_oceano(f.props)) return;
          var anillos = f.anillos.map(function (a) { return recortar(a, E); }).filter(function (a) { return a.length > 2; });
          if (anillos.length) d.agua.push({ anillos: anillos.map(function (a) { return a.map(conv); }) });
        });
      }
      function agregarPunto(id, pr, ll, extra) {
        if (!quiero(id)) return;
        var nombre = nombreDe(pr), k = id + nombre + ll[0].toFixed(4) + ll[1].toFixed(4);
        if (vistos[k]) return; vistos[k] = 1;
        var o = { lat: ll[0], lon: ll[1], nombre: nombre, ele: null, rango: '' };
        for (var e in extra) o[e] = extra[e];
        d[id].push(o);
      }
      puntos('mountain_peak', function (pr, ll) {
        if (pr.class !== 'peak' && pr.class !== 'volcano') return;
        var ele = parseFloat(pr.ele);
        agregarPunto('cumbres', pr, ll, { ele: isFinite(ele) ? Math.round(ele) : null });
      });
      puntos('place', function (pr, ll) {
        if (/^(city|town|village|hamlet)$/.test(pr.class)) agregarPunto('localidades', pr, ll, { rango: pr.class });
      });
      puntos('poi', function (pr, ll) {
        var sc = pr.subclass || '', cl = pr.class || '';
        if (/^(alpine_hut|wilderness_hut|shelter)$/.test(sc) || cl === 'shelter') agregarPunto('refugios', pr, ll, {});
        else if (/^(viewpoint|camp_site|attraction|spring)$/.test(sc) || cl === 'campsite' || cl === 'attraction') agregarPunto('interes', pr, ll, {});
      });
    });
    return d;
  }
  function pr_oceano(pr) { return pr.class === 'ocean'; }

  function teselasVista(zt) {
    var b = map.getBounds();
    var nw = map.project(b.getNorthWest(), zt).divideBy(256).floor();
    var se = map.project(b.getSouthEast(), zt).divideBy(256).floor();
    var n = Math.pow(2, zt), lista = [];
    for (var x = nw.x; x <= se.x; x++) for (var y = Math.max(0, nw.y); y <= Math.min(n - 1, se.y); y++) lista.push([zt, ((x % n) + n) % n, y]);
    return lista;
  }

  var temporizador = null, turno = 0;
  function cargarPronto() { clearTimeout(temporizador); temporizador = setTimeout(function () { cargar().catch(function () {}); }, 400); }
  map.on('moveend', cargarPronto);

  function cargar(forzar) {
    var z = map.getZoom(), capas = capasElegidas();
    if (!capas.length) {
      turno++; estado.datos = null; estado.claveDatos = ''; dibujarDatos(); pintar();
      $('estado-capas').textContent = 'Activá las capas que quieras: se cargan de a una y solo para la zona que ves.';
      return Promise.resolve();
    }
    if (z < ZOOM_MIN_DATOS) {
      estado.datos = null; estado.claveDatos = ''; dibujarDatos(); pintar();
      $('estado-capas').textContent = 'Acercá el mapa para cargar las capas.';
      return Promise.resolve();
    }
    var zt = Math.min(14, Math.floor(z) + 1), lista = teselasVista(zt);
    while (lista.length > 64 && zt > ZOOM_MIN_DATOS) { zt--; lista = teselasVista(zt); }
    var clave = capas.join(',') + '|' + z + '|' + lista.map(function (t) { return t.join('/'); }).join(',');
    if (!forzar && clave === estado.claveDatos) return Promise.resolve();
    var mio = ++turno;
    var nombres = capas.map(function (id) { return CAPA[id].nombre.toLowerCase(); });
    $('estado-capas').textContent = 'Cargando ' + nombres.join(', ') + '…';
    return Promise.all(lista.map(function (t) {
      return teselaVector(t[0], t[1], t[2]).catch(function () { return null; });
    })).then(function (res) {
      if (mio !== turno) return;
      var fallas = res.filter(function (r) { return !r; }).length;
      if (fallas === res.length) throw new Error('sin datos');
      estado.datos = procesarTeselas(res, z, capas); estado.claveDatos = fallas ? '' : clave;
      var n = 0; Object.keys(estado.datos).forEach(function (k) { n += estado.datos[k].length; });
      $('estado-capas').textContent = (n ? n + ' elementos de OpenStreetMap listos.' : 'No hay elementos en esta zona.') + (fallas ? ' Faltaron ' + fallas + ' partes; mové un poco el mapa para reintentar.' : '');
      dibujarDatos(); pintar();
    }).catch(function (err) {
      if (mio !== turno) return;
      $('estado-capas').textContent = 'No se pudieron cargar los datos. Revisá la conexión y probá de nuevo.';
      throw err;
    });
  }

  function etiqueta(id, p) {
    if (id === 'cumbres') return (p.nombre || '') + (p.ele ? (p.nombre ? ' ' : '') + p.ele.toLocaleString('es-AR') + ' m' : '');
    return p.nombre;
  }

  function dibujarDatos() {
    grupoDatos.clearLayers();
    var d = estado.datos; if (!d) return;
    var el = capasElegidas();
    ['agua', 'rios', 'caminos', 'senderos'].forEach(function (id) {
      if (el.indexOf(id) < 0) return;
      var c = CAPA[id];
      d[id].forEach(function (f) {
        if (c.tipo === 'area') {
          L.polygon(f.anillos, { stroke: false, fillColor: c.color, fillOpacity: .6, interactive: false }).addTo(grupoDatos);
        } else {
          L.polyline(f.coords, { color: C.tinta, weight: 4.5, opacity: .8, interactive: false }).addTo(grupoDatos);
          L.polyline(f.coords, { color: c.color, weight: 2.6, dashArray: c.guion ? '6 5' : null, interactive: false }).addTo(grupoDatos);
        }
      });
    });
    ['localidades', 'cumbres', 'refugios', 'interes'].forEach(function (id) {
      if (el.indexOf(id) < 0) return;
      var c = CAPA[id];
      d[id].forEach(function (p) {
        var mk = L.circleMarker([p.lat, p.lon], { radius: 4.5, color: '#fff', weight: 1.5, fillColor: c.color, fillOpacity: 1 }).addTo(grupoDatos);
        var et = etiqueta(id, p);
        if (et) mk.bindTooltip(nodoTexto(et), { direction: 'right', offset: [6, 0], className: 'etq' });
      });
    });
  }

  /* ================= Dibujo propio: puntos, líneas y áreas ================= */
  var botonesModo = document.querySelectorAll('[data-modo]');
  function actualizarHerramientas() {
    botonesModo.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.modo === dib.modo)); });
    var multi = dib.modo === 'linea' || dib.modo === 'poligono';
    $('barra-dibujo').hidden = !multi;
    $('mapa').classList.toggle('dibujando', !!dib.modo);
    var textos = {
      punto: 'Tocá el lugar del punto',
      linea: dib.verts.length ? 'Seguí marcando vértices · ' + dib.verts.length + ' marcados' : 'Tocá el inicio de la línea',
      poligono: dib.verts.length ? 'Seguí marcando el borde · ' + dib.verts.length + ' vértices' : 'Tocá el primer vértice del área'
    };
    aviso.textContent = textos[dib.modo] || ''; aviso.hidden = !dib.modo;
  }
  botonesModo.forEach(function (b) {
    b.addEventListener('click', function () {
      var modo = b.dataset.modo === dib.modo ? null : b.dataset.modo;
      cancelarDibujo(); dib.modo = modo;
      if (modo) map.doubleClickZoom.disable();
      actualizarHerramientas();
    });
  });
  function cancelarDibujo() { dib.modo = null; dib.verts = []; grupoTemp.clearLayers(); map.doubleClickZoom.enable(); actualizarHerramientas(); }
  function dibujarTemp() {
    grupoTemp.clearLayers();
    if (!dib.verts.length) return;
    if (dib.modo === 'poligono' && dib.verts.length > 2) L.polygon(dib.verts, { color: C.acento, weight: 2, dashArray: '5 4', fillOpacity: .15, interactive: false }).addTo(grupoTemp);
    else L.polyline(dib.verts, { color: C.acento, weight: 3, dashArray: '5 4', interactive: false }).addTo(grupoTemp);
    dib.verts.forEach(function (v) { L.circleMarker(v, { radius: 4, color: '#fff', weight: 1.5, fillColor: C.acento, fillOpacity: 1, interactive: false }).addTo(grupoTemp); });
  }
  function sinRepetidos(verts) {
    var out = [];
    verts.forEach(function (v) {
      if (!out.length) { out.push(v); return; }
      var a = map.latLngToContainerPoint(out[out.length - 1]), b = map.latLngToContainerPoint(v);
      if (a.distanceTo(b) > 5) out.push(v);
    });
    return out;
  }
  function terminarDibujo() {
    var v = sinRepetidos(dib.verts), modo = dib.modo;
    if ((modo === 'linea' && v.length < 2) || (modo === 'poligono' && v.length < 3)) {
      $('ayuda-dibujo').textContent = modo === 'linea' ? 'Una línea necesita al menos 2 puntos.' : 'Un área necesita al menos 3 vértices.';
      return;
    }
    agregarPropio(modo, v);
    cancelarDibujo();
  }
  map.on('click', function (e) {
    if (!dib.modo) return;
    var ll = [e.latlng.lat, e.latlng.lng];
    if (dib.modo === 'punto') { agregarPropio('punto', [ll]); cancelarDibujo(); return; }
    dib.verts.push(ll); dibujarTemp(); actualizarHerramientas();
  });
  map.on('dblclick', function () { if (dib.modo === 'linea' || dib.modo === 'poligono') terminarDibujo(); });
  $('dib-terminar').addEventListener('click', terminarDibujo);
  $('dib-deshacer').addEventListener('click', function () { dib.verts.pop(); dibujarTemp(); actualizarHerramientas(); });
  $('dib-cancelar').addEventListener('click', cancelarDibujo);
  document.addEventListener('keydown', function (e) {
    if (!dib.modo || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (e.key === 'Escape') cancelarDibujo();
    if (e.key === 'Enter') terminarDibujo();
  });

  function agregarPropio(tipo, coords) {
    if (estado.propios.length >= MAX_PROPIOS) { $('ayuda-dibujo').textContent = 'Llegaste al máximo de ' + MAX_PROPIOS + ' elementos.'; return; }
    var n = estado.propios.filter(function (p) { return p.tipo === tipo; }).length + 1;
    var base = { punto: 'Punto', linea: 'Recorrido', poligono: 'Área' }[tipo];
    estado.propios.push({ tipo: tipo, coords: coords, nombre: base + ' ' + n });
    dibujarPropios(); listarPropios(); pintar();
    var ins = document.querySelectorAll('#lista-propios input'); if (ins.length) { ins[ins.length - 1].focus(); ins[ins.length - 1].select(); }
  }
  function centroPropio(p) {
    if (p.tipo === 'punto') return p.coords[0];
    if (p.tipo === 'linea') return p.coords[Math.floor((p.coords.length - 1) / 2)];
    var la = 0, lo = 0; p.coords.forEach(function (c) { la += c[0]; lo += c[1]; });
    return [la / p.coords.length, lo / p.coords.length];
  }
  function dibujarPropios() {
    grupoPropios.clearLayers();
    estado.propios.forEach(function (p) {
      var capa;
      if (p.tipo === 'poligono') {
        capa = L.polygon(p.coords, { color: C.acento, weight: 2, dashArray: '6 4', fillColor: C.acento, fillOpacity: .18, interactive: false }).addTo(grupoPropios);
      } else if (p.tipo === 'linea') {
        L.polyline(p.coords, { color: '#fff', weight: 6, opacity: .9, interactive: false }).addTo(grupoPropios);
        capa = L.polyline(p.coords, { color: C.acento, weight: 3.5, interactive: false }).addTo(grupoPropios);
      } else {
        capa = L.circleMarker(p.coords[0], { radius: 7, color: '#fff', weight: 2, fillColor: C.acento, fillOpacity: 1, interactive: false }).addTo(grupoPropios);
      }
      if (p.nombre) {
        L.tooltip({ permanent: true, direction: p.tipo === 'punto' ? 'right' : 'center', offset: p.tipo === 'punto' ? [8, 0] : [0, 0], className: 'etq etq-propia' })
          .setLatLng(centroPropio(p)).setContent(nodoTexto(p.nombre)).addTo(grupoPropios);
      }
    });
  }
  function listarPropios() {
    var ul = $('lista-propios'); ul.innerHTML = '';
    estado.propios.forEach(function (p, i) {
      var li = document.createElement('li');
      var ic = document.createElement('span'); ic.className = 'tipo'; ic.textContent = PROPIOS[p.tipo].icono; ic.setAttribute('aria-hidden', 'true');
      var inp = document.createElement('input'); inp.type = 'text'; inp.value = p.nombre; inp.maxLength = 40; inp.setAttribute('aria-label', 'Nombre del elemento ' + (i + 1));
      inp.addEventListener('input', function () { p.nombre = inp.value; dibujarPropios(); });
      var del = document.createElement('button'); del.type = 'button'; del.textContent = '×'; del.setAttribute('aria-label', 'Quitar ' + (p.nombre || 'elemento'));
      del.addEventListener('click', function () { estado.propios.splice(i, 1); dibujarPropios(); listarPropios(); pintar(); });
      li.appendChild(ic); li.appendChild(inp); li.appendChild(del); ul.appendChild(li);
    });
  }

  /* ================= Búsqueda de lugares (Nominatim) ================= */
  $('buscar-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var q = $('buscar').value.trim(); if (!q) return;
    var ul = $('resultados'); ul.innerHTML = '<li class="ayuda">Buscando…</li>';
    fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=es&q=' + encodeURIComponent(q))
      .then(function (r) { return r.json(); })
      .then(function (res) {
        ul.innerHTML = '';
        if (!res.length) { ul.innerHTML = '<li class="ayuda">No encontré ese lugar. Probá con otro nombre.</li>'; return; }
        res.forEach(function (r) {
          var li = document.createElement('li'), b = document.createElement('button');
          b.type = 'button'; b.textContent = r.display_name;
          b.addEventListener('click', function () {
            var bb = r.boundingbox.map(Number);
            map.fitBounds([[bb[0], bb[2]], [bb[1], bb[3]]], { maxZoom: 14 });
            if (map.getZoom() < 12 && (r.type === 'peak' || r.type === 'volcano' || r.category === 'natural')) map.setZoom(13);
            ul.innerHTML = '';
            if ($('titulo').value === 'Mi mapa') { $('titulo').value = (r.name || r.display_name.split(',')[0]).slice(0, 60); pintar(); }
          });
          li.appendChild(b); ul.appendChild(li);
        });
      })
      .catch(function () { ul.innerHTML = '<li class="ayuda">No se pudo buscar ahora. Probá de nuevo.</li>'; });
  });

  /* ================= Composición del PDF ================= */
  function cargarTesela(url) {
    return new Promise(function (ok) {
      var img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = function () { ok(img); }; img.onerror = function () { ok(null); };
      img.src = url;
    });
  }
  function urlTesela(plantilla, z, x, y) {
    var n = Math.pow(2, z); x = ((x % n) + n) % n;
    return plantilla.replace('{s}', 'abc'[(x + y) % 3]).replace('{z}', z).replace('{x}', x).replace('{y}', y);
  }
  // Dibuja una capa de teselas en el lienzo del mapa (nw: esquina en píxeles del zoom zr)
  function dibujarTeselas(ox, capa, zr, nw, pw, ph) {
    var z = Math.min(zr, capa.nativo), f = Math.pow(2, zr - z), lado = 256 * f;
    var x0 = Math.floor(nw.x / lado), x1 = Math.floor((nw.x + pw - 1) / lado);
    var y0 = Math.floor(nw.y / lado), y1 = Math.floor((nw.y + ph - 1) / lado);
    var tareas = [], fallas = 0;
    for (var tx = x0; tx <= x1; tx++) for (var ty = y0; ty <= y1; ty++) {
      (function (tx, ty) {
        tareas.push(cargarTesela(urlTesela(capa.url, z, tx, ty)).then(function (img) {
          return { img: img, x: tx * lado - nw.x, y: ty * lado - nw.y };
        }));
      })(tx, ty);
    }
    return Promise.all(tareas).then(function (res) {
      ox.imageSmoothingQuality = 'high';
      res.forEach(function (r) { if (r.img) ox.drawImage(r.img, r.x, r.y, lado, lado); else fallas++; });
      return fallas;
    });
  }
  function contarTeselas(capa, zr, nw, pw, ph) {
    var z = Math.min(zr, capa.nativo), lado = 256 * Math.pow(2, zr - z);
    return (Math.floor((nw.x + pw - 1) / lado) - Math.floor(nw.x / lado) + 1) * (Math.floor((nw.y + ph - 1) / lado) - Math.floor(nw.y / lado) + 1);
  }

  function texto(cx, t, x, y, fuente, color, halo) {
    cx.font = fuente;
    if (halo) { cx.lineJoin = 'round'; cx.strokeStyle = halo.color; cx.lineWidth = halo.ancho; cx.strokeText(t, x, y); }
    cx.fillStyle = color; cx.fillText(t, x, y);
  }

  function componer() {
    var h = hoja(), W = Math.round(h.W * PPM), H = Math.round(h.H * PPM);
    var mm = function (v) { return v * PPM; };
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var cx = cv.getContext('2d');
    cx.fillStyle = '#fff'; cx.fillRect(0, 0, W, H);

    var fondo = FONDO[estado.fondo], supers = superElegidas().map(function (id) { return SUPERID[id]; });
    var fx = mm(h.mapa.x), fy = mm(h.mapa.y), fw = mm(h.mapa.w), fh = mm(h.mapa.h);
    var b = map.getBounds(), tam = map.getSize();
    var zr = Math.max(1, Math.min(18, Math.round(map.getZoom() + Math.log2(fw / tam.x))));
    var nw, pw, ph;
    function medir() {
      nw = map.project(b.getNorthWest(), zr); var se = map.project(b.getSouthEast(), zr);
      pw = se.x - nw.x; ph = se.y - nw.y;
    }
    medir();
    while (contarTeselas(fondo, zr, nw, pw, ph) > 300 && zr > 1) { zr--; medir(); }
    var s = fw / pw;

    var off = document.createElement('canvas'); off.width = Math.ceil(pw); off.height = Math.ceil(ph);
    var ox = off.getContext('2d'); ox.fillStyle = '#E3E5E0'; ox.fillRect(0, 0, off.width, off.height);
    var fallas = 0;
    var cadena = dibujarTeselas(ox, fondo, zr, nw, pw, ph).then(function (n) { fallas += n; });
    supers.forEach(function (sp) { cadena = cadena.then(function () { return dibujarTeselas(ox, sp, zr, nw, pw, ph); }).then(function (n) { fallas += n; }); });

    return cadena.then(function () {
      cx.save();
      cx.beginPath(); cx.rect(fx, fy, fw, fh); cx.clip();
      cx.drawImage(off, 0, 0, pw, ph, fx, fy, fw, fh);

      var proy = function (ll) { var p = map.project(ll, zr); return [fx + (p.x - nw.x) * s, fy + (p.y - nw.y) * s]; };
      var trazo = function (coords, cerrar) {
        cx.beginPath();
        coords.forEach(function (ll, i) { var p = proy(ll); if (i) cx.lineTo(p[0], p[1]); else cx.moveTo(p[0], p[1]); });
        if (cerrar) cx.closePath();
      };
      var d = estado.datos, elegidas = capasElegidas();

      // Capas de OSM: áreas y líneas
      if (d) {
        ['agua', 'rios', 'caminos', 'senderos'].forEach(function (id) {
          if (elegidas.indexOf(id) < 0) return;
          var c = CAPA[id];
          d[id].forEach(function (f) {
            if (c.tipo === 'area') {
              cx.beginPath();
              f.anillos.forEach(function (a) { a.forEach(function (ll, i) { var q = proy(ll); if (i) cx.lineTo(q[0], q[1]); else cx.moveTo(q[0], q[1]); }); cx.closePath(); });
              cx.fillStyle = 'rgba(90,176,230,.65)'; cx.fill('evenodd');
            } else {
              trazo(f.coords, false);
              cx.lineCap = 'round'; cx.lineJoin = 'round'; cx.setLineDash([]);
              cx.lineWidth = mm(c.ancho + .45); cx.strokeStyle = 'rgba(22,32,29,.85)'; cx.stroke();
              if (c.guion) cx.setLineDash([mm(c.guion[0]), mm(c.guion[1])]);
              cx.lineWidth = mm(c.ancho); cx.strokeStyle = c.color; cx.stroke();
              cx.setLineDash([]);
            }
          });
        });
      }

      // Elementos propios: áreas y líneas
      estado.propios.forEach(function (p) {
        if (p.tipo === 'poligono') {
          trazo(p.coords, true);
          cx.fillStyle = 'rgba(154,63,28,.2)'; cx.fill();
          cx.setLineDash([mm(1.6), mm(1)]); cx.lineWidth = mm(.45); cx.strokeStyle = C.acento; cx.stroke(); cx.setLineDash([]);
        } else if (p.tipo === 'linea') {
          trazo(p.coords, false);
          cx.lineCap = 'round'; cx.lineJoin = 'round';
          cx.lineWidth = mm(1.2); cx.strokeStyle = 'rgba(255,255,255,.9)'; cx.stroke();
          cx.lineWidth = mm(.7); cx.strokeStyle = C.acento; cx.stroke();
        }
      });

      // Puntos y etiquetas, evitando superposiciones
      var ocupado = [];
      function libre(r) {
        for (var i = 0; i < ocupado.length; i++) { var o = ocupado[i]; if (r[0] < o[2] && r[2] > o[0] && r[1] < o[3] && r[3] > o[1]) return false; }
        return true;
      }
      function adentro(q) { return q[0] >= fx && q[0] <= fx + fw && q[1] >= fy && q[1] <= fy + fh; }
      function rotulo(t, x, y, fuente, color, centrado) {
        cx.font = fuente;
        var ancho = cx.measureText(t).width, alto = parseFloat(fuente.match(/(\d+(\.\d+)?)px/)[1]);
        if (centrado) x -= ancho / 2;
        var r = [x - 2, y - alto, x + ancho + 2, y + alto * .3];
        if (!libre(r)) return;
        ocupado.push(r);
        cx.textAlign = 'left';
        texto(cx, t, x, y, fuente, color, { color: 'rgba(255,255,255,.95)', ancho: mm(.7) });
      }
      function ponerPunto(c, ll, t, fuente, tamMm) {
        var q = proy(ll), sz = mm(tamMm);
        if (!adentro(q)) return;
        simbolo(cx, c.simbolo, q[0], q[1], sz, c.color);
        ocupado.push([q[0] - sz / 2, q[1] - sz / 2, q[0] + sz / 2, q[1] + sz / 2]);
        if (t) { var alto = parseFloat(fuente.match(/(\d+(\.\d+)?)px/)[1]); rotulo(t, q[0] + sz * .7, q[1] + alto * .35, fuente, C.tinta); }
      }

      estado.propios.forEach(function (p) {
        if (p.tipo === 'punto') ponerPunto(PROPIOS.punto, p.coords[0], p.nombre, '700 ' + mm(2.9) + 'px Inter', 4.2);
        else if (p.nombre) { var q = proy(centroPropio(p)); if (adentro(q)) rotulo(p.nombre, q[0], q[1] + mm(1), '700 ' + mm(2.8) + 'px Inter', C.acento, true); }
      });
      if (d) {
        var orden = [
          ['localidades', function (p) { return (p.rango === 'city' || p.rango === 'town' ? '600 ' + mm(3.1) : '600 ' + mm(2.6)) + 'px Inter'; }, 2.6],
          ['cumbres', function () { return '600 ' + mm(2.4) + 'px Montserrat'; }, 3.2],
          ['refugios', function () { return '600 ' + mm(2.3) + 'px Montserrat'; }, 3.2],
          ['interes', function () { return '500 ' + mm(2.2) + 'px Montserrat'; }, 2.8]
        ];
        orden.forEach(function (o) {
          var id = o[0];
          if (elegidas.indexOf(id) < 0 || !d[id].length) return;
          var lista = d[id].slice();
          if (id === 'cumbres') lista.sort(function (a, b) { return (b.ele || 0) - (a.ele || 0); });
          if (id === 'localidades') { var peso = { city: 0, town: 1, village: 2, hamlet: 3 }; lista.sort(function (a, b) { return (peso[a.rango] || 4) - (peso[b.rango] || 4); }); }
          lista.forEach(function (p) { ponerPunto(CAPA[id], [p.lat, p.lon], etiqueta(id, p), o[1](p), o[2]); });
        });
      }

      // Marcas de agua dentro del mapa (no se pueden recortar sin perder parte del mapa)
      cx.save();
      cx.translate(fx + fw * .24, fy + fh * .74); cx.rotate(-20 * Math.PI / 180);
      cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.globalAlpha = .1;
      texto(cx, 'Apacheta Cartografía', 0, 0, '700 ' + mm(Math.min(h.mapa.w, h.mapa.h) * .045) + 'px Inter', '#fff', { color: 'rgba(22,32,29,.9)', ancho: mm(.25) });
      cx.restore();
      cx.save();
      cx.textAlign = 'right'; cx.textBaseline = 'alphabetic'; cx.globalAlpha = .75;
      if ('letterSpacing' in cx) cx.letterSpacing = mm(.36) + 'px';
      texto(cx, 'APACHETA CARTOGRAFÍA', fx + fw - mm(4), fy + fh - mm(4), '700 ' + mm(3) + 'px Inter', '#fff', { color: 'rgba(22,32,29,.45)', ancho: mm(.4) });
      cx.restore();

      cx.restore();

      // Marco del mapa
      cx.lineWidth = mm(.4); cx.strokeStyle = C.tinta; cx.strokeRect(fx, fy, fw, fh);

      // Encabezado
      var titulo = $('titulo').value.trim() || 'Mi mapa', sub = $('subtitulo').value.trim();
      cx.textBaseline = 'alphabetic'; cx.textAlign = 'left';
      texto(cx, titulo, mm(h.m), mm(h.m + 8.5), '700 ' + mm(tamTitulo(h, titulo)) + 'px Inter', C.tinta);
      if (sub) {
        var tsub = sub; cx.font = '400 ' + mm(3.5) + 'px Montserrat';
        while (cx.measureText(tsub).width > mm(h.W - 2 * h.m - 54) && tsub.length > 3) tsub = tsub.slice(0, -2) + '…';
        texto(cx, tsub, mm(h.m), mm(h.m + 15), '400 ' + mm(3.5) + 'px Montserrat', C.texto);
      }
      cx.textAlign = 'right';
      var xr = mm(h.W - h.m);
      cx.font = '500 ' + mm(4.4) + 'px Montserrat';
      var anchoCart = cx.measureText(' Cartografía').width;
      texto(cx, ' Cartografía', xr, mm(h.m + 7.5), '500 ' + mm(4.4) + 'px Montserrat', C.gris);
      texto(cx, 'Apacheta', xr - anchoCart, mm(h.m + 7.5), '700 ' + mm(4.4) + 'px Inter', C.tinta);
      texto(cx, 'Mapa a medida', xr, mm(h.m + 12.5), '500 ' + mm(2.5) + 'px Montserrat', C.acento);
      cx.textAlign = 'left';
      cx.fillStyle = C.acento; cx.fillRect(mm(h.m), mm(h.m + 18), mm(14), mm(.8));
      cx.fillStyle = C.linea; cx.fillRect(mm(h.m + 14), mm(h.m + 18.25), mm(h.W - 2 * h.m - 14), mm(.3));

      // Referencias
      var py = h.py;
      texto(cx, 'REFERENCIAS', mm(h.m), mm(py + 2.5), '700 ' + mm(2.6) + 'px Inter', C.acento);
      var items = itemsLeyenda(), colW = colLeyenda(h, items.length);
      items.forEach(function (it, i) {
        var col = Math.floor(i / LEY.filas), fil = i % LEY.filas;
        if (col * colW + 30 > LEY.ancho(h) + 30) return;
        var x = h.m + col * colW, yc = py + 6.9 + fil * LEY.alto;
        dibujarIcono(cx, it, mm(x + .3), mm(yc), mm);
        texto(cx, it.nombre, mm(x + 9.5), mm(yc + .9), '500 ' + mm(2.5) + 'px Montserrat', C.texto);
      });
      if (!items.length) texto(cx, 'Mapa base sin capas agregadas.', mm(h.m), mm(py + 7.8), '500 ' + mm(2.5) + 'px Montserrat', C.texto);

      // Escala gráfica
      var e = escala(h), ex = h.W - h.m - 18 - e.largoMm, ey = py + 8;
      texto(cx, 'ESCALA', mm(ex), mm(py + 2.5), '700 ' + mm(2.6) + 'px Inter', C.acento);
      [C.acento, '#fff', C.tinta, '#fff'].forEach(function (c, k) {
        cx.fillStyle = c; cx.fillRect(mm(ex + k * e.largoMm / 4), mm(ey), mm(e.largoMm / 4), mm(1.8));
      });
      cx.lineWidth = mm(.25); cx.strokeStyle = C.tinta; cx.strokeRect(mm(ex), mm(ey), mm(e.largoMm), mm(1.8));
      cx.textAlign = 'center';
      [0, .5, 1].forEach(function (f) {
        texto(cx, f ? textoDistancia(Math.round(e.largoM * f)) : '0', mm(ex + e.largoMm * f), mm(ey + 5.2), '500 ' + mm(2.4) + 'px Montserrat', C.texto);
      });
      cx.textAlign = 'right';
      texto(cx, 'Escala aproximada 1:' + e.den.toLocaleString('es-AR'), mm(h.W - h.m - 12), mm(ey + 10), '400 ' + mm(2.4) + 'px Montserrat', C.gris);
      cx.textAlign = 'left';

      // Norte
      var nx = h.W - h.m - 6, ny = py + 3;
      cx.beginPath(); cx.moveTo(mm(nx), mm(ny + 2)); cx.lineTo(mm(nx - 3.2), mm(ny + 15)); cx.lineTo(mm(nx), mm(ny + 12)); cx.closePath();
      cx.fillStyle = C.tinta; cx.fill();
      cx.beginPath(); cx.moveTo(mm(nx), mm(ny + 2)); cx.lineTo(mm(nx + 3.2), mm(ny + 15)); cx.lineTo(mm(nx), mm(ny + 12)); cx.closePath();
      cx.fillStyle = C.acento; cx.fill();
      cx.textAlign = 'center';
      texto(cx, 'N', mm(nx), mm(ny + 1), '700 ' + mm(3.4) + 'px Inter', C.tinta);
      cx.textAlign = 'left';

      // Créditos
      var cred = textoCreditos(), tc = tamTexto(cred, '400', 'Montserrat', 2.1, 1.3, h.W - 2 * h.m);
      cx.fillStyle = C.linea; cx.fillRect(mm(h.m), mm(h.H - h.m - 4), mm(h.W - 2 * h.m), mm(.25));
      texto(cx, cred, mm(h.m), mm(h.H - h.m - .6), '400 ' + mm(tc) + 'px Montserrat', C.gris);

      return { canvas: cv, hoja: h, fallas: fallas, escala: e.den };
    });
  }

  /* ================= Generar y descargar ================= */
  function nombreArchivo() {
    var t = ($('titulo').value || 'mapa').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return 'apacheta-' + (t || 'mapa') + '.pdf';
  }

  $('generar').addEventListener('click', function () {
    var btn = $('generar'); btn.disabled = true;
    clearTimeout(temporizador);
    if (dib.modo) terminarDibujo();
    $('estado-gen').textContent = 'Preparando los datos…';
    var fuentes = Promise.all(['700 40px Inter', '600 40px Inter', '500 40px Montserrat', '600 40px Montserrat', '400 40px Montserrat']
      .map(function (f) { return document.fonts.load(f); }));
    fuentes.then(function () { return cargar(false).catch(function () {}); })
      .then(function () { $('estado-gen').textContent = 'Armando la hoja en alta resolución…'; return componer(); })
      .then(function (r) {
        estado.pdf = r;
        $('vista-img').src = r.canvas.toDataURL('image/jpeg', 0.85);
        $('vista-info').textContent = $('tamano').value.toUpperCase() + ' ' + $('orientacion').value + ' · 1:' + r.escala.toLocaleString('es-AR');
        $('vista').hidden = false; $('descargar').focus();
        var sinCapas = capasElegidas().length && !estado.datos && map.getZoom() >= ZOOM_MIN_DATOS;
        var avisos = [];
        if (sinCapas) avisos.push('Salió sin capas de OpenStreetMap porque no se pudieron descargar; revisá la conexión y probá de nuevo.');
        if (r.fallas) avisos.push('Algunas partes del fondo no cargaron; podés volver a preparar el PDF.');
        $('estado-gen').textContent = avisos.join(' ');
        if (sinCapas) $('vista-info').textContent += ' · sin capas de OSM';
      })
      .catch(function (e) {
        console.error(e);
        $('estado-gen').textContent = 'No se pudo preparar el PDF. Probá de nuevo.';
      })
      .then(function () { btn.disabled = false; });
  });

  $('descargar').addEventListener('click', function () {
    var r = estado.pdf; if (!r) return;
    var jsPDF = window.jspdf.jsPDF, h = r.hoja;
    var doc = new jsPDF({ orientation: h.W > h.H ? 'landscape' : 'portrait', unit: 'mm', format: $('tamano').value });
    doc.setProperties({ title: $('titulo').value || 'Mapa', creator: 'Apacheta Cartografía' });
    doc.addImage(r.canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, h.W, h.H);
    doc.save(nombreArchivo());
  });
  $('volver').addEventListener('click', function () { $('vista').hidden = true; $('generar').focus(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('vista').hidden) $('vista').hidden = true; });

  /* ================= Inicio ================= */
  maquetar();
  document.fonts.ready.then(pintar);
  cargarPronto();
})();
