/* Descargas gratis y colaboración en Cafecito (sistema de confianza).
   El contador vive en el navegador de cada persona. Para desactivarlo,
   quitar <script src="colabora.js"> de mapa.html. */
(function () {
  var CAFECITO_URL = 'https://cafecito.app/apachetacartografia';
  var GRATIS = 2, POR_COLABORACION = 5, CLAVE = 'apacheta-mapa-descargas', CLAVE_COLABORO = 'apacheta-mapa-colaboro';
  var memoria = null;
  function $(id) { return document.getElementById(id); }
  function disponibles() {
    try { var v = localStorage.getItem(CLAVE); if (v !== null) return Math.max(0, parseInt(v, 10) || 0); } catch (e) {}
    return memoria === null ? GRATIS : memoria;
  }
  function guardar(n) { memoria = n; try { localStorage.setItem(CLAVE, String(n)); } catch (e) {} }
  // Quien colaboró descarga sin marcas de agua.
  function colaboro() { try { return localStorage.getItem(CLAVE_COLABORO) === '1'; } catch (e) { return !!window.APACHETA_SIN_MARCA; } }
  function aplicarMarca() {
    window.APACHETA_SIN_MARCA = colaboro();
    ['ma-centro', 'ma-esquina'].forEach(function (id) { if ($(id)) $(id).style.display = window.APACHETA_SIN_MARCA ? 'none' : ''; });
  }
  aplicarMarca();
  // mapa.js dibuja las marcas de agua del PDF con estos dos textos exactos: se omiten si colaboró.
  ['fillText', 'strokeText'].forEach(function (m) {
    var orig = CanvasRenderingContext2D.prototype[m];
    CanvasRenderingContext2D.prototype[m] = function (t) {
      if (window.APACHETA_SIN_MARCA && (t === 'Apacheta Cartografía' || t === 'APACHETA CARTOGRAFÍA')) return;
      return orig.apply(this, arguments);
    };
  });
  $('colabora').querySelector('p').textContent = 'Ya usaste tus descargas gratis. Esta herramienta es libre y la mantenemos a pulmón: con una colaboración en Cafecito, del monto que quieras, habilitás 5 descargas más y tus mapas salen sin marca de agua.';

  function mostrar() {
    var n = disponibles();
    $('usos').textContent = n > 0 ? (n === 1 ? 'Te queda 1 descarga' : 'Te quedan ' + n + ' descargas') : '';
    $('colabora').hidden = n > 0;
    $('descargar').hidden = n <= 0;
  }

  // Aviso fijo en el panel, arriba de «Preparar PDF».
  var aviso = document.createElement('p');
  aviso.id = 'aviso-colabora';
  aviso.style.cssText = 'margin:0;font-size:12.5px;line-height:1.5;color:#3B4440';
  aviso.innerHTML = 'Esta herramienta es gratuita y se sostiene con colaboraciones. Si te sirvió, ' +
    '<a href="' + CAFECITO_URL + '" target="_blank" rel="noopener" style="color:#9A3F1C;font-weight:600">invitanos un cafecito ↗</a>';
  $('generar').parentNode.insertBefore(aviso, $('generar'));

  $('ir-cafecito').href = CAFECITO_URL;
  $('ir-cafecito').addEventListener('click', function () { $('ya-colabore').hidden = false; });
  $('ya-colabore').addEventListener('click', function () {
    guardar(disponibles() + POR_COLABORACION);
    try { localStorage.setItem(CLAVE_COLABORO, '1'); } catch (e) {}
    window.APACHETA_SIN_MARCA = true; aplicarMarca();
    $('ya-colabore').hidden = true;
    // Rearmar el PDF ya sin marcas de agua
    $('vista').hidden = true;
    $('estado-gen').textContent = '¡Gracias por colaborar! Rearmando tu mapa sin marca de agua…';
    setTimeout(function () { $('generar').click(); }, 50);
  });

  // Antes de que mapa.js genere el PDF: si no quedan descargas, se frena; si quedan, se descuenta una.
  $('descargar').addEventListener('click', function (e) {
    var n = disponibles();
    if (n <= 0) { e.stopImmediatePropagation(); mostrar(); return; }
    guardar(n - 1);
    setTimeout(mostrar, 0);
  }, true);

  // Cada vez que se abre la vista previa, actualizar el contador.
  new MutationObserver(function () {
    if (!$('vista').hidden) { mostrar(); if (disponibles() <= 0) $('ir-cafecito').focus(); }
  }).observe($('vista'), { attributes: true, attributeFilter: ['hidden'] });
})();
