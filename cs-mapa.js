/* Apacheta · Territorio en datos — mapa censal (país por departamento, provincia por radio).
   Lo usan la demo y la Pro. Requiere Leaflet y cs-comun.js. */
(function () {
  'use strict';

  function crear(opciones) {
    var o = opciones || {};
    var map = L.map(o.contenedor || 'mapa', { preferCanvas: true, zoomControl: true }).setView([-38.5, -64], 4);
    var lienzo = L.canvas({ padding: 0.3 });
    var esri = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/';
    L.tileLayer(esri + 'World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Base: Esri, HERE, Garmin, © OpenStreetMap', maxZoom: 16
    }).addTo(map);
    map.createPane('etiquetas'); map.getPane('etiquetas').style.zIndex = 450; map.getPane('etiquetas').style.pointerEvents = 'none';
    L.tileLayer(esri + 'World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { pane: 'etiquetas', maxZoom: 16 }).addTo(map);
    map.attributionControl.addAttribution('Datos: INDEC Censo 2022 · radios: CONICET (CC-BY 4.0)');

    var estado = { variable: o.variable || 'nbi', nivel: 'pais', prov: null, deptos: null, radios: null, capa: null, cortes: [], resaltado: null, valorDe: null };

    var leyenda = L.control({ position: 'bottomright' });
    leyenda.onAdd = function () { this._div = L.DomUtil.create('div', 'leyenda'); return this._div; };
    leyenda.addTo(map);

    var aviso = L.DomUtil.create('div', 'cargando', map.getContainer()); aviso.hidden = true;
    function cargando(t) { aviso.textContent = t || ''; aviso.hidden = !t; }

    // valor de una feature para la variable activa (permite variables externas de la Pro)
    function valor(f) {
      if (estado.valorDe) return estado.valorDe(f, estado.variable);
      return f.properties[estado.variable];
    }

    function estilo(f) {
      return { renderer: lienzo, color: estado.nivel === 'pais' ? '#ffffff' : 'rgba(255,255,255,.6)', weight: estado.nivel === 'pais' ? 0.6 : 0.3,
        fillColor: o.colorDe ? o.colorDe(f, estado) : CS.colorDe(valor(f), estado.cortes), fillOpacity: 0.85 };
    }

    function pintar() {
      if (!estado.capa) return;
      var fs = estado.nivel === 'pais' ? estado.deptos.features : estado.radios.features;
      estado.cortes = o.cortesDe ? o.cortesDe(fs, estado.variable, valor) : CS.cortes(fs.map(valor));
      estado.capa.setStyle(estilo);
      leyenda._div.innerHTML = o.leyenda ? o.leyenda(estado) : CS.leyendaHTML(estado.variable, estado.cortes);
      if (o.alPintar) o.alPintar(estado);
    }

    function quitarCapa() { if (estado.capa) { map.removeLayer(estado.capa); estado.capa = null; } }

    function mostrarPais() {
      cargando('Cargando departamentos…');
      return CS.cargarDeptos().then(function (g) {
        estado.deptos = g; estado.nivel = 'pais'; estado.prov = null; estado.radios = null;
        quitarCapa();
        estado.capa = L.geoJSON(g, {
          style: estilo,
          onEachFeature: function (f, l) {
            l.bindTooltip(function () { return '<b>' + f.properties.n + '</b> · ' + f.properties.pv + '<br>' + CS.formato(estado.variable, valor(f)); }, { sticky: true });
            l.on('click', function () { if (o.bloquearClic && o.bloquearClic()) return; mostrarProvincia(f.properties.c.slice(0, 2), f.properties.bb); });
          }
        }).addTo(map);
        pintar(); cargando('');
        if (o.alCambiarNivel) o.alCambiarNivel(estado);
      }).catch(function () { cargando('No se pudieron cargar los datos.'); });
    }

    function mostrarProvincia(cod, bb) {
      cargando('Cargando radios censales…');
      return CS.cargarProvincia(cod).then(function (g) {
        estado.radios = g; estado.nivel = 'prov'; estado.prov = cod;
        quitarCapa();
        estado.capa = L.geoJSON(g, {
          style: estilo,
          onEachFeature: function (f, l) {
            l.on('click', function (e) {
              if (o.bloquearClic && o.bloquearClic()) return;
              resaltar(l); if (o.alTocarRadio) o.alTocarRadio(f, estado, e);
            });
          }
        }).addTo(map);
        pintar(); cargando('');
        if (bb) map.fitBounds([[bb[1], bb[0]], [bb[3], bb[2]]]); else map.fitBounds(estado.capa.getBounds());
        if (o.alCambiarNivel) o.alCambiarNivel(estado);
      }).catch(function () { cargando('No se pudieron cargar los radios.'); });
    }

    function resaltar(l) {
      if (estado.resaltado) estado.capa.resetStyle(estado.resaltado);
      estado.resaltado = l;
      if (l) { l.setStyle({ color: '#16201D', weight: 2.5 }); l.bringToFront && l.bringToFront(); }
    }

    function nombreDepto(codRadio) {
      if (!estado.deptos) return '';
      var k = codRadio.slice(0, 5);
      var f = estado.deptos.features.find(function (x) { return x.properties.c === k; });
      return f ? f.properties.n + ', ' + f.properties.pv : '';
    }

    mostrarPais();

    return {
      map: map, estado: estado, pintar: pintar, mostrarPais: mostrarPais, mostrarProvincia: mostrarProvincia,
      nombreDepto: nombreDepto, resaltar: resaltar, cargando: cargando,
      setVariable: function (v) { estado.variable = v; pintar(); },
      setValorDe: function (fn) { estado.valorDe = fn; pintar(); }
    };
  }

  window.CSMapa = { crear: crear };
})();
