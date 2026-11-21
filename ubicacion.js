/* Apacheta · Visor — «Mi ubicación» (GPS) y brújula.
   Se carga entre Leaflet y visor.js: toma el mapa con un init hook, sin tocar visor.js.
   GPS: navigator.geolocation (requiere HTTPS). Brújula: DeviceOrientation (en iPhone pide permiso
   con un toque; en compu no hay sensor y la brújula no aparece). */
(function () {
  if (!window.L) return;

  var css = [
    '.ubi-ctrl a{display:flex;align-items:center;justify-content:center;width:34px;height:34px;color:#16201D;background:#fff;cursor:pointer}',
    '.ubi-ctrl a:hover{background:#F6F6F3}',
    '.ubi-ctrl a.buscando svg{animation:ubiPulso 1s ease-in-out infinite}',
    '.ubi-ctrl a.activo{color:#9A3F1C}',
    '.ubi-ctrl a.siguiendo{color:#fff;background:#9A3F1C}',
    '@keyframes ubiPulso{50%{opacity:.35}}',
    '.ubi-icono{position:relative}',
    '.ubi-punto{position:absolute;left:50%;top:50%;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:#1F6FEB;border:3px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.25),0 1px 4px rgba(0,0,0,.35)}',
    '.ubi-cono{position:absolute;left:50%;top:50%;width:60px;height:60px;margin:-30px 0 0 -30px;display:none;transform-origin:50% 50%}',
    '.ubi-cono.visible{display:block}',
    '.ubi-info{position:absolute;z-index:800;left:50%;bottom:34px;transform:translateX(-50%);background:rgba(22,32,29,.92);color:#fff;font:600 12px/1.3 Inter,system-ui,sans-serif;padding:7px 12px;border-radius:16px;white-space:nowrap;pointer-events:none;display:none}',
    '.ubi-info.visible{display:block}',
    '.ubi-brujula{width:54px;height:54px;border-radius:50%;background:rgba(255,255,255,.95);box-shadow:0 1px 5px rgba(0,0,0,.3);display:none;position:relative;cursor:pointer}',
    '.ubi-brujula.visible{display:block}',
    '.ubi-brujula svg{position:absolute;inset:0;transition:transform .15s linear}',
    '.ubi-brujula span{position:absolute;left:0;right:0;bottom:-18px;text-align:center;font:700 11px Inter,system-ui,sans-serif;color:#16201D;text-shadow:0 0 3px #fff,0 0 3px #fff}'
  ].join('');
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var ICONO = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="8"/></svg>';
  var CONO = '<svg viewBox="0 0 60 60" width="60" height="60"><defs><linearGradient id="ubiG" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#1F6FEB" stop-opacity=".55"/><stop offset="1" stop-color="#1F6FEB" stop-opacity="0"/></linearGradient></defs><path d="M30 30 L14 2 A32 32 0 0 1 46 2 Z" fill="url(#ubiG)"/></svg>';
  var ROSA = '<svg viewBox="0 0 54 54" width="54" height="54"><circle cx="27" cy="27" r="25" fill="none" stroke="#DCDDD8"/>' +
    '<path d="M27 6 L32 27 L22 27 Z" fill="#9A3F1C"/><path d="M27 48 L32 27 L22 27 Z" fill="#4A524E"/>' +
    '<text x="27" y="15" text-anchor="middle" font-size="7" font-weight="700" fill="#fff" font-family="Inter,sans-serif">N</text></svg>';

  var CARD = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  function cardinal(g) { return CARD[Math.round(g / 45) % 8]; }
  function fmt(n) { return Math.round(n).toLocaleString('es-AR'); }

  L.Map.addInitHook(function () {
    var map = this;
    if (map.getContainer().id !== 'mapa') return;
    setTimeout(function () { iniciar(map); }, 0);
  });

  function iniciar(map) {
    var watchId = null, siguiendo = false, primerFix = true, ultimo = null, rumbo = null;
    var marcador = null, circulo = null, conoEl = null;

    var info = L.DomUtil.create('div', 'ubi-info', map.getContainer());

    // Botón «Mi ubicación»
    var Ctrl = L.Control.extend({
      options: { position: 'topright' },
      onAdd: function () {
        var div = L.DomUtil.create('div', 'leaflet-bar ubi-ctrl');
        var a = L.DomUtil.create('a', '', div);
        a.href = '#'; a.role = 'button'; a.title = 'Mi ubicación'; a.setAttribute('aria-label', 'Mi ubicación');
        a.innerHTML = ICONO;
        L.DomEvent.disableClickPropagation(div);
        L.DomEvent.on(a, 'click', function (e) { L.DomEvent.preventDefault(e); alTocar(); });
        this._a = a; return div;
      }
    });
    var ctrl = new Ctrl().addTo(map);
    function estadoBoton(clase) {
      ctrl._a.className = clase || '';
      ctrl._a.title = clase === 'siguiendo' ? 'Dejar de seguirme' : 'Mi ubicación';
    }

    // Brújula (solo si el equipo tiene sensor)
    var Bruj = L.Control.extend({
      options: { position: 'topright' },
      onAdd: function () {
        var d = L.DomUtil.create('div', 'ubi-brujula');
        d.title = 'Brújula: hacia dónde mirás';
        d.innerHTML = ROSA + '<span></span>';
        L.DomEvent.disableClickPropagation(d);
        L.DomEvent.on(d, 'click', function () { if (ultimo) { siguiendo = true; estadoBoton('siguiendo'); map.setView(ultimo, map.getZoom()); } });
        this._d = d; this._svg = d.querySelector('svg'); this._t = d.querySelector('span'); return d;
      }
    });
    var bruj = new Bruj().addTo(map);

    function alTocar() {
      pedirBrujula();
      if (watchId === null) { empezar(); return; }
      if (siguiendo) { parar(); return; }
      siguiendo = true; estadoBoton('siguiendo');
      if (ultimo) map.setView(ultimo, Math.max(map.getZoom(), 15));
    }

    function empezar() {
      if (!('geolocation' in navigator)) { aviso('Este navegador no permite ubicarte.'); return; }
      estadoBoton('buscando'); primerFix = true; siguiendo = true;
      watchId = navigator.geolocation.watchPosition(alFix, alError, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
    }

    function parar() {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      watchId = null; siguiendo = false; ultimo = null;
      if (marcador) { map.removeLayer(marcador); marcador = null; }
      if (circulo) { map.removeLayer(circulo); circulo = null; }
      info.classList.remove('visible');
      estadoBoton('');
    }

    function alFix(p) {
      var c = p.coords, ll = L.latLng(c.latitude, c.longitude);
      ultimo = ll;
      if (!circulo) {
        circulo = L.circle(ll, { radius: c.accuracy, color: '#1F6FEB', weight: 1, fillColor: '#1F6FEB', fillOpacity: .12, interactive: false }).addTo(map);
        marcador = L.marker(ll, {
          icon: L.divIcon({ className: 'ubi-icono', html: '<div class="ubi-cono">' + CONO + '</div><div class="ubi-punto"></div>', iconSize: [0, 0] }),
          interactive: false, keyboard: false, zIndexOffset: 1000
        }).addTo(map);
        conoEl = marcador.getElement().querySelector('.ubi-cono');
        if (rumbo !== null) girar(rumbo);
      } else {
        circulo.setLatLng(ll).setRadius(c.accuracy);
        marcador.setLatLng(ll);
      }
      if (primerFix) {
        primerFix = false;
        map.setView(ll, Math.max(map.getZoom(), 15));
      } else if (siguiendo) {
        map.panTo(ll, { animate: true });
      }
      estadoBoton(siguiendo ? 'siguiendo' : 'activo');
      var txt = '±' + fmt(c.accuracy) + ' m';
      if (c.altitude !== null && c.altitude !== undefined) txt += ' · ' + fmt(c.altitude) + ' m s.n.m. (GPS)';
      info.textContent = txt; info.classList.add('visible');
    }

    function alError(e) {
      if (e.code === 1) { parar(); aviso('Sin permiso de ubicación. Activalo en el navegador para este sitio.'); }
      else if (e.code === 3 && !ultimo) { aviso('Buscando señal GPS… al aire libre funciona mejor.'); }
      else if (!ultimo) { parar(); aviso('No pudimos obtener tu ubicación.'); }
    }

    function aviso(t) {
      info.textContent = t; info.classList.add('visible');
      clearTimeout(aviso._t); aviso._t = setTimeout(function () { if (!ultimo) info.classList.remove('visible'); }, 5000);
    }

    // Si el usuario mueve el mapa con la mano, deja de seguirlo (sigue mostrando el punto)
    map.on('dragstart', function () { if (siguiendo) { siguiendo = false; if (watchId !== null) estadoBoton('activo'); } });

    // ---------- Brújula ----------
    var pedido = false, escuchando = false;
    function pedirBrujula() {
      if (pedido) return; pedido = true;
      var DOE = window.DeviceOrientationEvent;
      if (!DOE) return;
      if (typeof DOE.requestPermission === 'function') {
        DOE.requestPermission().then(function (r) { if (r === 'granted') escuchar(); }).catch(function () {});
      } else escuchar();
    }
    function escuchar() {
      if (escuchando) return; escuchando = true;
      if ('ondeviceorientationabsolute' in window) window.addEventListener('deviceorientationabsolute', alGirar, true);
      else window.addEventListener('deviceorientation', alGirar, true);
    }
    // En Android no hace falta permiso: escuchamos desde el inicio para mostrar la brújula
    if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission !== 'function') escuchar();

    var suave = null;
    function alGirar(e) {
      var h = null;
      if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading;          // iPhone
      else if (e.absolute && typeof e.alpha === 'number') h = 360 - e.alpha;                  // Android
      if (h === null || isNaN(h)) return;
      var ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
      h = (h + ang + 360) % 360;
      // suavizado para que no tiemble
      if (suave === null) suave = h;
      else { var d = ((h - suave + 540) % 360) - 180; suave = (suave + d * 0.25 + 360) % 360; }
      rumbo = suave; girar(rumbo);
    }
    function girar(g) {
      bruj._d.classList.add('visible');
      bruj._svg.style.transform = 'rotate(' + (-g) + 'deg)';
      bruj._t.textContent = Math.round(g) + '° ' + cardinal(g);
      if (conoEl) { conoEl.classList.add('visible'); conoEl.style.transform = 'rotate(' + g + 'deg)'; }
    }
  }
})();
