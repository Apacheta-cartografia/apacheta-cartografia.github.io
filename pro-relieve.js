/* Armá tu mapa Pro: curvas de nivel con cotas y sombreado de relieve calculados desde un modelo de elevación.
   Datos: Terrain Tiles (formato Terrarium) del programa de datos abiertos de AWS, basados en SRTM y otras fuentes. */
(function () {
  'use strict';
  var map = window.APACHETA_MAP;
  var $ = function (id) { return document.getElementById(id); };
  var DEM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
  var HOJAS = { a4: { w: 210, h: 297 }, a3: { w: 297, h: 420 } };
  var PPM = 200 / 25.4;
  var COLOR = '#8A5A33';
  var dem = null, cargando = null, overlay = null, temporizador = null;
  map.createPane('relieve'); map.getPane('relieve').style.zIndex = 250; map.getPane('relieve').style.pointerEvents = 'none';

  function opciones() {
    return { curvas: $('pro-curvas').checked, sombra: $('pro-sombra').checked, aclarar: $('pro-aclarar').checked };
  }
  function activo() { var o = opciones(); return o.curvas || o.sombra; }
  function hoja() {
    var f = HOJAS[$('tamano').value], v = $('orientacion').value === 'vertical';
    var W = v ? f.w : f.h, H = v ? f.h : f.w, m = 10;
    return { W: W, H: H, mapa: { w: W - 2 * m, h: H - 2 * m - 21 - 34 } };
  }
  // Escala actual (1:den) a partir del zoom y del ancho del mapa en la hoja
  function denominador() {
    var h = hoja(), lat = map.getCenter().lat;
    var mPorPx = 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, map.getZoom());
    return mPorPx * map.getSize().x / h.mapa.w * 1000;
  }
  function equidistancia() {
    var d = denominador();
    var eq = d <= 30000 ? 20 : d <= 60000 ? 25 : d <= 120000 ? 50 : d <= 300000 ? 100 : 200;
    var maestra = eq === 20 ? 100 : eq === 25 ? 100 : eq * 5;
    return { eq: eq, maestra: maestra };
  }

  /* ---------- Modelo de elevación ---------- */
  function cargarImg(url) {
    return new Promise(function (ok) {
      var im = new Image(); im.crossOrigin = 'anonymous';
      im.onload = function () { ok(im); }; im.onerror = function () { ok(null); }; im.src = url;
    });
  }
  function claveVista() { var b = map.getBounds(); return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map(function (v) { return v.toFixed(5); }).join(','); }
  function cargarDEM() {
    var clave = claveVista();
    if (dem && dem.clave === clave) return Promise.resolve(dem);
    if (cargando && cargando.clave === clave) return cargando.p;
    var b = map.getBounds(), z = 9, nw, se;
    for (; z <= 15; z++) { nw = map.project(b.getNorthWest(), z); se = map.project(b.getSouthEast(), z); if (se.x - nw.x >= 900) break; }
    z = Math.min(z, 15); nw = map.project(b.getNorthWest(), z); se = map.project(b.getSouthEast(), z);
    var tx0 = Math.floor(nw.x / 256), ty0 = Math.floor(nw.y / 256), tx1 = Math.floor(se.x / 256), ty1 = Math.floor(se.y / 256);
    var ancho = (tx1 - tx0 + 1) * 256, alto = (ty1 - ty0 + 1) * 256;
    var cv = document.createElement('canvas'); cv.width = ancho; cv.height = alto;
    var cx = cv.getContext('2d', { willReadFrequently: true });
    var tareas = [], n = Math.pow(2, z);
    for (var tx = tx0; tx <= tx1; tx++) for (var ty = ty0; ty <= ty1; ty++) {
      (function (tx, ty) {
        var x = ((tx % n) + n) % n;
        tareas.push(cargarImg(DEM_URL.replace('{z}', z).replace('{x}', x).replace('{y}', ty)).then(function (im) {
          if (im) cx.drawImage(im, (tx - tx0) * 256, (ty - ty0) * 256);
        }));
      })(tx, ty);
    }
    var p = Promise.all(tareas).then(function () {
      var gx0 = Math.floor(nw.x - tx0 * 256), gy0 = Math.floor(nw.y - ty0 * 256);
      var w = Math.max(2, Math.ceil(se.x - nw.x)), h = Math.max(2, Math.ceil(se.y - nw.y));
      var px = cx.getImageData(gx0, gy0, w, h).data, ele = new Float32Array(w * h);
      for (var i = 0; i < w * h; i++) ele[i] = (px[i * 4] * 256 + px[i * 4 + 1] + px[i * 4 + 2] / 256) - 32768;
      ele = suavizar(suavizar(ele, w, h), w, h);
      var lat = map.getCenter().lat, celda = 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, z);
      dem = { clave: clave, z: z, w: w, h: h, ele: ele, celda: celda };
      cargando = null;
      return dem;
    });
    cargando = { clave: clave, p: p };
    return p;
  }
  function suavizar(a, w, h) {
    var o = new Float32Array(a.length);
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var s = 0, c = 0;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        var xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; s += a[yy * w + xx]; c++;
      }
      o[y * w + x] = s / c;
    }
    return o;
  }

  /* ---------- Sombreado ---------- */
  function sombreado(d) {
    var cv = document.createElement('canvas'); cv.width = d.w; cv.height = d.h;
    var cx = cv.getContext('2d'), img = cx.createImageData(d.w, d.h), e = d.ele, w = d.w, h = d.h;
    var az = 315 * Math.PI / 180, alt = 45 * Math.PI / 180, zf = 1.6;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var xl = Math.max(0, x - 1), xr = Math.min(w - 1, x + 1), yu = Math.max(0, y - 1), yd = Math.min(h - 1, y + 1);
      var dzdx = (e[y * w + xr] - e[y * w + xl]) / ((xr - xl) * d.celda) * zf;
      var dzdy = (e[yd * w + x] - e[yu * w + x]) / ((yd - yu) * d.celda) * zf;
      var pend = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy)), asp = Math.atan2(dzdy, -dzdx);
      var hs = Math.cos(alt) * Math.cos(pend) + Math.sin(alt) * Math.sin(pend) * Math.cos(az - Math.PI / 2 + asp);
      hs = Math.max(0, Math.min(1, hs));
      var v = Math.round(255 - (1 - hs) * 100), k = (y * w + x) * 4;
      img.data[k] = v; img.data[k + 1] = v; img.data[k + 2] = v; img.data[k + 3] = 255;
    }
    cx.putImageData(img, 0, 0);
    return cv;
  }

  /* ---------- Curvas ---------- */
  function chaikin(r) {
    if (r.length < 4) return r;
    var o = [];
    for (var i = 0; i < r.length - 1; i++) {
      var a = r[i], b = r[i + 1];
      o.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25], [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]);
    }
    o.push(o[0]);
    return o;
  }
  function curvas(d) {
    var q = equidistancia(), mn = Infinity, mx = -Infinity;
    for (var i = 0; i < d.ele.length; i++) { if (d.ele[i] < mn) mn = d.ele[i]; if (d.ele[i] > mx) mx = d.ele[i]; }
    var umbrales = [];
    for (var t = Math.ceil(mn / q.eq) * q.eq; t <= mx; t += q.eq) umbrales.push(t);
    if (umbrales.length > 400) umbrales = umbrales.filter(function (t) { return t % q.maestra === 0; });
    var gen = d3.contours().size([d.w, d.h]).thresholds(umbrales)(Array.from(d.ele));
    return gen.map(function (g) {
      var anillos = [];
      g.coordinates.forEach(function (poli) { poli.forEach(function (r) { if (r.length > 6) anillos.push(chaikin(chaikin(r))); }); });
      return { valor: g.value, maestra: g.value % q.maestra === 0, anillos: anillos };
    });
  }

  // Dibuja relieve en un contexto: a = función (x, y en celdas del DEM) -> [x, y] en el lienzo
  function dibujar(cx, d, dest, mm, conRotulos) {
    var o = opciones(), sx = dest.w / d.w, sy = dest.h / d.h;
    var a = function (p) { return [dest.x + p[0] * sx, dest.y + p[1] * sy]; };
    cx.save();
    cx.beginPath(); cx.rect(dest.x, dest.y, dest.w, dest.h); cx.clip();
    if (o.aclarar) { cx.fillStyle = 'rgba(255,255,255,.55)'; cx.fillRect(dest.x, dest.y, dest.w, dest.h); }
    if (o.sombra) {
      cx.globalCompositeOperation = 'multiply'; cx.globalAlpha = .75;
      cx.imageSmoothingEnabled = true; cx.drawImage(sombreado(d), dest.x, dest.y, dest.w, dest.h);
      cx.globalCompositeOperation = 'source-over'; cx.globalAlpha = 1;
    }
    if (o.curvas) {
      var lista = curvas(d), rot = [];
      cx.lineJoin = 'round'; cx.lineCap = 'round';
      lista.forEach(function (c) {
        cx.strokeStyle = COLOR; cx.globalAlpha = c.maestra ? .9 : .55; cx.lineWidth = mm(c.maestra ? .26 : .12);
        c.anillos.forEach(function (r) {
          cx.beginPath(); r.forEach(function (p, i) { var q = a(p); if (i) cx.lineTo(q[0], q[1]); else cx.moveTo(q[0], q[1]); }); cx.stroke();
          if (conRotulos && c.maestra) rot.push({ r: r, valor: c.valor });
        });
      });
      cx.globalAlpha = 1;
      if (conRotulos) rotular(cx, rot, a, mm);
    }
    cx.restore();
  }
  function rotular(cx, lista, a, mm) {
    var puestos = [], paso = mm(55);
    cx.font = '600 ' + mm(1.9) + 'px Montserrat'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    lista.forEach(function (it) {
      var pts = it.r.map(a), acum = 0, siguiente = paso * .4, n = 0;
      for (var i = 1; i < pts.length - 1 && n < 4; i++) {
        acum += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        if (acum < siguiente) continue;
        var p = pts[i], q = pts[Math.min(pts.length - 1, i + 2)], o = pts[Math.max(0, i - 2)];
        var ang = Math.atan2(q[1] - o[1], q[0] - o[0]); if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
        if (puestos.some(function (u) { return Math.hypot(u[0] - p[0], u[1] - p[1]) < mm(18); })) continue;
        var t = String(it.valor), ancho = cx.measureText(t).width;
        cx.save(); cx.translate(p[0], p[1]); cx.rotate(ang);
        cx.fillStyle = 'rgba(255,255,255,.85)'; cx.fillRect(-ancho / 2 - mm(.6), -mm(1.1), ancho + mm(1.2), mm(2.2));
        cx.fillStyle = COLOR; cx.fillText(t, 0, mm(.1));
        cx.restore();
        puestos.push(p); siguiente = acum + paso; n++;
      }
    });
    cx.textAlign = 'left'; cx.textBaseline = 'alphabetic';
  }

  /* ---------- Vista previa en el mapa ---------- */
  function actualizarVista() {
    clearTimeout(temporizador);
    temporizador = setTimeout(function () {
      if (overlay) { map.removeLayer(overlay); overlay = null; }
      if (!activo()) { $('pro-relieve-info').textContent = ''; return; }
      $('pro-relieve-info').textContent = 'Calculando relieve…';
      var b = map.getBounds();
      cargarDEM().then(function (d) {
        var tam = map.getSize(), cv = document.createElement('canvas'); cv.width = tam.x * 2; cv.height = tam.y * 2;
        dibujar(cv.getContext('2d'), d, { x: 0, y: 0, w: cv.width, h: cv.height }, function (v) { return v * 2 * tam.x / hoja().mapa.w; }, false);
        if (overlay) map.removeLayer(overlay);
        overlay = L.imageOverlay(cv.toDataURL(), b, { opacity: 1, interactive: false, pane: 'relieve' }).addTo(map);
        var q = equidistancia();
        $('pro-relieve-info').textContent = opciones().curvas ? 'Curvas cada ' + q.eq + ' m, maestras cada ' + q.maestra + ' m.' : '';
      }).catch(function () { $('pro-relieve-info').textContent = 'No se pudo cargar el relieve. Probá de nuevo.'; });
    }, 350);
  }
  ['pro-curvas', 'pro-sombra', 'pro-aclarar'].forEach(function (id) { $(id).addEventListener('change', actualizarVista); });
  map.on('moveend zoomend resize', actualizarVista);
  $('tamano').addEventListener('change', actualizarVista); $('orientacion').addEventListener('change', actualizarVista);

  /* ---------- En la hoja del PDF ---------- */
  // mapa.js pega el mapa base con drawImage(..9 argumentos..) sobre la hoja; justo después se agrega el relieve,
  // así las capas de OpenStreetMap, lo dibujado y los rótulos quedan por encima.
  var origDraw = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function () {
    var r = origDraw.apply(this, arguments);
    if (arguments.length === 9 && dem && activo() && !this.__relieve) {
      var h = hoja(), W = Math.round(h.W * PPM), H = Math.round(h.H * PPM);
      if (this.canvas && this.canvas.width === W && this.canvas.height === H) {
        this.__relieve = true;
        try {
          dibujar(this, dem, { x: arguments[5], y: arguments[6], w: arguments[7], h: arguments[8] }, function (v) { return v * PPM; }, true);
        } catch (e) { console.error(e); }
      }
    }
    return r;
  };
  // Antes de preparar el PDF, asegurar el relieve de la vista actual
  var listo = false;
  $('generar').addEventListener('click', function (e) {
    if (!activo() || listo) { listo = false; return; }
    e.stopImmediatePropagation();
    $('estado-gen').textContent = 'Calculando curvas de nivel y relieve…';
    cargarDEM().then(function () { listo = true; $('generar').click(); })
      .catch(function () { $('estado-gen').textContent = 'No se pudo cargar el relieve. Probá de nuevo.'; });
  }, true);

  // Créditos y equidistancia en el pie del PDF
  var origFill = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (t) {
    if (activo() && typeof t === 'string' && t.indexOf('Web Mercator · ') >= 0) {
      var q = equidistancia(), extra = 'Relieve: Terrain Tiles (AWS, SRTM)' + (opciones().curvas ? ' · Curvas cada ' + q.eq + ' m' : '') + ' · ';
      arguments[0] = t.replace('Web Mercator · ', 'Web Mercator · ' + extra);
      // Achicar la letra si el pie no entra en el ancho de la hoja (se suma también la nota de la grilla)
      var disp = (hoja().W - 20) * PPM, med = this.measureText(arguments[0] + ' Grilla UTM zona 19S (WGS84) · ').width;
      if (med > disp) this.font = this.font.replace(/([\d.]+)px/, function (m, n) { return (parseFloat(n) * disp / med) + 'px'; });
    }
    return origFill.apply(this, arguments);
  };

  actualizarVista();
})();
