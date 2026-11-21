/* Apacheta · service worker del visor.
   - Archivos del sitio (mismo origen y cdnjs): primero la red; sin señal, la copia guardada.
   - Teselas de mapas: si la zona se guardó para usar sin conexión, salen de la caché. */
var SITIO = 'apacheta-sitio-v1';
var ZONAS = 'apacheta-zonas-v1';
var HOSTS_TESELAS = ['server.arcgisonline.com', 'tile.opentopomap.org'];

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k.indexOf('apacheta-') === 0 && k !== SITIO && k !== ZONAS; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function esTesela(url) {
  return HOSTS_TESELAS.some(function (h) { return url.hostname === h || url.hostname.endsWith('.' + h); });
}
// Las teselas de OpenTopoMap usan subdominios a/b/c: se guardan con una clave sin subdominio
function claveTesela(url) {
  return url.href.replace(/\/\/[abc]\.tile\.opentopomap\.org/, '//tile.opentopomap.org');
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  if (esTesela(url)) {
    e.respondWith(caches.open(ZONAS).then(function (c) {
      return c.match(claveTesela(url)).then(function (r) { return r || fetch(req); });
    }));
    return;
  }

  var propio = url.origin === self.location.origin;
  var cdn = url.hostname === 'cdnjs.cloudflare.com' || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!propio && !cdn) return;
  // Las páginas Pro y el servicio de códigos no se guardan
  if (propio && /mapa-pro|pro\.js|pro-/.test(url.pathname)) return;

  e.respondWith(fetch(req).then(function (r) {
    if (r && (r.ok || r.type === 'opaque')) {
      var copia = r.clone();
      caches.open(SITIO).then(function (c) { c.put(req, copia); });
    }
    return r;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (r) {
      return r || caches.match(req);
    });
  }));
});
