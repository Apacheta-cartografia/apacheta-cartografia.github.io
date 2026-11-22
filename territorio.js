/* Apacheta · Territorio en datos — demo gratuita */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var DEMO = ['nbi', 'inet', 'den'];

  $('fuente').textContent = CS.fuenteHTML();

  var M = CSMapa.crear({
    variable: 'nbi',
    bloquearClic: function () { return marcando; },
    alCambiarNivel: function (e) {
      $('volver').hidden = e.nivel === 'pais';
      $('ficha').hidden = true;
      $('nivel').textContent = e.nivel === 'pais'
        ? 'Todo el país, por departamento. Tocá un departamento para ver sus radios censales.'
        : 'Radios censales de la provincia. Tocá un radio para ver su ficha.';
    },
    alTocarRadio: function (f) {
      var p = f.properties;
      var h = '<h3>Radio ' + p.c + '</h3><p class="ayuda" style="margin:0 0 6px">' + M.nombreDepto(p.c) + '</p><table>';
      h += '<tr><td>Población</td><td>' + CS.formato('pob', p.pob) + '</td></tr>';
      h += '<tr><td>Hogares</td><td>' + CS.formato('hog', p.hog) + '</td></tr>';
      DEMO.forEach(function (k) { h += '<tr><td>' + CS.VARIABLES[k][0] + '</td><td>' + CS.formato(k, p[k]) + '</td></tr>'; });
      h += '</table><p class="ayuda" style="margin-top:8px">La Pro muestra los 23 indicadores de cada radio.</p>';
      $('ficha').innerHTML = h; $('ficha').hidden = false;
    }
  });

  $('variable').addEventListener('change', function () { M.setVariable(this.value); });
  $('volver').addEventListener('click', function () { M.mostrarPais(); M.map.setView([-38.5, -64], 4); });

  // Pestañas
  document.querySelectorAll('.pestanas button').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.pestanas button').forEach(function (x) { x.classList.toggle('activa', x === b); });
      $('p-censo').hidden = b.dataset.p !== 'censo';
      $('p-mapeo').hidden = b.dataset.p !== 'mapeo';
    });
  });

  /* ---------- Mapeo colectivo (demo: solo en este navegador) ---------- */
  var CLAVE = 'apacheta-mapeo-demo';
  var COLORES = { problema: '#C0392B', valorado: '#2E7D6B', falta: '#D68910', inseguro: '#7D3C98', otro: '#4A524E' };
  var NOMBRES = { problema: 'Problema o conflicto', valorado: 'Lugar valorado', falta: 'Servicio que falta', inseguro: 'Lugar inseguro', otro: 'Otro' };
  var puntos = []; try { puntos = JSON.parse(localStorage.getItem(CLAVE) || '[]'); } catch (e) {}
  var capaMC = L.layerGroup().addTo(M.map);
  var marcando = false;

  function guardar() { try { localStorage.setItem(CLAVE, JSON.stringify(puntos)); } catch (e) {} }
  function dibujar() {
    capaMC.clearLayers(); $('mc-lista').innerHTML = '';
    puntos.forEach(function (p, i) {
      L.circleMarker([p.lat, p.lon], { radius: 7, color: '#fff', weight: 2, fillColor: COLORES[p.cat], fillOpacity: 1, pane: 'markerPane' })
        .bindPopup('<b>' + NOMBRES[p.cat] + '</b><br>' + (p.txt || '').replace(/</g, '&lt;')).addTo(capaMC);
      var li = document.createElement('li');
      li.innerHTML = '<i style="background:' + COLORES[p.cat] + '"></i><span><b>' + NOMBRES[p.cat] + '</b><br></span><button type="button">Quitar</button>';
      li.querySelector('span').appendChild(document.createTextNode(p.txt || ''));
      li.querySelector('button').onclick = function () { puntos.splice(i, 1); guardar(); dibujar(); };
      $('mc-lista').appendChild(li);
    });
  }
  dibujar();

  $('mc-marcar').addEventListener('click', function () {
    marcando = !marcando;
    this.textContent = marcando ? 'Tocá el mapa… (cancelar)' : 'Marcar en el mapa';
    M.map.getContainer().style.cursor = marcando ? 'crosshair' : '';
  });
  M.map.on('click', function (e) {
    if (!marcando) return;
    marcando = false; $('mc-marcar').textContent = 'Marcar en el mapa'; M.map.getContainer().style.cursor = '';
    var cat = $('mc-cat').value;
    var div = document.createElement('div'); div.className = 'mc-form';
    div.innerHTML = '<b>' + NOMBRES[cat] + '</b><textarea maxlength="500" placeholder="¿Qué pasa en este lugar?"></textarea><button class="btn btn-primario" type="button">Guardar</button>';
    var pop = L.popup().setLatLng(e.latlng).setContent(div).openOn(M.map);
    div.querySelector('button').onclick = function () {
      puntos.push({ lat: +e.latlng.lat.toFixed(6), lon: +e.latlng.lng.toFixed(6), cat: cat, txt: div.querySelector('textarea').value.trim(), fecha: new Date().toISOString() });
      guardar(); dibujar(); M.map.closePopup(pop);
    };
  });
  $('mc-bajar').addEventListener('click', function () {
    var g = { type: 'FeatureCollection', features: puntos.map(function (p) {
      return { type: 'Feature', geometry: { type: 'Point', coordinates: [p.lon, p.lat] }, properties: { categoria: NOMBRES[p.cat], comentario: p.txt, fecha: p.fecha } };
    }) };
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(g, null, 1)], { type: 'application/geo+json' }));
    a.download = 'mapeo-colectivo.geojson'; document.body.appendChild(a); a.click(); a.remove();
  });
  $('mc-borrar').addEventListener('click', function () {
    if (!puntos.length || !window.confirm('¿Borrar todos los puntos marcados?')) return;
    puntos = []; guardar(); dibujar();
  });
})();
