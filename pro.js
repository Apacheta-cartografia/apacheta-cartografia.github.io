/* Armá tu mapa Pro: escala exacta, grilla UTM, track GPX/KML con perfil, sin marca de agua.
   Se habilita con un código (pack de 5 mapas) que valida el servicio apacheta-pro en Cloudflare. */
(function () {
  'use strict';
  var API = 'https://apacheta-pro.apacheta-cartografia.workers.dev';
  var CLAVE = 'apacheta-pro-codigo';
  var C = { tinta: '#16201D', texto: '#3B4440', gris: '#5A625E', acento: '#9A3F1C' };
  var HOJAS = { a4: { w: 210, h: 297 }, a3: { w: 297, h: 420 } };
  var PPM = 200 / 25.4;
  var map = window.APACHETA_MAP;
  var $ = function (id) { return document.getElementById(id); };
  var pro = { codigo: '', restantes: 0, ok: false, escala: 0, grilla: 'utm', track: null, capaTrack: null, capaGrilla: null };

  /* ---------- Código ---------- */
  function mostrarCodigo(msg, bien) {
    $('pro-estado').textContent = msg;
    $('pro-estado').style.color = bien ? '#2E7D6B' : C.acento;
  }
  function consultar(codigo) {
    return fetch(API + '/pro/estado?c=' + encodeURIComponent(codigo)).then(function (r) { return r.json(); });
  }
  function activar(codigo) {
    codigo = (codigo || '').trim().toUpperCase();
    if (!codigo) return;
    mostrarCodigo('Verificando…');
    consultar(codigo).then(function (j) {
      if (j.ok) {
        pro.codigo = codigo; pro.restantes = j.restantes; pro.ok = j.restantes > 0;
        try { localStorage.setItem(CLAVE, codigo); } catch (e) {}
        mostrarCodigo(j.restantes > 0 ? 'Código activo · te quedan ' + j.restantes + ' mapas Pro' : 'Este código ya usó sus 5 mapas.', j.restantes > 0);
        aplicarMarca();
      } else {
        pro.ok = false; mostrarCodigo('Código no válido. Revisalo o escribinos.');
      }
    }).catch(function () { mostrarCodigo('No se pudo verificar ahora. Probá de nuevo en un rato.'); });
  }
  $('pro-form').addEventListener('submit', function (e) { e.preventDefault(); activar($('pro-codigo').value); });
  try { var guardado = localStorage.getItem(CLAVE); if (guardado) { $('pro-codigo').value = guardado; activar(guardado); } } catch (e) {}

  /* ---------- Sin marca de agua para quien tiene código ---------- */
  function aplicarMarca() {
    window.APACHETA_SIN_MARCA = pro.ok;
    ['ma-centro', 'ma-esquina'].forEach(function (id) { if ($(id)) $(id).style.display = pro.ok ? 'none' : ''; });
  }
  ['fillText', 'strokeText'].forEach(function (m) {
    var orig = CanvasRenderingContext2D.prototype[m];
    CanvasRenderingContext2D.prototype[m] = function (t) {
      if (window.APACHETA_SIN_MARCA && (t === 'Apacheta Cartografía' || t === 'APACHETA CARTOGRAFÍA')) return;
      if (pro.escala && typeof t === 'string' && t.indexOf('Escala aproximada') === 0) arguments[0] = t.replace('Escala aproximada', 'Escala');
      if (typeof t === 'string' && t.indexOf('Web Mercator · ') >= 0 && pro.grilla === 'utm') arguments[0] = t.replace('Web Mercator · ', 'Web Mercator · Grilla UTM zona ' + zonaUTM() + 'S (WGS84) · ');
      return orig.apply(this, arguments);
    };
  });

  /* ---------- Hoja (misma geometría que mapa.js) ---------- */
  function hoja() {
    var f = HOJAS[$('tamano').value], vertical = $('orientacion').value === 'vertical';
    var W = vertical ? f.w : f.h, H = vertical ? f.h : f.w, m = 10, cab = 21, pie = 34;
    return { W: W, H: H, mapa: { x: m, y: m + cab, w: W - 2 * m, h: H - 2 * m - cab - pie } };
  }

  /* ---------- Escala exacta ---------- */
  function zoomPara(den) {
    var h = hoja(), anchoPx = map.getSize().x || 1, lat = map.getCenter().lat;
    var mPorPx = den / 1000 * h.mapa.w / anchoPx;
    return Math.log2(156543.03392 * Math.cos(lat * Math.PI / 180) / mPorPx);
  }
  var ajustando = false;
  function aplicarEscala() {
    if (!pro.escala) {
      map.options.zoomSnap = 1;
      ['scrollWheelZoom', 'doubleClickZoom', 'touchZoom', 'boxZoom'].forEach(function (k) { if (map[k]) map[k].enable(); });
      return;
    }
    map.options.zoomSnap = 0;
    ['scrollWheelZoom', 'doubleClickZoom', 'touchZoom', 'boxZoom'].forEach(function (k) { if (map[k]) map[k].disable(); });
    var z = zoomPara(pro.escala);
    if (Math.abs(map.getZoom() - z) > 0.0005) { ajustando = true; map.setView(map.getCenter(), z, { animate: false }); ajustando = false; }
  }
  $('pro-escala').addEventListener('change', function () { pro.escala = +this.value || 0; aplicarEscala(); dibujarGrilla(); });
  map.on('resize', function () { setTimeout(aplicarEscala, 0); });
  map.on('zoomend', function () { if (!ajustando && pro.escala) setTimeout(aplicarEscala, 0); });
  map.on('moveend', function () { if (pro.escala) aplicarEscala(); dibujarGrilla(); });

  /* ---------- UTM (WGS84) ---------- */
  var a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  function zonaUTM() { return Math.floor((map.getCenter().lng + 180) / 6) + 1; }
  function aUTM(lat, lon, zona) {
    var l0 = ((zona - 1) * 6 - 180 + 3) * Math.PI / 180, fi = lat * Math.PI / 180, la = lon * Math.PI / 180;
    var N = a / Math.sqrt(1 - e2 * Math.sin(fi) * Math.sin(fi)), T = Math.tan(fi) * Math.tan(fi), Cc = ep2 * Math.cos(fi) * Math.cos(fi), A = Math.cos(fi) * (la - l0);
    var M = a * ((1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256) * fi - (3 * e2 / 8 + 3 * e2 * e2 / 32 + 45 * e2 * e2 * e2 / 1024) * Math.sin(2 * fi) + (15 * e2 * e2 / 256 + 45 * e2 * e2 * e2 / 1024) * Math.sin(4 * fi) - (35 * e2 * e2 * e2 / 3072) * Math.sin(6 * fi));
    var E = k0 * N * (A + (1 - T + Cc) * A * A * A / 6 + (5 - 18 * T + T * T + 72 * Cc - 58 * ep2) * Math.pow(A, 5) / 120) + 500000;
    var Nn = k0 * (M + N * Math.tan(fi) * (A * A / 2 + (5 - T + 9 * Cc + 4 * Cc * Cc) * Math.pow(A, 4) / 24 + (61 - 58 * T + T * T + 600 * Cc - 330 * ep2) * Math.pow(A, 6) / 720));
    if (lat < 0) Nn += 10000000;
    return [E, Nn];
  }
  function deUTM(E, Nn, zona) {
    var x = E - 500000, y = Nn - 10000000, l0 = ((zona - 1) * 6 - 180 + 3) * Math.PI / 180;
    var M = y / k0, mu = M / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256));
    var e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    var f1 = mu + (3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32) * Math.sin(2 * mu) + (21 * e1 * e1 / 16 - 55 * Math.pow(e1, 4) / 32) * Math.sin(4 * mu) + (151 * Math.pow(e1, 3) / 96) * Math.sin(6 * mu);
    var N1 = a / Math.sqrt(1 - e2 * Math.sin(f1) * Math.sin(f1)), T1 = Math.tan(f1) * Math.tan(f1), C1 = ep2 * Math.cos(f1) * Math.cos(f1);
    var R1 = a * (1 - e2) / Math.pow(1 - e2 * Math.sin(f1) * Math.sin(f1), 1.5), D = x / (N1 * k0);
    var lat = f1 - (N1 * Math.tan(f1) / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * Math.pow(D, 4) / 24 + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * Math.pow(D, 6) / 720);
    var lon = l0 + (D - (1 + 2 * T1 + C1) * Math.pow(D, 3) / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * Math.pow(D, 5) / 120) / Math.cos(f1);
    return [lat * 180 / Math.PI, lon * 180 / Math.PI];
  }
  // Líneas de la grilla para un recuadro geográfico
  function lineasGrilla(b) {
    var z = zonaUTM(), esq = [b.getSouthWest(), b.getNorthWest(), b.getNorthEast(), b.getSouthEast()].map(function (p) { return aUTM(p.lat, p.lng, z); });
    var minE = Math.min.apply(null, esq.map(function (q) { return q[0]; })), maxE = Math.max.apply(null, esq.map(function (q) { return q[0]; }));
    var minN = Math.min.apply(null, esq.map(function (q) { return q[1]; })), maxN = Math.max.apply(null, esq.map(function (q) { return q[1]; }));
    var paso = (maxE - minE) > 40000 ? 5000 : 1000, out = [];
    for (var E = Math.ceil(minE / paso) * paso; E <= maxE; E += paso) {
      var l = []; for (var i = 0; i <= 20; i++) l.push(deUTM(E, minN + (maxN - minN) * i / 20, z));
      out.push({ tipo: 'E', valor: E, pts: l });
    }
    for (var N = Math.ceil(minN / paso) * paso; N <= maxN; N += paso) {
      var l2 = []; for (var j = 0; j <= 20; j++) l2.push(deUTM(minE + (maxE - minE) * j / 20, N, z));
      out.push({ tipo: 'N', valor: N, pts: l2 });
    }
    return out;
  }
  function dibujarGrilla() {
    if (pro.capaGrilla) { map.removeLayer(pro.capaGrilla); pro.capaGrilla = null; }
    if (pro.grilla !== 'utm') return;
    pro.capaGrilla = L.layerGroup(lineasGrilla(map.getBounds()).map(function (g) {
      return L.polyline(g.pts, { color: '#16201D', weight: 0.8, opacity: 0.45, interactive: false });
    })).addTo(map);
  }
  $('pro-grilla').addEventListener('change', function () { pro.grilla = this.value; dibujarGrilla(); });

  /* ---------- Track GPX / KML ---------- */
  function leerTrack(texto, nombre) {
    var xml = new DOMParser().parseFromString(texto, 'application/xml'), pts = [];
    var nodos = xml.querySelectorAll('trkpt, rtept');
    if (nodos.length) {
      nodos.forEach(function (n) {
        var ele = n.querySelector('ele');
        pts.push([+n.getAttribute('lat'), +n.getAttribute('lon'), ele ? +ele.textContent : null]);
      });
    } else {
      xml.querySelectorAll('LineString coordinates, coordinates').forEach(function (c) {
        c.textContent.trim().split(/\s+/).forEach(function (t) {
          var v = t.split(','); if (v.length >= 2) pts.push([+v[1], +v[0], v.length > 2 ? +v[2] : null]);
        });
      });
    }
    pts = pts.filter(function (p) { return isFinite(p[0]) && isFinite(p[1]); });
    if (pts.length < 2) throw new Error('sin puntos');
    var dist = [0];
    for (var i = 1; i < pts.length; i++) dist.push(dist[i - 1] + map.distance([pts[i - 1][0], pts[i - 1][1]], [pts[i][0], pts[i][1]]));
    var conEle = pts.filter(function (p) { return p[2] !== null && isFinite(p[2]); }).length > pts.length / 2;
    var sube = 0;
    if (conEle) for (var k = 1; k < pts.length; k++) { var d = pts[k][2] - pts[k - 1][2]; if (d > 0) sube += d; }
    return { nombre: nombre.replace(/\.(gpx|kml)$/i, ''), pts: pts, dist: dist, conEle: conEle, sube: Math.round(sube) };
  }
  $('pro-gpx').addEventListener('change', function () {
    var f = this.files[0]; if (!f) return;
    f.text().then(function (t) {
      pro.track = leerTrack(t, f.name);
      if (pro.capaTrack) map.removeLayer(pro.capaTrack);
      pro.capaTrack = L.polyline(pro.track.pts.map(function (p) { return [p[0], p[1]]; }), { color: C.acento, weight: 4, opacity: .9 }).addTo(map);
      if (!pro.escala) map.fitBounds(pro.capaTrack.getBounds(), { padding: [30, 30] });
      else map.panTo(pro.capaTrack.getBounds().getCenter());
      $('pro-gpx-info').textContent = pro.track.nombre + ' · ' + (pro.track.dist[pro.track.dist.length - 1] / 1000).toFixed(1).replace('.', ',') + ' km' +
        (pro.track.conEle ? ' · +' + pro.track.sube + ' m' : ' · sin alturas: va sin perfil');
    }).catch(function () { $('pro-gpx-info').textContent = 'No se pudo leer el archivo. Probá con un GPX o KML.'; });
  });
  $('pro-gpx-quitar').addEventListener('click', function () {
    pro.track = null; if (pro.capaTrack) map.removeLayer(pro.capaTrack); pro.capaTrack = null;
    $('pro-gpx').value = ''; $('pro-gpx-info').textContent = '';
  });

  /* ---------- Dibujo sobre la hoja en alta resolución ---------- */
  function decorar(cv) {
    var h = hoja(), mm = function (v) { return v * PPM; };
    var fx = mm(h.mapa.x), fy = mm(h.mapa.y), fw = mm(h.mapa.w), fh = mm(h.mapa.h);
    var b = map.getBounds(), z = 20, nw = map.project(b.getNorthWest(), z), se = map.project(b.getSouthEast(), z);
    var sx = fw / (se.x - nw.x), sy = fh / (se.y - nw.y);
    var proy = function (lat, lon) { var p = map.project([lat, lon], z); return [fx + (p.x - nw.x) * sx, fy + (p.y - nw.y) * sy]; };
    var cx = cv.getContext('2d');
    cx.save(); cx.beginPath(); cx.rect(fx, fy, fw, fh); cx.clip();
    if (pro.grilla === 'utm') {
      var lineas = lineasGrilla(b);
      cx.lineWidth = mm(.18); cx.strokeStyle = 'rgba(22,32,29,.55)';
      lineas.forEach(function (g) {
        cx.beginPath(); g.pts.forEach(function (ll, i) { var q = proy(ll[0], ll[1]); if (i) cx.lineTo(q[0], q[1]); else cx.moveTo(q[0], q[1]); }); cx.stroke();
      });
      cx.font = '600 ' + mm(2.1) + 'px Montserrat'; cx.fillStyle = C.tinta;
      cx.lineWidth = mm(.6); cx.strokeStyle = 'rgba(255,255,255,.9)';
      lineas.forEach(function (g) {
        var km = String(Math.round(g.valor / 1000)), q;
        if (g.tipo === 'E') { q = proy(g.pts[g.pts.length - 1][0], g.pts[g.pts.length - 1][1]); q = [q[0] + mm(.8), fy + mm(3)]; }
        else { q = proy(g.pts[0][0], g.pts[0][1]); q = [fx + mm(1), q[1] - mm(.8)]; }
        cx.strokeText(km, q[0], q[1]); cx.fillText(km, q[0], q[1]);
      });
    }
    if (pro.track) {
      cx.beginPath();
      pro.track.pts.forEach(function (p, i) { var q = proy(p[0], p[1]); if (i) cx.lineTo(q[0], q[1]); else cx.moveTo(q[0], q[1]); });
      cx.lineCap = 'round'; cx.lineJoin = 'round';
      cx.lineWidth = mm(1.3); cx.strokeStyle = 'rgba(255,255,255,.9)'; cx.stroke();
      cx.lineWidth = mm(.75); cx.strokeStyle = C.acento; cx.stroke();
      var ini = proy(pro.track.pts[0][0], pro.track.pts[0][1]);
      cx.beginPath(); cx.arc(ini[0], ini[1], mm(1.3), 0, 2 * Math.PI); cx.fillStyle = C.acento; cx.fill();
      cx.lineWidth = mm(.4); cx.strokeStyle = '#fff'; cx.stroke();
      if (pro.track.conEle) perfil(cx, mm, fx + mm(3), fy + fh - mm(31), mm(Math.min(78, h.mapa.w * .45)), mm(28));
    }
    cx.restore();
  }
  function perfil(cx, mm, x, y, w, hgt) {
    var t = pro.track, eles = t.pts.map(function (p) { return p[2]; }), tot = t.dist[t.dist.length - 1];
    var mn = Math.min.apply(null, eles.filter(isFinite)), mx = Math.max.apply(null, eles.filter(isFinite));
    if (mx - mn < 1) mx = mn + 1;
    cx.fillStyle = 'rgba(255,255,255,.92)'; cx.fillRect(x, y, w, hgt);
    cx.lineWidth = mm(.2); cx.strokeStyle = C.tinta; cx.strokeRect(x, y, w, hgt);
    var px0 = x + mm(9), py0 = y + mm(5), pw = w - mm(12), ph = hgt - mm(10);
    cx.font = '700 ' + mm(2.2) + 'px Inter'; cx.fillStyle = C.acento; cx.textAlign = 'left';
    cx.fillText('PERFIL', x + mm(2), y + mm(3.3));
    cx.font = '500 ' + mm(1.9) + 'px Montserrat'; cx.fillStyle = C.texto; cx.textAlign = 'right';
    cx.fillText((tot / 1000).toFixed(1).replace('.', ',') + ' km · +' + t.sube + ' m', x + w - mm(2), y + mm(3.3));
    cx.beginPath();
    t.pts.forEach(function (p, i) {
      if (!isFinite(p[2])) return;
      var qx = px0 + pw * t.dist[i] / tot, qy = py0 + ph * (1 - (p[2] - mn) / (mx - mn));
      if (i) cx.lineTo(qx, qy); else cx.moveTo(qx, qy);
    });
    cx.lineWidth = mm(.45); cx.strokeStyle = C.acento; cx.stroke();
    cx.font = '500 ' + mm(1.8) + 'px Montserrat'; cx.fillStyle = C.gris; cx.textAlign = 'right';
    cx.fillText(Math.round(mx) + ' m', px0 - mm(1), py0 + mm(1.5));
    cx.fillText(Math.round(mn) + ' m', px0 - mm(1), py0 + ph);
    cx.textAlign = 'left';
  }
  // La hoja en alta resolución la arma mapa.js; antes de convertirla a imagen se le suman grilla, track y perfil.
  var origDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function () {
    var h = hoja();
    if (!this.__pro && this.width === Math.round(h.W * PPM) && this.height === Math.round(h.H * PPM)) {
      this.__pro = true;
      try { decorar(this); } catch (e) { console.error(e); }
    }
    return origDataURL.apply(this, arguments);
  };

  /* ---------- Control de usos ---------- */
  $('generar').addEventListener('click', function (e) {
    if (pro.ok) return;
    e.stopImmediatePropagation();
    $('estado-gen').textContent = 'Para preparar el PDF Pro necesitás un código activo.';
    $('pro-codigo').focus();
  }, true);
  var permitido = false;
  $('descargar').addEventListener('click', function (e) {
    if (permitido) { permitido = false; return; }
    e.stopImmediatePropagation();
    var btn = $('descargar'); btn.disabled = true;
    fetch(API + '/pro/usar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ c: pro.codigo }) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        btn.disabled = false;
        if (!j.ok) { $('vista-info').textContent = j.restantes === 0 ? 'Este código ya usó sus 5 mapas.' : 'No se pudo validar el código.'; pro.ok = false; aplicarMarca(); return; }
        pro.restantes = j.restantes; pro.ok = j.restantes > 0;
        mostrarCodigo('Código activo · te quedan ' + j.restantes + ' mapas Pro', true);
        permitido = true; btn.click();
        if (!pro.ok) aplicarMarca();
      })
      .catch(function () { btn.disabled = false; $('vista-info').textContent = 'No se pudo validar el código. Probá de nuevo.'; });
  }, true);
})();
