/* Armá tu mapa Pro · extras: PDF georreferenciado (Avenza, QGIS), guardar/abrir proyecto,
   logo del cliente en la hoja y comentarios para mejorar la herramienta. */
(function () {
  'use strict';
  var API = 'https://apacheta-pro.apacheta-cartografia.workers.dev';
  var HOJAS = { a4: { w: 210, h: 297 }, a3: { w: 297, h: 420 }, a2: { w: 420, h: 594 }, a1: { w: 594, h: 841 } };
  var map = window.APACHETA_MAP;
  var $ = function (id) { return document.getElementById(id); };
  var extra = { logo: null, logoUrl: '', bounds: null, hojaGen: null };

  function hoja() {
    var f = HOJAS[$('tamano').value], vertical = $('orientacion').value === 'vertical';
    var W = vertical ? f.w : f.h, H = vertical ? f.h : f.w, m = 10, cab = 21, pie = 34;
    return { W: W, H: H, m: m, mapa: { x: m, y: m + cab, w: W - 2 * m, h: H - 2 * m - cab - pie } };
  }
  function ppm() { return (window.APACHETA_DPI || 200) / 25.4; }

  /* =============== Logo del cliente =============== */
  // Va en el encabezado, a la izquierda de la marca de Apacheta: hasta 30 × 13 mm.
  var LOGO = { maxW: 30, maxH: 13, sep: 56 };
  function cajaLogo(h) {
    if (!extra.logo) return null;
    var r = extra.logo.width / extra.logo.height, w = LOGO.maxW, hh = w / r;
    if (hh > LOGO.maxH) { hh = LOGO.maxH; w = hh * r; }
    return { x: h.W - h.m - LOGO.sep - w, y: h.m + 1 + (LOGO.maxH - hh) / 2, w: w, h: hh };
  }
  function vistaLogo() {
    var img = $('h-logo');
    if (!img) {
      img = document.createElement('img'); img.id = 'h-logo'; img.className = 'abs'; img.alt = 'Logo';
      img.style.objectFit = 'contain'; img.style.pointerEvents = 'none';
      $('hoja').appendChild(img);
    }
    var c = cajaLogo(hoja());
    img.hidden = !c;
    if (!c) return;
    img.src = extra.logoUrl;
    img.style.left = c.x + 'em'; img.style.top = c.y + 'em'; img.style.width = c.w + 'em'; img.style.height = c.h + 'em';
  }
  $('pro-logo').addEventListener('change', function () {
    var f = this.files[0]; if (!f) return;
    if (f.size > 3e6) { $('pro-logo-info').textContent = 'El logo pesa más de 3 MB: probá con uno más liviano.'; this.value = ''; return; }
    var lector = new FileReader();
    lector.onload = function () {
      var im = new Image();
      im.onload = function () {
        extra.logo = im; extra.logoUrl = lector.result;
        $('pro-logo-info').textContent = 'Logo cargado. Va en el encabezado, junto al título.';
        vistaLogo();
      };
      im.onerror = function () { $('pro-logo-info').textContent = 'No se pudo leer la imagen. Usá PNG, JPG o SVG.'; };
      im.src = lector.result;
    };
    lector.readAsDataURL(f);
  });
  $('pro-logo-quitar').addEventListener('click', function () {
    extra.logo = null; extra.logoUrl = ''; $('pro-logo').value = ''; $('pro-logo-info').textContent = ''; vistaLogo();
  });
  ['tamano', 'orientacion'].forEach(function (id) { $(id).addEventListener('change', function () { setTimeout(vistaLogo, 50); }); });
  window.addEventListener('resize', function () { setTimeout(vistaLogo, 50); });

  // Con logo, el título se achica si hace falta para no pisarlo
  var origFill = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (t, x, y) {
    if (extra.logo && typeof t === 'string' && t === ($('titulo').value.trim() || 'Mi mapa') && /700/.test(this.font) && /Inter/.test(this.font)) {
      var h = hoja(), lim = (h.W - 2 * h.m - LOGO.sep - LOGO.maxW - 4) * ppm(), w = this.measureText(t).width;
      if (w > lim && this.canvas.width === Math.round(h.W * ppm())) {
        var px = parseFloat(this.font.match(/([\d.]+)px/)[1]);
        this.font = this.font.replace(/[\d.]+px/, (px * lim / w).toFixed(2) + 'px');
      }
    }
    return origFill.apply(this, arguments);
  };

  /* =============== Hoja final: logo y datos para georreferenciar =============== */
  var origDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function () {
    var h = hoja(), P = ppm();
    if (!this.__extra && this.width === Math.round(h.W * P) && this.height === Math.round(h.H * P)) {
      this.__extra = true;
      var b = map.getBounds();
      extra.bounds = { n: b.getNorth(), s: b.getSouth(), e: b.getEast(), o: b.getWest() };
      extra.hojaGen = h;
      var c = cajaLogo(h);
      if (c) {
        try { this.getContext('2d').drawImage(extra.logo, c.x * P, c.y * P, c.w * P, c.h * P); } catch (e) { console.error(e); }
      }
    }
    return origDataURL.apply(this, arguments);
  };

  /* =============== PDF georreferenciado =============== */
  // Agrega al PDF un «Viewport» con medida geoespacial (ISO 32000-2, la que leen Avenza Maps, QGIS y GDAL),
  // como actualización incremental: no toca el contenido ya escrito por jsPDF.
  var WKT = 'PROJCS["WGS 84 / Pseudo-Mercator",GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],' +
    'PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],PROJECTION["Mercator_1SP"],PARAMETER["central_meridian",0],' +
    'PARAMETER["scale_factor",1],PARAMETER["false_easting",0],PARAMETER["false_northing",0],UNIT["metre",1],' +
    'EXTENSION["PROJ4","+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs"],' +
    'AUTHORITY["EPSG","3857"]]';
  function n6(v) { return (+v).toFixed(8).replace(/0+$/, '').replace(/\.$/, ''); }
  function georreferenciar(buf) {
    var g = extra.bounds, h = extra.hojaGen;
    if (!g || !h) return buf;
    var bytes = new Uint8Array(buf), s = '';
    for (var i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    var m = /(\d+) 0 obj\s*<<\s*\/Type \/Page\s([\s\S]*?)>>\s*endobj/.exec(s);
    var prev = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(s);
    var tr = s.lastIndexOf('trailer');
    if (!m || !prev || tr < 0) return buf;
    var trailer = s.slice(tr);
    var size = +(/\/Size (\d+)/.exec(trailer) || [])[1], root = (/\/Root (\d+ \d+ R)/.exec(trailer) || [])[1], info = (/\/Info (\d+ \d+ R)/.exec(trailer) || [])[1];
    if (!size || !root) return buf;
    var pt = 72 / 25.4;
    var x1 = h.mapa.x * pt, x2 = (h.mapa.x + h.mapa.w) * pt;
    var y1 = (h.H - h.mapa.y - h.mapa.h) * pt, y2 = (h.H - h.mapa.y) * pt;
    var vp = '/VP [<< /Type /Viewport /Name (Mapa) /BBox [' + [x1, y1, x2, y2].map(n6).join(' ') + ']' +
      ' /Measure << /Type /Measure /Subtype /GEO /Bounds [0 0 0 1 1 1 1 0]' +
      ' /GPTS [' + [g.s, g.o, g.n, g.o, g.n, g.e, g.s, g.e].map(n6).join(' ') + ']' +
      ' /LPTS [0 0 0 1 1 1 1 0]' +
      ' /GCS << /Type /PROJCS /EPSG 3857 /WKT (' + WKT + ') >> >> >>]';
    var num = m[1];
    var obj = '\n' + num + ' 0 obj\n<< /Type /Page\n' + m[2].replace(/\s+$/, '') + '\n' + vp + '\n>>\nendobj\n';
    var off = s.length + 1;   // por el salto de línea inicial
    var xref = s.length + obj.length;
    var cola = 'xref\n0 1\n0000000000 65535 f \n' + num + ' 1\n' + String(off).padStart(10, '0') + ' 00000 n \n' +
      'trailer\n<< /Size ' + size + ' /Root ' + root + (info ? ' /Info ' + info : '') + ' /Prev ' + prev[1] + ' >>\n' +
      'startxref\n' + xref + '\n%%EOF\n';
    var add = obj + cola, out = new Uint8Array(bytes.length + add.length);
    out.set(bytes);
    for (var k = 0; k < add.length; k++) out[bytes.length + k] = add.charCodeAt(k) & 255;
    return out.buffer;
  }
  var api = window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API;
  if (api) {
    var origSave = api.save;
    api.save = function (nombre) {
      if (!$('pro-geo') || !$('pro-geo').checked || !extra.bounds) return origSave.apply(this, arguments);
      try {
        var buf = georreferenciar(this.output('arraybuffer'));
        var url = URL.createObjectURL(new Blob([buf], { type: 'application/pdf' }));
        var a = document.createElement('a'); a.href = url; a.download = nombre || 'mapa.pdf';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
        return this;
      } catch (e) { console.error(e); return origSave.apply(this, arguments); }
    };
  }
  window.APACHETA_GEOPDF = georreferenciar;   // para pruebas

  /* =============== Guardar y abrir proyecto =============== */
  var CONTROLES = ['titulo', 'subtitulo', 'tamano', 'orientacion', 'pro-dpi', 'pro-escala', 'pro-grilla'];
  var CASILLAS = ['pro-curvas', 'pro-sombra', 'pro-aclarar', 'pro-geo'];
  function proyecto() {
    var est = window.APACHETA_ESTADO || {}, c = map.getCenter();
    var p = { app: 'apacheta-mapa-pro', version: 1, guardado: new Date().toISOString(),
      vista: { lat: c.lat, lng: c.lng, zoom: map.getZoom() }, controles: {}, casillas: {},
      fondo: est.fondo || null, capas: [], superposiciones: [], propios: est.propios || [], logo: extra.logoUrl || null };
    CONTROLES.forEach(function (id) { if ($(id)) p.controles[id] = $(id).value; });
    CASILLAS.forEach(function (id) { if ($(id)) p.casillas[id] = $(id).checked; });
    document.querySelectorAll('#capas input[type=checkbox]').forEach(function (i) { if (i.checked) p.capas.push(i.value || i.id); });
    document.querySelectorAll('#superposiciones input[type=checkbox]').forEach(function (i) { if (i.checked) p.superposiciones.push(i.value || i.id); });
    return p;
  }
  function nombreProyecto() {
    var t = ($('titulo').value || 'mapa').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return 'apacheta-' + (t || 'mapa') + '.apacheta.json';
  }
  $('pro-guardar').addEventListener('click', function () {
    var url = URL.createObjectURL(new Blob([JSON.stringify(proyecto(), null, 1)], { type: 'application/json' }));
    var a = document.createElement('a'); a.href = url; a.download = nombreProyecto();
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
    $('pro-proyecto-info').textContent = 'Proyecto guardado en tus descargas. Abrilo después con «Abrir proyecto». El track GPX no se guarda: volvé a cargarlo.';
  });
  $('pro-abrir').addEventListener('change', function () {
    var f = this.files[0]; if (!f) return;
    var input = this;
    f.text().then(function (txt) {
      var p = JSON.parse(txt);
      if (p.app !== 'apacheta-mapa-pro') throw new Error('formato');
      CONTROLES.forEach(function (id) {
        if ($(id) && p.controles[id] !== undefined) {
          $(id).value = p.controles[id];
          $(id).dispatchEvent(new Event(/titulo/.test(id) ? 'input' : 'change', { bubbles: true }));
        }
      });
      CASILLAS.forEach(function (id) {
        if ($(id) && p.casillas[id] !== undefined && $(id).checked !== p.casillas[id]) { $(id).checked = p.casillas[id]; $(id).dispatchEvent(new Event('change', { bubbles: true })); }
      });
      if (p.fondo) {
        var r = document.querySelector('#fondos input[value="' + p.fondo + '"]');
        if (r && !r.checked) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }
      }
      [['#capas', p.capas], ['#superposiciones', p.superposiciones]].forEach(function (par) {
        document.querySelectorAll(par[0] + ' input[type=checkbox]').forEach(function (i) {
          var on = par[1].indexOf(i.value || i.id) >= 0;
          if (i.checked !== on) { i.checked = on; i.dispatchEvent(new Event('change', { bubbles: true })); }
        });
      });
      if (window.APACHETA_ESTADO && Array.isArray(p.propios)) {
        window.APACHETA_ESTADO.propios.length = 0;
        p.propios.forEach(function (x) { window.APACHETA_ESTADO.propios.push(x); });
        if (window.APACHETA_REDIBUJAR) window.APACHETA_REDIBUJAR();
      }
      if (p.logo) {
        var im = new Image();
        im.onload = function () { extra.logo = im; extra.logoUrl = p.logo; $('pro-logo-info').textContent = 'Logo del proyecto cargado.'; vistaLogo(); };
        im.src = p.logo;
      }
      if (p.vista) map.setView([p.vista.lat, p.vista.lng], p.vista.zoom);
      $('pro-proyecto-info').textContent = 'Proyecto abierto: ' + (p.controles.titulo || 'sin título') + '.';
    }).catch(function () {
      $('pro-proyecto-info').textContent = 'Ese archivo no es un proyecto de Apacheta.';
    }).then(function () { input.value = ''; });
  });

  /* =============== Comentarios para mejorar la Pro =============== */
  $('pro-comentario-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var texto = $('pro-comentario').value.trim(), info = $('pro-comentario-info');
    if (texto.length < 5) { info.textContent = 'Contanos un poco más.'; return; }
    var btn = this.querySelector('button'); btn.disabled = true; info.textContent = 'Enviando…';
    var codigo = ''; try { codigo = localStorage.getItem('apacheta-pro-codigo') || ''; } catch (x) {}
    fetch(API + '/pro/comentario', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto: texto, contacto: $('pro-comentario-contacto').value.trim(), pro: !!codigo }) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j.ok) { info.textContent = '¡Gracias! Lo leemos todo y lo usamos para mejorar la herramienta.'; $('pro-comentario').value = ''; }
        else info.textContent = j.error === 'limite' ? 'Ya nos dejaste varios comentarios hoy. ¡Gracias!' : 'No se pudo enviar. Probá de nuevo más tarde.';
      })
      .catch(function () { info.textContent = 'No se pudo enviar. Probá de nuevo más tarde.'; })
      .then(function () { btn.disabled = false; });
  });
})();
