/* Apacheta · Territorio en datos Pro
   Cruces de variables, área de estudio, datos propios, mapa de aportes compartido, descargas e informe PDF. */
(function () {
  'use strict';
  var API = 'https://apacheta-pro.apacheta-cartografia.workers.dev';
  var CLAVE_COD = 'apacheta-pro-codigo', CLAVE_MC = 'apacheta-mapeos';
  var $ = function (id) { return document.getElementById(id); };
  var V = CS.VARIABLES;
  var codigo = '';
  function guardarLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function leerLS(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v === null ? d : v; } catch (e) { return d; } }
  function msg(id, t) { $(id).textContent = t || ''; $(id).hidden = !t; }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  $('fuente').textContent = CS.fuenteHTML();

  /* ================= Código Pro ================= */
  function activar(c) {
    return fetch(API + '/pro/estado?c=' + encodeURIComponent(c)).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.ok) throw new Error('codigo');
      codigo = c; try { localStorage.setItem(CLAVE_COD, c); } catch (e) {}
      $('puerta').hidden = true;
    });
  }
  $('form-codigo').addEventListener('submit', function (e) {
    e.preventDefault();
    var c = $('codigo').value.trim().toUpperCase();
    $('estado-codigo').textContent = 'Verificando…';
    activar(c).catch(function () { $('estado-codigo').textContent = 'Ese código no es válido. Revisalo o escribinos.'; });
  });
  (function () { var c = ''; try { c = localStorage.getItem(CLAVE_COD) || ''; } catch (e) {} if (c) { $('codigo').value = c; activar(c).catch(function () {}); } })();

  /* ================= Variables propias ================= */
  var USUARIO = {};          // clave 'u:nombre' -> { nombre, nivel: 'radio'|'depto'|'cuenta', datos: {codigo: valor} }
  function valorDe(f, clave) {
    if (clave.indexOf('u:') === 0) {
      var u = USUARIO[clave]; if (!u) return null;
      var c = f.properties.c;
      var k = u.nivel === 'depto' && c.length === 9 ? c.slice(0, 5) : c;
      var v = u.datos[k];
      return v === undefined ? null : v;
    }
    return f.properties[clave];
  }
  function etiqueta(clave) { return clave.indexOf('u:') === 0 ? (USUARIO[clave] ? USUARIO[clave].nombre : clave) : V[clave][0]; }
  function fmt(clave, v) {
    if (clave.indexOf('u:') === 0) return v === null || v === undefined ? 's/d' : (+v).toLocaleString('es-AR', { maximumFractionDigits: 2 });
    return CS.formato(clave, v);
  }
  function llenarSelects() {
    ['variable', 'cx', 'cy'].forEach(function (id) {
      var s = $(id), prev = s.value;
      var h = '<optgroup label="Censo 2022">';
      Object.keys(V).forEach(function (k) { h += '<option value="' + k + '">' + V[k][0] + '</option>'; });
      h += '</optgroup>';
      var us = Object.keys(USUARIO);
      if (us.length) { h += '<optgroup label="Tus datos">'; us.forEach(function (k) { h += '<option value="' + esc(k) + '">' + esc(USUARIO[k].nombre) + '</option>'; }); h += '</optgroup>'; }
      s.innerHTML = h;
      if (prev) s.value = prev;
    });
    if (!$('cy').value || $('cy').value === $('cx').value) $('cy').value = 'univ';
  }

  /* ================= Mapa ================= */
  var cruce = null;          // { x, y, cx:[t1,t2], cy:[t1,t2] }
  var BIV = ['#e8e8e8', '#e4acac', '#c85a5a', '#b0d5df', '#ad9ea5', '#985356', '#64acbe', '#627f8c', '#574249'];
  function colorBivar(f) {
    var x = valorDe(f, cruce.x), y = valorDe(f, cruce.y);
    if (x === null || y === null || x === undefined || y === undefined) return CS.SIN_DATO;
    var i = x < cruce.tx[0] ? 0 : x < cruce.tx[1] ? 1 : 2, j = y < cruce.ty[0] ? 0 : y < cruce.ty[1] ? 1 : 2;
    return BIV[j * 3 + i];
  }
  function tercil(vals) {
    var v = vals.filter(function (x) { return x !== null && x !== undefined && !isNaN(x); }).sort(function (a, b) { return a - b; });
    if (!v.length) return [0, 0];
    return [v[Math.floor(v.length / 3)], v[Math.floor(v.length * 2 / 3)]];
  }

  var M = CSMapa.crear({
    variable: 'nbi',
    colorDe: function (f, e) { return cruce && cruce.tx ? colorBivar(f) : CS.colorDe(valorDe(f, e.variable), e.cortes); },
    bloquearClic: function () { return modoArea !== null || modoCirculo; },
    leyenda: function (e) {
      if (cruce) {
        var h = '<b>Cruce</b><div style="display:flex;gap:8px;align-items:flex-end"><div><div class="bivar">';
        [2, 1, 0].forEach(function (j) { [0, 1, 2].forEach(function (i) { h += '<i style="background:' + BIV[j * 3 + i] + '"></i>'; }); });
        h += '</div></div><div style="font-size:11px;line-height:1.3">↑ ' + esc(etiqueta(cruce.y)) + '<br>→ ' + esc(etiqueta(cruce.x)) + '</div></div>';
        return h;
      }
      if (e.variable.indexOf('u:') === 0) {
        var cs = e.cortes, pal = CS.PALETA.slice(CS.PALETA.length - cs.length - 1);
        var out = '<b>' + esc(etiqueta(e.variable)) + '</b>';
        for (var i = 0; i <= cs.length; i++) out += '<div class="ley-fila"><i style="background:' + pal[i] + '"></i>' + (i === 0 ? 'menos de ' + fmt(e.variable, cs[0]) : i === cs.length ? fmt(e.variable, cs[i - 1]) + ' o más' : fmt(e.variable, cs[i - 1]) + ' a ' + fmt(e.variable, cs[i])) + '</div>';
        return out;
      }
      return CS.leyendaHTML(e.variable, e.cortes);
    },
    alCambiarNivel: function (e) {
      $('volver').hidden = e.nivel === 'pais';
      $('ficha').hidden = true;
      $('nivel').textContent = e.nivel === 'pais'
        ? 'Todo el país, por departamento. Tocá un departamento para cargar los radios censales de su provincia.'
        : 'Radios censales de ' + nombreProv(e.prov) + ' (' + e.radios.features.length.toLocaleString('es-AR') + '). Tocá un radio para ver su ficha completa.';
      if (e.nivel === 'prov') { prepararCentros(e.radios); recontarPuntos(); }
      limpiarArea();
      if (cruce) aplicarCruce();
    },
    alTocarRadio: function (f) { ficha(f); }
  });
  M.setValorDe(function (f, clave) { return valorDe(f, clave); });
  function nombreProv(cod) {
    if (!M.estado.deptos) return cod;
    var f = M.estado.deptos.features.find(function (x) { return x.properties.c.slice(0, 2) === cod; });
    return f ? f.properties.pv : cod;
  }

  $('volver').addEventListener('click', function () { M.mostrarPais(); M.map.setView([-38.5, -64], 4); });
  $('variable').addEventListener('change', function () { if (cruce) quitarCruce(); M.setVariable(this.value); });

  // Pestañas
  document.querySelectorAll('.pestanas button').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.pestanas button').forEach(function (x) { x.classList.toggle('activa', x === b); });
      document.querySelectorAll('.pagina').forEach(function (p) { p.hidden = p.id !== 'p-' + b.dataset.p; });
    });
  });

  /* ================= Ficha del radio ================= */
  function filasComparadas(fsArea, titulo) {
    var prov = M.estado.radios ? M.estado.radios.features : [];
    var pais = M.estado.deptos ? M.estado.deptos.features : [];
    var h = '<table class="tabla"><tr><th>Indicador</th><th>' + titulo + '</th><th>Provincia</th><th>País</th></tr>';
    Object.keys(V).forEach(function (k) {
      h += '<tr><td>' + V[k][0] + '</td><td>' + fmt(k, CS.agregar(fsArea, k)) + '</td><td>' + fmt(k, CS.agregar(prov, k)) + '</td><td>' + fmt(k, CS.agregar(pais, k)) + '</td></tr>';
    });
    Object.keys(USUARIO).forEach(function (k) {
      var vs = fsArea.map(function (f) { return valorDe(f, k); }).filter(function (x) { return x !== null; });
      var s = vs.reduce(function (a, b) { return a + b; }, 0);
      h += '<tr><td>' + esc(USUARIO[k].nombre) + ' (' + (USUARIO[k].nivel === 'cuenta' ? 'suma' : 'promedio') + ')</td><td>' + (vs.length ? fmt(k, USUARIO[k].nivel === 'cuenta' ? s : s / vs.length) : 's/d') + '</td><td></td><td></td></tr>';
    });
    return h + '</table>';
  }
  function ficha(f) {
    var p = f.properties;
    $('ficha').innerHTML = '<h3>Radio ' + p.c + '</h3><p class="ayuda" style="margin:0 0 8px">' + esc(M.nombreDepto(p.c)) + ' · ' + CS.formato('pob', p.pob) + ' hab. · ' + (p.km2 || 0).toLocaleString('es-AR') + ' km²</p>' + filasComparadas([f], 'Radio');
    $('ficha').hidden = false;
  }

  /* ================= Cruces ================= */
  function aplicarCruce() {
    if (!M.estado.radios && M.estado.nivel !== 'pais') return;
    var fs = featuresAnalisis();
    cruce.tx = tercil(fs.map(function (f) { return valorDe(f, cruce.x); }));
    cruce.ty = tercil(fs.map(function (f) { return valorDe(f, cruce.y); }));
    M.pintar();
    dibujarDispersion(fs);
  }
  function quitarCruce() {
    cruce = null; $('disp').hidden = true; $('cruce-res').innerHTML = ''; msg('cruce-msg', '');
    M.pintar();
  }
  $('cruzar').addEventListener('click', function () {
    var x = $('cx').value, y = $('cy').value;
    if (x === y) { msg('cruce-msg', 'Elegí dos variables distintas.'); return; }
    msg('cruce-msg', M.estado.nivel === 'pais' ? 'Cruce por departamento en todo el país. Tocá un departamento para cruzar a nivel de radio.' : '');
    cruce = { x: x, y: y }; aplicarCruce();
  });
  $('descruzar').addEventListener('click', quitarCruce);

  function pearson(xs, ys) {
    var n = xs.length; if (n < 3) return null;
    var mx = 0, my = 0; for (var i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; } mx /= n; my /= n;
    var sxy = 0, sxx = 0, syy = 0;
    for (i = 0; i < n; i++) { var a = xs[i] - mx, b = ys[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
  }
  function rangos(v) {
    var idx = v.map(function (x, i) { return [x, i]; }).sort(function (a, b) { return a[0] - b[0]; });
    var r = new Array(v.length);
    for (var i = 0; i < idx.length;) { var j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; var m = (i + j) / 2 + 1; for (var k = i; k <= j; k++) r[idx[k][1]] = m; i = j + 1; }
    return r;
  }
  function paresCruce(fs) {
    var xs = [], ys = [], ws = [];
    fs.forEach(function (f) { var x = valorDe(f, cruce.x), y = valorDe(f, cruce.y); if (x !== null && y !== null && x !== undefined && y !== undefined && !isNaN(x) && !isNaN(y)) { xs.push(+x); ys.push(+y); ws.push(f.properties.pob || 0); } });
    return { xs: xs, ys: ys, ws: ws };
  }
  function dibujarDispersion(fs, canvas) {
    var cv = canvas || $('disp'); cv.hidden = false;
    var P = paresCruce(fs), ctx = cv.getContext('2d'), W = cv.width, H = cv.height, m = { l: 62, r: 14, t: 14, b: 48 };
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    if (P.xs.length < 3) { ctx.fillStyle = '#5A625E'; ctx.font = '16px Montserrat,sans-serif'; ctx.fillText('No hay datos suficientes', 20, 40); $('cruce-res').innerHTML = ''; return null; }
    var x0 = Math.min.apply(null, P.xs), x1 = Math.max.apply(null, P.xs), y0 = Math.min.apply(null, P.ys), y1 = Math.max.apply(null, P.ys);
    if (x1 === x0) x1 = x0 + 1; if (y1 === y0) y1 = y0 + 1;
    var X = function (v) { return m.l + (v - x0) / (x1 - x0) * (W - m.l - m.r); }, Y = function (v) { return H - m.b - (v - y0) / (y1 - y0) * (H - m.t - m.b); };
    ctx.strokeStyle = '#DCDDD8'; ctx.lineWidth = 1; ctx.font = '12px Montserrat,sans-serif'; ctx.fillStyle = '#5A625E';
    for (var t = 0; t <= 4; t++) {
      var vx = x0 + (x1 - x0) * t / 4, vy = y0 + (y1 - y0) * t / 4;
      ctx.beginPath(); ctx.moveTo(X(vx), m.t); ctx.lineTo(X(vx), H - m.b); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(m.l, Y(vy)); ctx.lineTo(W - m.r, Y(vy)); ctx.stroke();
      ctx.textAlign = 'center'; ctx.fillText(fmt(cruce.x, vx), X(vx), H - m.b + 16);
      ctx.textAlign = 'right'; ctx.fillText(fmt(cruce.y, vy), m.l - 6, Y(vy) + 4);
    }
    ctx.fillStyle = 'rgba(154,63,28,.35)';
    for (var i = 0; i < P.xs.length; i++) { ctx.beginPath(); ctx.arc(X(P.xs[i]), Y(P.ys[i]), 2.6, 0, 6.3); ctx.fill(); }
    // recta de regresión
    var n = P.xs.length, mx = 0, my = 0; P.xs.forEach(function (v, i) { mx += v; my += P.ys[i]; }); mx /= n; my /= n;
    var sxy = 0, sxx = 0; P.xs.forEach(function (v, i) { sxy += (v - mx) * (P.ys[i] - my); sxx += (v - mx) * (v - mx); });
    var b = sxx ? sxy / sxx : 0, a = my - b * mx;
    ctx.strokeStyle = '#16201D'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(x0), Y(a + b * x0)); ctx.lineTo(X(x1), Y(a + b * x1)); ctx.stroke();
    ctx.fillStyle = '#16201D'; ctx.font = '600 13px Inter,sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(etiqueta(cruce.x), (W + m.l) / 2, H - 8);
    ctx.save(); ctx.translate(14, (H - m.b) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(etiqueta(cruce.y), 0, 0); ctx.restore();
    var r = pearson(P.xs, P.ys), rs = pearson(rangos(P.xs), rangos(P.ys));
    var fuerza = function (v) { var a = Math.abs(v); return a < 0.1 ? 'nula' : a < 0.3 ? 'débil' : a < 0.5 ? 'moderada' : a < 0.7 ? 'fuerte' : 'muy fuerte'; };
    var res = { n: n, r: r, rs: rs, b: b, a: a };
    if (!canvas) {
      $('cruce-res').innerHTML = '<p class="ayuda" style="margin:0">' + n.toLocaleString('es-AR') + ' unidades · correlación de Pearson <b>r = ' + (r === null ? 's/d' : r.toFixed(2)) + '</b> (' + (r === null ? '' : fuerza(r) + ', ' + (r >= 0 ? 'positiva' : 'negativa')) + ') · Spearman ρ = ' + (rs === null ? 's/d' : rs.toFixed(2)) + '. Correlación no implica causalidad: es un punto de partida para el análisis.</p>';
    }
    return res;
  }

  /* ================= Mi área ================= */
  var modoArea = null, modoCirculo = false, verts = [], capaArea = L.layerGroup().addTo(M.map), area = null; // area: {tipo, poly:[[lat,lon]], centro, km}
  function prepararCentros(g) {
    g.features.forEach(function (f) {
      if (f._ctr) return;
      var x0 = 180, x1 = -180, y0 = 90, y1 = -90;
      (function rec(c) { if (typeof c[0] === 'number') { if (c[0] < x0) x0 = c[0]; if (c[0] > x1) x1 = c[0]; if (c[1] < y0) y0 = c[1]; if (c[1] > y1) y1 = c[1]; } else c.forEach(rec); })(f.geometry.coordinates);
      f._ctr = [(y0 + y1) / 2, (x0 + x1) / 2]; f._bb = [x0, y0, x1, y1];
    });
  }
  function dentro(pt, poly) { // pt [lat,lon], poly [[lat,lon]...]
    var x = pt[1], y = pt[0], ins = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][1], yi = poly[i][0], xj = poly[j][1], yj = poly[j][0];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) ins = !ins;
    }
    return ins;
  }
  function distKm(a, b) {
    var R = 6371, dLa = (b[0] - a[0]) * Math.PI / 180, dLo = (b[1] - a[1]) * Math.PI / 180;
    var s = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
    return 2 * R * Math.asin(Math.sqrt(s));
  }
  function featuresArea() {
    if (!area || !M.estado.radios) return null;
    return M.estado.radios.features.filter(function (f) {
      return area.tipo === 'poligono' ? dentro(f._ctr, area.poly) : distKm(f._ctr, area.centro) <= area.km;
    });
  }
  function featuresAnalisis() {
    if (M.estado.nivel === 'pais') return M.estado.deptos.features;
    return featuresArea() || M.estado.radios.features;
  }
  function limpiarArea() { capaArea.clearLayers(); area = null; verts = []; modoArea = null; modoCirculo = false; $('terminar').hidden = true; $('area-res').innerHTML = ''; M.map.getContainer().style.cursor = ''; }
  function requiereProvincia() { if (M.estado.nivel !== 'prov') { $('area-res').innerHTML = '<div class="mensaje">Primero tocá un departamento para cargar los radios de su provincia.</div>'; return true; } return false; }
  $('dibujar').addEventListener('click', function () {
    if (requiereProvincia()) return;
    limpiarArea(); modoArea = 'dibujando'; $('terminar').hidden = false; M.map.getContainer().style.cursor = 'crosshair';
    $('area-res').innerHTML = '<p class="ayuda">Tocá el mapa para marcar los vértices. Cuando termines, tocá «Terminar polígono».</p>';
  });
  $('circulo').addEventListener('click', function () {
    if (requiereProvincia()) return;
    limpiarArea(); modoCirculo = true; M.map.getContainer().style.cursor = 'crosshair';
    $('area-res').innerHTML = '<p class="ayuda">Tocá el centro del círculo en el mapa.</p>';
  });
  $('limpiar-area').addEventListener('click', function () { limpiarArea(); if (cruce) aplicarCruce(); });
  M.map.on('click', function (e) {
    if (modoArea === 'dibujando') {
      verts.push([e.latlng.lat, e.latlng.lng]);
      capaArea.clearLayers();
      L.polyline(verts, { color: '#16201D', weight: 2, dashArray: '5 4' }).addTo(capaArea);
      verts.forEach(function (v) { L.circleMarker(v, { radius: 4, color: '#16201D', fillColor: '#fff', fillOpacity: 1, weight: 2 }).addTo(capaArea); });
    } else if (modoCirculo) {
      modoCirculo = false; M.map.getContainer().style.cursor = '';
      var km = Math.max(0.1, parseFloat($('km').value) || 1);
      area = { tipo: 'circulo', centro: [e.latlng.lat, e.latlng.lng], km: km };
      capaArea.clearLayers(); L.circle(e.latlng, { radius: km * 1000, color: '#16201D', weight: 2, fill: false }).addTo(capaArea);
      resumenArea();
    }
  });
  $('terminar').addEventListener('click', function () {
    if (verts.length < 3) { $('area-res').innerHTML = '<div class="mensaje">Marcá al menos 3 vértices.</div>'; return; }
    modoArea = null; $('terminar').hidden = true; M.map.getContainer().style.cursor = '';
    area = { tipo: 'poligono', poly: verts.slice() };
    capaArea.clearLayers(); L.polygon(verts, { color: '#16201D', weight: 2, fill: false }).addTo(capaArea);
    resumenArea();
  });
  function resumenArea() {
    var fs = featuresArea() || [];
    var titulo = area.tipo === 'circulo' ? 'Círculo de ' + area.km.toLocaleString('es-AR') + ' km' : 'Polígono dibujado';
    $('area-res').innerHTML = '<p class="ayuda"><b>' + titulo + ':</b> ' + fs.length + ' radios, ' + CS.formato('pob', CS.agregar(fs, 'pob')) + ' habitantes. Valores aproximados (ponderados por hogares o población).</p>' + filasComparadas(fs, 'Tu área');
    if (cruce) aplicarCruce();
  }

  /* ================= Mis datos ================= */
  function parseCSV(txt) {
    txt = txt.replace(/^﻿/, '');
    var primera = txt.split(/\r?\n/)[0];
    var sep = (primera.match(/;/g) || []).length > (primera.match(/,/g) || []).length ? ';' : (primera.indexOf('\t') >= 0 ? '\t' : ',');
    var filas = [], fila = [], campo = '', q = false;
    for (var i = 0; i < txt.length; i++) {
      var ch = txt[i];
      if (q) { if (ch === '"') { if (txt[i + 1] === '"') { campo += '"'; i++; } else q = false; } else campo += ch; }
      else if (ch === '"') q = true;
      else if (ch === sep) { fila.push(campo); campo = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && txt[i + 1] === '\n') i++; fila.push(campo); filas.push(fila); fila = []; campo = ''; }
      else campo += ch;
    }
    if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
    filas = filas.filter(function (f) { return f.some(function (c) { return c.trim() !== ''; }); });
    return { cab: (filas.shift() || []).map(function (c) { return c.trim(); }), filas: filas, sep: sep };
  }
  function num(v, sep) {
    if (v === undefined || v === null) return null;
    v = String(v).trim(); if (!v) return null;
    if (sep === ';' || /^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(v) || /^-?\d+,\d+$/.test(v)) v = v.replace(/\./g, '').replace(',', '.');
    var n = parseFloat(v); return isNaN(n) ? null : n;
  }
  function listarDatos() {
    var h = '';
    Object.keys(USUARIO).forEach(function (k) { h += '<span class="chip">' + esc(USUARIO[k].nombre) + '</span>'; });
    $('datos-lista').innerHTML = h ? '<p class="ayuda" style="margin:0 0 4px">Variables cargadas (elegilas en «Mapa» o «Cruces»):</p>' + h : '';
    llenarSelects();
  }
  $('csv-cod').addEventListener('change', function () {
    var f = this.files[0]; if (!f) return; var input = this;
    f.text().then(function (txt) {
      var t = parseCSV(txt);
      var ic = t.cab.findIndex(function (c) { return /^(cod|codigo|código|link|radio|id|id_geo|cod_2022|depto|departamento)/i.test(c); });
      if (ic < 0) ic = 0;
      var muestra = t.filas.slice(0, 50).map(function (r) { return String(r[ic] || '').replace(/\D/g, ''); });
      var largo = muestra.filter(Boolean).reduce(function (a, s) { return Math.max(a, s.length); }, 0);
      var nivel = largo >= 8 ? 'radio' : 'depto', ancho = nivel === 'radio' ? 9 : 5;
      var nuevas = 0, unidas = 0;
      t.cab.forEach(function (nombre, j) {
        if (j === ic) return;
        var datos = {}, n = 0;
        t.filas.forEach(function (r) { var c = String(r[ic] || '').replace(/\D/g, ''); if (!c) return; c = c.padStart(ancho, '0'); var v = num(r[j], t.sep); if (v !== null) { datos[c] = v; n++; } });
        if (n < t.filas.length * 0.5) return; // columna no numérica
        USUARIO['u:' + nombre] = { nombre: nombre, nivel: nivel, datos: datos }; nuevas++; unidas = Math.max(unidas, n);
      });
      msg('datos-msg', nuevas ? 'Listo: ' + nuevas + ' variable(s) por ' + (nivel === 'radio' ? 'radio censal' : 'departamento') + ' (' + unidas.toLocaleString('es-AR') + ' filas con dato).' : 'No encontré columnas numéricas. La primera columna (o una llamada «codigo») tiene que tener el código y las demás, números.');
      listarDatos();
    }).catch(function () { msg('datos-msg', 'No se pudo leer el archivo.'); }).then(function () { input.value = ''; });
  });

  var PUNTOS = [], capaPuntos = L.layerGroup().addTo(M.map);
  function dibujarPuntos(lista, color) {
    lista.slice(0, 20000).forEach(function (p) { L.circleMarker([p[0], p[1]], { radius: 3.5, color: '#fff', weight: 1, fillColor: color || '#16201D', fillOpacity: .9, pane: 'markerPane' }).addTo(capaPuntos); });
  }
  function enRadio(pt, f) {
    var b = f._bb; if (pt[1] < b[0] || pt[1] > b[2] || pt[0] < b[1] || pt[0] > b[3]) return false;
    var g = f.geometry, polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (var i = 0; i < polys.length; i++) {
      var anillo = polys[i][0].map(function (c) { return [c[1], c[0]]; });
      if (dentro(pt, anillo)) { var hueco = false; for (var h = 1; h < polys[i].length; h++) if (dentro(pt, polys[i][h].map(function (c) { return [c[1], c[0]]; }))) hueco = true; if (!hueco) return true; }
    }
    return false;
  }
  function contarEnRadios(lista, nombre) {
    if (M.estado.nivel !== 'prov' || !lista.length) return;
    var fs = M.estado.radios.features, cuenta = {};
    lista.forEach(function (p) { for (var i = 0; i < fs.length; i++) if (enRadio(p, fs[i])) { var c = fs[i].properties.c; cuenta[c] = (cuenta[c] || 0) + 1; break; } });
    var tasa = {};
    fs.forEach(function (f) { var c = f.properties.c, n = cuenta[c] || 0; cuenta[c] = n; tasa[c] = f.properties.pob ? n * 1000 / f.properties.pob : null; });
    USUARIO['u:' + nombre] = { nombre: nombre, nivel: 'cuenta', datos: cuenta };
    USUARIO['u:' + nombre + ' cada 1.000 hab.'] = { nombre: nombre + ' cada 1.000 hab.', nivel: 'radio', datos: tasa };
  }
  function recontarPuntos() { if (PUNTOS.length) { contarEnRadios(PUNTOS, 'Tus puntos'); listarDatos(); } }
  $('puntos').addEventListener('change', function () {
    var f = this.files[0]; if (!f) return; var input = this;
    f.text().then(function (txt) {
      var lista = [];
      if (/\.(geo)?json$/i.test(f.name)) {
        var g = JSON.parse(txt);
        (g.features || []).forEach(function (ft) { if (ft.geometry && ft.geometry.type === 'Point') lista.push([ft.geometry.coordinates[1], ft.geometry.coordinates[0]]); });
      } else {
        var t = parseCSV(txt);
        var ila = t.cab.findIndex(function (c) { return /^(lat|latitud|latitude|y)$/i.test(c); }), ilo = t.cab.findIndex(function (c) { return /^(lon|lng|long|longitud|longitude|x)$/i.test(c); });
        if (ila < 0 || ilo < 0) throw new Error('columnas');
        t.filas.forEach(function (r) { var la = num(r[ila], t.sep), lo = num(r[ilo], t.sep); if (la !== null && lo !== null && Math.abs(la) <= 90 && Math.abs(lo) <= 180) lista.push([la, lo]); });
      }
      if (!lista.length) throw new Error('vacio');
      PUNTOS = PUNTOS.concat(lista); dibujarPuntos(lista);
      contarEnRadios(PUNTOS, 'Tus puntos'); listarDatos();
      msg('datos-msg', lista.length.toLocaleString('es-AR') + ' puntos cargados.' + (M.estado.nivel === 'prov' ? ' Ya están contados por radio: elegí «Tus puntos» en el mapa o en los cruces.' : ' Tocá un departamento para contarlos por radio.'));
    }).catch(function (e) {
      msg('datos-msg', e.message === 'columnas' ? 'El CSV tiene que tener columnas «lat» y «lon» (o latitud y longitud).' : 'No se pudieron leer puntos de ese archivo.');
    }).then(function () { input.value = ''; });
  });

  /* ================= Mapa de aportes ================= */
  var capaMC = L.layerGroup().addTo(M.map);
  var COLS = ['#C0392B', '#2E7D6B', '#D68910', '#7D3C98', '#1F6FEB', '#4A524E', '#B03A6E', '#117A65'];
  function misMapeos() { return leerLS(CLAVE_MC, []); }
  function linkPublico(id) { return location.origin + location.pathname.replace(/[^/]*$/, '') + 'mapeo.html?p=' + id; }
  function listarMapeos() {
    var ms = misMapeos();
    if (!ms.length) { $('mc-mios').innerHTML = ''; return; }
    var h = '<p class="ayuda" style="margin:6px 0"><b>Tus mapas de aportes</b> (guardados en este navegador; anotá el link de administración si vas a usar otra compu):</p>';
    ms.forEach(function (m, i) {
      h += '<div class="ficha" style="margin-bottom:8px"><b>' + esc(m.titulo) + '</b><p class="ayuda" style="margin:4px 0">Link para compartir:</p><div class="linkbox">' + esc(linkPublico(m.id)) + '</div>' +
        '<div class="fila" style="margin-top:8px"><button class="btn btn-borde" data-a="copiar" data-i="' + i + '">Copiar link</button><button class="btn btn-primario" data-a="ver" data-i="' + i + '">Ver aportes</button></div>' +
        '<div class="fila" style="margin-top:6px"><button class="btn btn-borde" data-a="csv" data-i="' + i + '">CSV</button><button class="btn btn-borde" data-a="geo" data-i="' + i + '">GeoJSON</button></div></div>';
    });
    $('mc-mios').innerHTML = h;
  }
  listarMapeos();
  $('mc-crear').addEventListener('click', function () {
    var cats = $('mc-cats').value.split(/\n/).map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 8);
    if (!cats.length) { msg('mc-msg', 'Escribí al menos una categoría.'); return; }
    var c = M.map.getCenter(), btn = this; btn.disabled = true; msg('mc-msg', 'Creando…');
    fetch(API + '/mc/crear', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      c: codigo, titulo: $('mc-titulo').value, pregunta: $('mc-pregunta').value, categorias: cats, publico: $('mc-publico').checked,
      centro: [+c.lat.toFixed(5), +c.lng.toFixed(5), M.map.getZoom()] }) })
      .then(function (r) { return r.json(); }).then(function (j) {
        if (!j.ok) throw new Error(j.error || 'error');
        var ms = misMapeos(); ms.unshift({ id: j.id, admin: j.admin, titulo: $('mc-titulo').value || 'Mapa de aportes', categorias: cats }); guardarLS(CLAVE_MC, ms);
        msg('mc-msg', 'Listo. Compartí el link: cada aporte queda guardado y lo ves con «Ver aportes».'); listarMapeos();
      }).catch(function (e) { msg('mc-msg', e.message === 'limite' ? 'Llegaste al máximo de 20 mapas de aportes por código.' : 'No se pudo crear el mapa. Probá de nuevo.'); })
      .then(function () { btn.disabled = false; });
  });
  var aportesCache = {};
  function traerAportes(m) {
    return fetch(API + '/mc/aportes?p=' + m.id + '&k=' + m.admin).then(function (r) { return r.json(); }).then(function (j) { if (!j.ok) throw new Error(); aportesCache[m.id] = j.aportes; return j.aportes; });
  }
  function bajar(nombre, contenido, tipo) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([contenido], { type: tipo }));
    a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
  }
  $('mc-mios').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var m = misMapeos()[+b.dataset.i]; if (!m) return;
    if (b.dataset.a === 'copiar') { navigator.clipboard && navigator.clipboard.writeText(linkPublico(m.id)); b.textContent = 'Copiado'; return; }
    b.disabled = true;
    traerAportes(m).then(function (ap) {
      if (b.dataset.a === 'ver') {
        capaMC.clearLayers();
        ap.forEach(function (a) {
          var k = m.categorias.indexOf(a.c);
          L.circleMarker([a.la, a.lo], { radius: 6, color: '#fff', weight: 2, fillColor: COLS[k < 0 ? 5 : k], fillOpacity: 1, pane: 'markerPane' })
            .bindPopup('<b>' + esc(a.c) + '</b><br>' + esc(a.t) + '<br><small>' + esc(a.f || '') + '</small>').addTo(capaMC);
        });
        if (ap.length) M.map.fitBounds(L.latLngBounds(ap.map(function (a) { return [a.la, a.lo]; })).pad(0.2));
        contarEnRadios(ap.map(function (a) { return [a.la, a.lo]; }), 'Aportes: ' + m.titulo); listarDatos();
        msg('mc-msg', ap.length + ' aportes.' + (M.estado.nivel === 'prov' ? ' También quedan contados por radio como variable.' : ''));
      } else if (b.dataset.a === 'csv') {
        var csv = 'latitud,longitud,categoria,comentario,fecha\n' + ap.map(function (a) { return [a.la, a.lo, '"' + a.c.replace(/"/g, '""') + '"', '"' + (a.t || '').replace(/"/g, '""') + '"', a.f || ''].join(','); }).join('\n');
        bajar('mapeo-' + m.id + '.csv', '﻿' + csv, 'text/csv');
      } else {
        bajar('mapeo-' + m.id + '.geojson', JSON.stringify({ type: 'FeatureCollection', features: ap.map(function (a) { return { type: 'Feature', geometry: { type: 'Point', coordinates: [a.lo, a.la] }, properties: { categoria: a.c, comentario: a.t, fecha: a.f } }; }) }), 'application/geo+json');
      }
    }).catch(function () { msg('mc-msg', 'No se pudieron traer los aportes.'); }).then(function () { b.disabled = false; });
  });

  /* ================= Exportar ================= */
  function filasExport() {
    if (M.estado.nivel !== 'prov') return null;
    return featuresArea() || M.estado.radios.features;
  }
  function columnas() { return Object.keys(V).concat(Object.keys(USUARIO)); }
  function valorPlano(f, k) { var v = valorDe(f, k); if (v === null || v === undefined) return ''; return V[k] && V[k][1] === 'pm' ? (v / 10) : v; }
  $('bajar-csv').addEventListener('click', function () {
    var fs = filasExport(); if (!fs) { msg('inf-msg', 'Primero cargá una provincia tocando un departamento.'); return; }
    var cols = columnas();
    var csv = 'codigo_radio,departamento,' + cols.map(function (k) { return '"' + (V[k] ? V[k][0] + (V[k][1] === 'pm' ? ' (%)' : '') : etiqueta(k)).replace(/"/g, '""') + '"'; }).join(',') + '\n';
    csv += fs.map(function (f) { return ['"' + f.properties.c + '"', '"' + M.nombreDepto(f.properties.c).replace(/"/g, '""') + '"'].concat(cols.map(function (k) { return valorPlano(f, k); })).join(','); }).join('\n');
    bajar('territorio-radios.csv', '﻿' + csv, 'text/csv'); msg('inf-msg', fs.length + ' radios exportados.');
  });
  $('bajar-geojson').addEventListener('click', function () {
    var fs = filasExport(); if (!fs) { msg('inf-msg', 'Primero cargá una provincia tocando un departamento.'); return; }
    var cols = columnas();
    var out = { type: 'FeatureCollection', features: fs.map(function (f) { var p = { codigo_radio: f.properties.c }; cols.forEach(function (k) { p[V[k] ? k : etiqueta(k)] = valorPlano(f, k); }); return { type: 'Feature', geometry: f.geometry, properties: p }; }) };
    bajar('territorio-radios.geojson', JSON.stringify(out), 'application/geo+json'); msg('inf-msg', fs.length + ' radios exportados.');
  });

  /* ================= Informe PDF ================= */
  function mapaCanvas(fs, ancho, alto) {
    var cv = document.createElement('canvas'); cv.width = ancho; cv.height = alto;
    var ctx = cv.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, ancho, alto);
    var merc = function (lat) { return Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)); };
    var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    (function () { fs.forEach(function (f) { (function rec(c) { if (typeof c[0] === 'number') { var y = merc(c[1]); if (c[0] < x0) x0 = c[0]; if (c[0] > x1) x1 = c[0]; if (y < y0) y0 = y; if (y > y1) y1 = y; } else c.forEach(rec); })(f.geometry.coordinates); }); })();
    var kx = (x1 - x0) * Math.PI / 180, ky = (y1 - y0), esc2 = Math.min((ancho - 20) / kx, (alto - 20) / ky);
    var ox = (ancho - kx * esc2) / 2, oy = (alto - ky * esc2) / 2;
    var P = function (c) { return [ox + (c[0] - x0) * Math.PI / 180 * esc2, alto - oy - (merc(c[1]) - y0) * esc2]; };
    var cortes = M.estado.cortes;
    fs.forEach(function (f) {
      ctx.fillStyle = cruce ? colorBivar(f) : CS.colorDe(valorDe(f, M.estado.variable), cortes);
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = fs.length > 3000 ? 0.2 : 0.5;
      var polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      ctx.beginPath();
      polys.forEach(function (pl) { pl.forEach(function (an) { an.forEach(function (c, i) { var p = P(c); if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath(); }); });
      ctx.fill('evenodd'); ctx.stroke();
    });
    if (area) {
      ctx.strokeStyle = '#16201D'; ctx.lineWidth = 2.5; ctx.beginPath();
      if (area.tipo === 'poligono') { area.poly.forEach(function (v, i) { var p = P([v[1], v[0]]); if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath(); }
      else { var c = P([area.centro[1], area.centro[0]]), r = area.km / 111.32 / Math.cos(area.centro[0] * Math.PI / 180) * Math.PI / 180 * esc2; ctx.arc(c[0], c[1], r, 0, 6.3); }
      ctx.stroke();
    }
    return cv;
  }
  $('informe').addEventListener('click', function () {
    if (!window.jspdf) { msg('inf-msg', 'No cargó el generador de PDF. Revisá la conexión.'); return; }
    var enPais = M.estado.nivel === 'pais';
    var fsMapa = enPais ? M.estado.deptos.features : (featuresArea() || M.estado.radios.features);
    var fsArea = enPais ? M.estado.deptos.features : (featuresArea() || M.estado.radios.features);
    var lugar = enPais ? 'Argentina (por departamento)' : (area ? 'Área de estudio en ' + nombreProv(M.estado.prov) : nombreProv(M.estado.prov));
    msg('inf-msg', 'Armando el informe…');
    setTimeout(function () {
      try {
        var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' }), W = 210, y = 18;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(22, 32, 29);
        doc.text($('inf-titulo').value || 'Diagnóstico sociodemográfico', 14, y); y += 7;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(90, 98, 94);
        doc.text(lugar + ' · Censo 2022 · ' + new Date().toLocaleDateString('es-AR'), 14, y); y += 4;
        doc.setTextColor(154, 63, 28); doc.text('Apacheta Cartografía', W - 14, 12, { align: 'right' });
        // mapa
        var cv = mapaCanvas(fsMapa, 1600, 1100);
        doc.addImage(cv.toDataURL('image/png'), 'PNG', 14, y + 2, 182, 125); y += 130;
        doc.setFontSize(9); doc.setTextColor(22, 32, 29);
        if (cruce) {
          doc.setFont('helvetica', 'bold'); doc.text('Mapa bivariado: ' + etiqueta(cruce.x) + ' (→) y ' + etiqueta(cruce.y) + ' (↑), en terciles.', 14, y); doc.setFont('helvetica', 'normal');
          [0, 1, 2].forEach(function (j) { [0, 1, 2].forEach(function (i) { var c = BIV[j * 3 + i]; doc.setFillColor(parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)); doc.rect(W - 34 + i * 6, y - 14 + (2 - j) * 6, 6, 6, 'F'); }); });
          y += 6;
        } else {
          doc.setFont('helvetica', 'bold'); doc.text(etiqueta(M.estado.variable), 14, y); doc.setFont('helvetica', 'normal'); y += 5;
          var cs = M.estado.cortes, pal = CS.PALETA.slice(CS.PALETA.length - cs.length - 1), x = 14;
          for (var i = 0; i <= cs.length; i++) {
            var c = pal[i]; doc.setFillColor(parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)); doc.rect(x, y - 3, 5, 4, 'F');
            var t = i === 0 ? '< ' + fmt(M.estado.variable, cs[0]) : i === cs.length ? '≥ ' + fmt(M.estado.variable, cs[i - 1]) : fmt(M.estado.variable, cs[i - 1]) + ' a ' + fmt(M.estado.variable, cs[i]);
            doc.text(t.replace('≥', '>='), x + 6, y); x += 6 + doc.getTextWidth(t) + 6; if (x > 170) { x = 14; y += 5; }
          }
          y += 7;
        }
        // tabla
        doc.addPage(); y = 18;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text('Indicadores', 14, y); y += 7;
        doc.setFontSize(9); doc.text('Indicador', 14, y); doc.text(area ? 'Tu área' : 'Zona', 128, y, { align: 'right' }); doc.text('Provincia', 160, y, { align: 'right' }); doc.text('País', 196, y, { align: 'right' }); y += 2;
        doc.setDrawColor(220, 221, 216); doc.line(14, y, 196, y); y += 5; doc.setFont('helvetica', 'normal');
        var prov = enPais ? [] : M.estado.radios.features, pais = M.estado.deptos.features;
        Object.keys(V).forEach(function (k) {
          doc.text(V[k][0], 14, y); doc.text(fmt(k, CS.agregar(fsArea, k)), 128, y, { align: 'right' });
          doc.text(enPais ? '' : fmt(k, CS.agregar(prov, k)), 160, y, { align: 'right' }); doc.text(fmt(k, CS.agregar(pais, k)), 196, y, { align: 'right' });
          y += 5.6;
        });
        if (cruce) {
          var dc = document.createElement('canvas'); dc.width = 900; dc.height = 620;
          var r = dibujarDispersion(fsArea, dc);
          y += 6; doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text('Cruce de variables', 14, y); y += 2;
          doc.addImage(dc.toDataURL('image/png'), 'PNG', 14, y, 120, 83);
          doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
          if (r) doc.text(doc.splitTextToSize(r.n + ' unidades. Pearson r = ' + (r.r === null ? 's/d' : r.r.toFixed(2)) + '. Spearman = ' + (r.rs === null ? 's/d' : r.rs.toFixed(2)) + '. La correlación no implica causalidad.', 58), 138, y + 8);
          y += 88;
        }
        doc.setFontSize(7.5); doc.setTextColor(90, 98, 94);
        doc.text(doc.splitTextToSize(CS.fuenteHTML() + ' Los valores de áreas son aproximados: promedios ponderados por hogares o población de los radios cuyo centro cae dentro del área.', 182), 14, 285 - 10);
        doc.save('informe-territorio.pdf');
        msg('inf-msg', 'Informe descargado.');
      } catch (e) { console.error(e); msg('inf-msg', 'No se pudo generar el informe.'); }
    }, 30);
  });

  llenarSelects();
  $('variable').value = 'nbi'; $('cx').value = 'nbi'; $('cy').value = 'univ';
})();
