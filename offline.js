/* Apacheta · Visor — «Sin conexión»: guarda la zona visible (mapa base, proyectos y el visor)
   para usarla en la montaña sin señal. Usa sw.js y la caché del navegador. Nada sale del equipo. */
(function () {
  if (!window.L || !('serviceWorker' in navigator) || !window.caches) return;

  var SITIO = 'apacheta-sitio-v1', ZONAS = 'apacheta-zonas-v1', CLAVE = 'apacheta-zonas';
  var MAX_TESELAS = 900;       // tope por zona, para no abusar de los servidores de mapas
  var NIVELES_EXTRA = 4;       // desde el zoom actual, hasta 4 niveles más de detalle

  navigator.serviceWorker.register('sw.js').catch(function () {});

  var css = [
    '.off-ctrl a{display:flex;align-items:center;justify-content:center;width:34px;height:34px;color:#16201D;background:#fff;cursor:pointer}',
    '.off-ctrl a:hover{background:#F6F6F3}',
    '.off-ctrl a.hay{color:#2E7D6B}',
    '.off-panel{position:absolute;z-index:900;right:58px;top:10px;width:300px;max-width:calc(100% - 76px);background:#fff;border-radius:10px;box-shadow:0 4px 18px rgba(0,0,0,.25);padding:16px 16px 14px;font:14px/1.45 Montserrat,system-ui,sans-serif;color:#3B4440}',
    '.off-panel[hidden]{display:none}',
    '.off-panel h3{margin:0 0 6px;font:700 16px Inter,system-ui,sans-serif;color:#16201D}',
    '.off-panel p{margin:0 0 10px}',
    '.off-panel .chico{font-size:12px;color:#5A625E}',
    '.off-panel button{font:600 14px Inter,system-ui,sans-serif;border:0;border-radius:6px;padding:10px 12px;cursor:pointer}',
    '.off-panel .principal{background:#16201D;color:#fff;width:100%}',
    '.off-panel .principal:disabled{opacity:.5;cursor:default}',
    '.off-panel .secundario{background:none;color:#9A3F1C;padding:6px 0}',
    '.off-panel .cerrar{position:absolute;right:6px;top:4px;background:none;font-size:22px;color:#5A625E;padding:4px 8px}',
    '.off-barra{height:6px;background:#ECEDE8;border-radius:3px;overflow:hidden;margin:10px 0 6px}',
    '.off-barra i{display:block;height:100%;width:0;background:#9A3F1C;transition:width .2s}',
    '.off-lista{margin:8px 0 0;padding:0;list-style:none;font-size:13px}',
    '.off-lista li{display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-top:1px solid #ECEDE8}',
    '.off-lista button{padding:0;background:none;color:#9A3F1C;font-size:13px}',
    '.off-app{margin:12px 0 0;padding:10px 12px;background:#FBF3EE;border-left:3px solid #E3A383;border-radius:0 6px 6px 0;font-size:13px}',
    '.off-estado{position:absolute;z-index:800;left:50%;top:12px;transform:translateX(-50%);background:#16201D;color:#fff;font:600 12px Inter,system-ui,sans-serif;padding:6px 12px;border-radius:14px;display:none}',
    '.off-estado.visible{display:block}'
  ].join('');
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var ICONO = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>';

  function leerZonas() { try { return JSON.parse(localStorage.getItem(CLAVE) || '[]'); } catch (e) { return []; } }
  function guardarZonas(z) { try { localStorage.setItem(CLAVE, JSON.stringify(z)); } catch (e) {} }

  function lon2x(lon, z) { return Math.floor((lon + 180) / 360 * Math.pow(2, z)); }
  function lat2y(lat, z) {
    var r = lat * Math.PI / 180;
    return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z));
  }

  L.Map.addInitHook(function () {
    var map = this;
    if (map.getContainer().id !== 'mapa') return;
    setTimeout(function () { iniciar(map); }, 0);
  });

  function iniciar(map) {
    var Ctrl = L.Control.extend({
      options: { position: 'topright' },
      onAdd: function () {
        var div = L.DomUtil.create('div', 'leaflet-bar off-ctrl');
        var a = L.DomUtil.create('a', '', div);
        a.href = '#'; a.role = 'button'; a.title = 'Usar sin conexión'; a.setAttribute('aria-label', 'Usar sin conexión');
        a.innerHTML = ICONO;
        L.DomEvent.disableClickPropagation(div);
        L.DomEvent.on(a, 'click', function (e) { L.DomEvent.preventDefault(e); alternar(); });
        this._a = a; return div;
      }
    });
    var ctrl = new Ctrl().addTo(map);

    var panel = L.DomUtil.create('div', 'off-panel', map.getContainer());
    panel.hidden = true;
    L.DomEvent.disableClickPropagation(panel);
    L.DomEvent.disableScrollPropagation(panel);
    panel.innerHTML =
      '<button class="cerrar" type="button" aria-label="Cerrar">×</button>' +
      '<h3>Usar sin conexión</h3>' +
      '<p>Guardá la zona que ves ahora para abrirla en la montaña sin señal. El GPS funciona sin datos.</p>' +
      '<p class="chico" data-calc></p>' +
      '<button class="principal" type="button" data-guardar>Guardar esta zona</button>' +
      '<div class="off-barra" hidden><i></i></div><p class="chico" data-progreso></p>' +
      '<ul class="off-lista" data-lista></ul>' +
      '<p class="chico">Antes de salir, abrí el visor una vez con señal y probá con el modo avión. Se guarda solo en este navegador.</p>' +
      '<p class="off-app"><b>Pronto: la app de Apacheta.</b> Mapas sin conexión, GPS, brújula y tus tracks, todo en el celular.</p>';
    var $ = function (s) { return panel.querySelector(s); };
    $('.cerrar').onclick = function () { panel.hidden = true; };
    $('[data-guardar]').onclick = guardar;

    var aviso = L.DomUtil.create('div', 'off-estado', map.getContainer());
    function estadoRed() {
      aviso.textContent = 'Sin conexión: se muestran las zonas guardadas';
      aviso.classList.toggle('visible', !navigator.onLine);
    }
    window.addEventListener('online', estadoRed); window.addEventListener('offline', estadoRed); estadoRed();

    function alternar() {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) { calcular(); listar(); }
    }
    map.on('moveend zoomend baselayerchange', function () { if (!panel.hidden) calcular(); });

    function capaBase() {
      var c = null;
      map.eachLayer(function (l) { if (l instanceof L.TileLayer && l._url && !c) c = l; });
      return c;
    }
    function nombreBase(l) { return /opentopomap/.test(l._url) ? 'Topográfico' : 'Satelital'; }

    function teselas() {
      var capa = capaBase(); if (!capa) return null;
      var b = map.getBounds(), z0 = Math.max(Math.round(map.getZoom()), 8);
      var zMax = Math.min(z0 + NIVELES_EXTRA, capa.options.maxZoom || 17);
      var lista = [];
      for (var z = z0; z <= zMax; z++) {
        var x1 = lon2x(b.getWest(), z), x2 = lon2x(b.getEast(), z);
        var y1 = lat2y(b.getNorth(), z), y2 = lat2y(b.getSouth(), z);
        for (var x = x1; x <= x2; x++) for (var y = y1; y <= y2; y++) {
          var sub = capa.options.subdomains ? capa.options.subdomains[(x + y) % capa.options.subdomains.length] : '';
          var url = L.Util.template(capa._url, L.extend({ s: sub, x: x, y: y, z: z, r: '' }, capa.options));
          lista.push({ url: url, clave: url.replace(/\/\/[abc]\.tile\.opentopomap\.org/, '//tile.opentopomap.org') });
        }
        if (lista.length > MAX_TESELAS) return { capa: capa, lista: lista, z0: z0, zMax: z, pasado: true };
      }
      return { capa: capa, lista: lista, z0: z0, zMax: zMax };
    }

    function calcular() {
      var t = teselas(), el = $('[data-calc]'), btn = $('[data-guardar]');
      if (!t) { el.textContent = ''; btn.disabled = true; return; }
      if (t.pasado || map.getZoom() < 8) {
        el.textContent = 'La zona es muy grande. Acercate un poco más (por ejemplo, a un cerro o un valle) y volvé a intentar.';
        btn.disabled = true; return;
      }
      var mb = Math.max(1, Math.round(t.lista.length * (nombreBase(t.capa) === 'Satelital' ? 0.025 : 0.03)));
      el.textContent = 'Mapa ' + nombreBase(t.capa) + ', ' + t.lista.length + ' partes (unos ' + mb + ' MB), con detalle hasta el zoom ' + t.zMax + '.';
      btn.disabled = false;
    }

    function listar() {
      var ul = $('[data-lista]'), zonas = leerZonas();
      ctrl._a.classList.toggle('hay', zonas.length > 0);
      ul.innerHTML = '';
      zonas.forEach(function (z, i) {
        var li = document.createElement('li');
        var ir = document.createElement('a'); ir.href = '#'; ir.textContent = z.nombre;
        ir.onclick = function (e) { e.preventDefault(); map.fitBounds(z.bounds); };
        var borrar = document.createElement('button'); borrar.type = 'button'; borrar.textContent = 'Borrar';
        borrar.onclick = function () { borrarZona(i); };
        li.appendChild(ir); li.appendChild(borrar); ul.appendChild(li);
      });
    }

    function archivosVisor() {
      var urls = [location.href.split('#')[0], 'proyectos.geojson'];
      document.querySelectorAll('script[src]').forEach(function (s) { urls.push(s.src); });
      document.querySelectorAll('link[rel=stylesheet]').forEach(function (l) { urls.push(l.href); });
      return fetch('proyectos.geojson').then(function (r) { return r.json(); }).then(function (g) {
        g.features.forEach(function (f) { if (f.properties && f.properties.capa) urls.push(f.properties.capa); });
        return urls;
      }).catch(function () { return urls; });
    }

    function guardar() {
      var t = teselas(); if (!t || t.pasado) return;
      var btn = $('[data-guardar]'), barra = $('.off-barra'), i = $('.off-barra i'), txt = $('[data-progreso]');
      btn.disabled = true; barra.hidden = false; i.style.width = '0';
      txt.textContent = 'Guardando el visor y los proyectos…';
      var hechas = 0, fallas = 0, total = t.lista.length;

      archivosVisor().then(function (urls) {
        return caches.open(SITIO).then(function (c) {
          return Promise.all(urls.map(function (u) {
            return fetch(u, { mode: /^https?:\/\/(cdnjs|fonts)\./.test(u) ? 'cors' : 'same-origin' })
              .then(function (r) { if (r.ok) return c.put(u, r); }).catch(function () {});
          }));
        });
      }).then(function () { return caches.open(ZONAS); }).then(function (c) {
        var cola = t.lista.slice();
        function siguiente() {
          var item = cola.shift(); if (!item) return Promise.resolve();
          return c.match(item.clave).then(function (ya) {
            if (ya) return;
            return fetch(item.url, { mode: 'cors' }).then(function (r) {
              if (!r.ok) throw new Error(r.status);
              return c.put(item.clave, r);
            });
          }).catch(function () { fallas++; }).then(function () {
            hechas++;
            i.style.width = Math.round(hechas / total * 100) + '%';
            txt.textContent = 'Guardando el mapa: ' + hechas + ' de ' + total;
            return siguiente();
          });
        }
        // 4 descargas a la vez, para no saturar los servidores de mapas
        return Promise.all([siguiente(), siguiente(), siguiente(), siguiente()]);
      }).then(function () {
        var zonas = leerZonas(), c = map.getCenter();
        var b = map.getBounds();
        zonas.push({
          nombre: 'Zona ' + (zonas.length + 1) + ' · ' + nombreBase(t.capa) + ' · ' + new Date().toLocaleDateString('es-AR'),
          bounds: [[b.getSouth(), b.getWest()], [b.getNorth(), b.getEast()]],
          centro: [c.lat, c.lng], claves: t.lista.map(function (x) { return x.clave; })
        });
        guardarZonas(zonas);
        txt.textContent = fallas
          ? 'Listo, con ' + fallas + ' partes que no se pudieron bajar. Podés volver a tocar «Guardar» para completarlas.'
          : 'Listo: la zona quedó guardada en este navegador.';
        btn.disabled = false; listar();
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
      });
    }

    function borrarZona(n) {
      var zonas = leerZonas(), z = zonas.splice(n, 1)[0];
      var enUso = {};
      zonas.forEach(function (o) { o.claves.forEach(function (k) { enUso[k] = 1; }); });
      caches.open(ZONAS).then(function (c) {
        return Promise.all(z.claves.filter(function (k) { return !enUso[k]; }).map(function (k) { return c.delete(k); }));
      }).then(function () { guardarZonas(zonas); listar(); });
    }

    listar();
  }
})();
