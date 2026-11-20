/* Descargas gratis y colaboración en Cafecito (sistema de confianza).
   El contador vive en el navegador de cada persona. Para desactivarlo,
   quitar <script src="colabora.js"> de mapa.html. */
(function () {
  var CAFECITO_URL = 'https://cafecito.app/apachetacartografia';
  var GRATIS = 2, POR_COLABORACION = 5, CLAVE = 'apacheta-mapa-descargas';
  var memoria = null;
  function $(id) { return document.getElementById(id); }
  function disponibles() {
    try { var v = localStorage.getItem(CLAVE); if (v !== null) return Math.max(0, parseInt(v, 10) || 0); } catch (e) {}
    return memoria === null ? GRATIS : memoria;
  }
  function guardar(n) { memoria = n; try { localStorage.setItem(CLAVE, String(n)); } catch (e) {} }
  function mostrar() {
    var n = disponibles();
    $('usos').textContent = n > 0 ? (n === 1 ? 'Te queda 1 descarga' : 'Te quedan ' + n + ' descargas') : '';
    $('colabora').hidden = n > 0;
    $('descargar').hidden = n <= 0;
  }

  $('ir-cafecito').href = CAFECITO_URL;
  $('ir-cafecito').addEventListener('click', function () { $('ya-colabore').hidden = false; });
  $('ya-colabore').addEventListener('click', function () {
    guardar(disponibles() + POR_COLABORACION);
    $('ya-colabore').hidden = true;
    mostrar();
    $('usos').textContent = '¡Gracias por colaborar! ' + $('usos').textContent;
    $('descargar').focus();
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
