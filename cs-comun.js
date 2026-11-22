/* Apacheta · Territorio en datos — partes comunes de la demo y la Pro.
   Datos: INDEC, Censo 2022 (por radio censal) · cartografía de radios de Rodriguez y de Grande (CONICET), CC-BY 4.0.
   Los porcentajes vienen en «por mil» (entero) para que los archivos pesen menos. */
(function () {
  'use strict';
  var BASE = 'datos/censo/';

  // clave: [nombre, tipo, unidad de base]  tipo: pm = por mil · den = hab/km² · n = cantidad
  var VARIABLES = {
    nbi:    ['Hogares con NBI', 'pm', 'hog'],
    ipmh:   ['Hogares con privación material (IPMH)', 'pm', 'hog'],
    hac:    ['Hogares con hacinamiento (más de 2 personas por cuarto)', 'pm', 'hog'],
    inet:   ['Hogares con internet', 'pm', 'hog'],
    compu:  ['Hogares con computadora o tablet', 'pm', 'hog'],
    agua:   ['Hogares con agua de red', 'pm', 'hog'],
    cloaca: ['Hogares con cloaca', 'pm', 'hog'],
    gas:    ['Hogares que cocinan con gas de red', 'pm', 'hog'],
    matmal: ['Viviendas con materiales de calidad III o IV', 'pm', 'hog'],
    alq:    ['Hogares que alquilan', 'pm', 'hog'],
    edub:   ['Hogares con clima educativo bajo o muy bajo', 'pm', 'hog'],
    univ:   ['Población con universitario completo o más', 'pm', 'pob'],
    desoc:  ['Tasa de desocupación', 'pm', 'pob'],
    empleo: ['Población ocupada (de la que declaró actividad)', 'pm', 'pob'],
    sinos:  ['Población sin obra social ni prepaga', 'pm', 'pob'],
    e014:   ['Población de 0 a 14 años', 'pm', 'pob'],
    e65:    ['Población de 65 años y más', 'pm', 'pob'],
    muj:    ['Mujeres', 'pm', 'pob'],
    oprov:  ['Nacidos en otra provincia', 'pm', 'pob'],
    opais:  ['Nacidos en otro país', 'pm', 'pob'],
    den:    ['Densidad de población (hab/km²)', 'den', null],
    pob:    ['Población', 'n', null],
    hog:    ['Hogares', 'n', null]
  };
  var PALETA = ['#F6EFE7', '#EBCFB5', '#D9A07A', '#B8653F', '#7E2F14'];
  var SIN_DATO = '#D8DAD5';

  function formato(clave, v) {
    if (v === null || v === undefined || isNaN(v)) return 's/d';
    var t = VARIABLES[clave] ? VARIABLES[clave][1] : 'n';
    if (t === 'pm') return (v / 10).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' %';
    if (t === 'den') return Math.round(v).toLocaleString('es-AR') + ' hab/km²';
    return Math.round(v).toLocaleString('es-AR');
  }

  // Cortes por cuantiles (5 clases), ignorando vacíos
  function cortes(valores, n) {
    n = n || 5;
    var v = valores.filter(function (x) { return x !== null && x !== undefined && !isNaN(x); }).sort(function (a, b) { return a - b; });
    if (!v.length) return [];
    var c = [];
    for (var i = 1; i < n; i++) c.push(v[Math.min(v.length - 1, Math.floor(v.length * i / n))]);
    return c.filter(function (x, i) { return i === 0 || x !== c[i - 1]; });
  }
  function clase(v, cs) {
    if (v === null || v === undefined || isNaN(v)) return -1;
    for (var i = 0; i < cs.length; i++) if (v < cs[i]) return i;
    return cs.length;
  }
  function colorDe(v, cs) {
    var k = clase(v, cs);
    if (k < 0) return SIN_DATO;
    var pal = PALETA;
    if (cs.length + 1 < PALETA.length) pal = PALETA.slice(PALETA.length - cs.length - 1);
    return pal[k];
  }

  function leyendaHTML(clave, cs) {
    var pal = cs.length + 1 < PALETA.length ? PALETA.slice(PALETA.length - cs.length - 1) : PALETA;
    var h = '<b>' + VARIABLES[clave][0] + '</b>';
    for (var i = 0; i <= cs.length; i++) {
      var desde = i === 0 ? null : cs[i - 1], hasta = i < cs.length ? cs[i] : null;
      var txt = desde === null ? 'menos de ' + formato(clave, hasta) : hasta === null ? formato(clave, desde) + ' o más' : formato(clave, desde) + ' a ' + formato(clave, hasta);
      h += '<div class="ley-fila"><i style="background:' + pal[i] + '"></i>' + txt + '</div>';
    }
    h += '<div class="ley-fila"><i style="background:' + SIN_DATO + '"></i>sin dato</div>';
    return h;
  }

  var cache = {};
  function cargar(ruta) {
    if (!cache[ruta]) cache[ruta] = fetch(BASE + ruta).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
    return cache[ruta];
  }
  function cargarDeptos() { return cargar('deptos.geojson'); }
  function cargarProvincia(codProv) { return cargar('prov/' + codProv + '.geojson'); }

  // Promedio ponderado de un indicador sobre varios radios (aproximado: pondera por hogares o población)
  function agregar(features, clave) {
    var meta = VARIABLES[clave];
    if (!meta) return null;
    if (meta[1] === 'n') return features.reduce(function (s, f) { return s + (f.properties[clave] || 0); }, 0);
    if (meta[1] === 'den') {
      var p = 0, a = 0;
      features.forEach(function (f) { p += f.properties.pob || 0; a += f.properties.km2 || 0; });
      return a ? p / a : null;
    }
    var num = 0, den = 0;
    features.forEach(function (f) {
      var v = f.properties[clave], w = f.properties[meta[2]] || 0;
      if (v !== null && v !== undefined) { num += v * w; den += w; }
    });
    return den ? num / den : null;
  }

  function fuenteHTML() {
    return 'Fuente: INDEC, Censo Nacional 2022 (resultados por radio censal). Cartografía de radios: Rodriguez y de Grande, CONICET (CC-BY 4.0). Indicadores: elaboración de Apacheta Cartografía.';
  }

  window.CS = {
    VARIABLES: VARIABLES, PALETA: PALETA, SIN_DATO: SIN_DATO,
    formato: formato, cortes: cortes, clase: clase, colorDe: colorDe, leyendaHTML: leyendaHTML,
    cargarDeptos: cargarDeptos, cargarProvincia: cargarProvincia, agregar: agregar, fuenteHTML: fuenteHTML
  };
})();
