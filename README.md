# Apacheta Cartografía

Visor territorial de Apacheta Cartografía — consultoría territorial (Mendoza, Argentina). Leaflet 1.9.4, sitio estático.

Sitio: https://apacheta-cartografia.github.io/

## Sumar un proyecto

Agregar un Feature a `proyectos.geojson` (EPSG:4326; se puede exportar desde QGIS como GeoJSON y copiar el Feature).

| Campo | Obligatorio | Uso |
|---|---|---|
| `id` | sí | Identificador único, sin espacios. Se usa en el enlace `#id`. |
| `titulo` | sí | Nombre del proyecto. |
| `categoria` | sí | `Análisis territorial`, `Análisis socioeconómico`, `Análisis socioambiental` o `Cartografía`. Define color y filtro. |
| `lugar`, `anio`, `cliente` | no | Se muestran debajo del título. |
| `descripcion` | no | Texto de la ficha. |
| `etiquetas` | no | Palabras que también encuentra el buscador. |
| `imagen` | no | Ruta a una imagen. |
| `capa` | no | GeoJSON de detalle que se carga al seleccionar el proyecto. |
| `zoom` | no | Zoom máximo al acercarse. |
| `tienda` | no | Enlace del botón "Comprar mapa impreso". |
| `enlace` | no | Enlace del botón "Ver proyecto". |

En las capas de detalle cada elemento lleva `nombre`, `tipo` (`cumbre`, `refugio`, `campamento`, `agua`, `ruta`, `area`), `altitud` y `nota`. Colores y tipos se editan en `TIPOS` y `CATEGORIAS`, al principio de `visor.js`.

Enlace directo a un proyecto: `https://apacheta-cartografia.github.io/#ojo-del-salado`.

## Probarlo en la compu

```
python -m http.server 8000
```

Y abrir http://localhost:8000 (con doble clic el navegador bloquea la lectura del GeoJSON).
