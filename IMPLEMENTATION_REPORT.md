# Informe de implementación v0.11

## Objetivos solicitados

- Conservar observaciones Weather.com, pronósticos Meteored y radar de Ezeiza.
- Eliminar el mapa Leaflet por completo.
- Reemplazar la fuente satelital HTTP por una animación HTTPS de CONAE GOES-19.

## Implementado

- Se conserva el radar de Ezeiza visible desde ClimaSurGBA con actualización aislada, configurable a 10 minutos y botón manual.
- Se eliminó el HTML del mapa, el CDN CSS/JS de Leaflet, la inicialización, marcadores, popup, control «Volver», listeners de redimensión y estilos exclusivos. No queda espacio reservado para el mapa.
- Se creó un visor satelital CONAE que consulta una sola secuencia de seis imágenes GOES-19 por producto. Inicia con Argentina — Infrarrojo de Onda Larga y permite Visible Banda 2, RGB Microfísica Nocturna y Vapor de Agua.
- Se implementaron reproducción automática a 500 ms por cuadro, pausar/reproducir, cuadro anterior/siguiente, selector de producto y actualización manual. La consulta automática es independiente y se ejecuta cada 30 minutos.
- El visor muestra `ultFecha` provista por CONAE como UTC, atribución visible y fallback sin errores no controlados si el catálogo o una imagen no responden.
- Pronóstico Meteored real: hash de Ituzaingó validado, 24 horas y 5 días; se muestran 12 horas iniciales, temperaturas, sensación, símbolo, lluvia, humedad, viento y dirección cuando están disponibles.
- Caché de Meteored por respuesta y `expiracion` en `localStorage`; se eliminó el polling de Weather.com no autorizado.

## Limitaciones

- CONAE sirve las imágenes desde un catálogo público. No se puede garantizar su continuidad, tiempos de publicación ni derechos de redistribución comercial; antes de monetizar se debe confirmar la licencia aplicable con CONAE.
- La verificación automatizada confirma el endpoint, el JSON, la ruta HTTPS y el CORS declarado. La comprobación visual final en la publicación de GitHub Pages y dentro de Blogger queda a cargo del despliegue.

## Motivos y evidencia

- La página oficial `animacionGOESU.aspx` publicó GOES-19, los cuatro productos solicitados y «Última imagen» en UTC. Su JavaScript utiliza Galleria y solicita `recuperarListaImagenes.aspx` con `tipo`, `cant` y `frec`.
- La prueba controlada `POST` de Infrarrojo (`ArgIrol`, 6, 30) devolvió JSON con seis JPG HTTPS de Argentina y `ultFecha` real. La inspección de cabeceras devolvió `Access-Control-Allow-Origin: *`; se usa una petición `FormData` simple, sin headers personalizados.
- La cabecera de la página no incluyó `X-Frame-Options`, pero no se usa iframe: la aplicación consume exclusivamente el endpoint público y sus JPG HTTPS.
- CX2SA quedó descartado como fuente activa porque la URL solo respondía mediante HTTP; no hay mixed content en el nuevo visor.

## Archivos modificados

- `dashboard.html`, `css/dashboard.css`, `js/dashboard.js`
- `DATA_SOURCES.md`, `CHANGELOG.md`, `IMPLEMENTATION_REPORT.md`
- `IMPLEMENTATION_REPORT.md`

## Dependencias nuevas

Ninguna. Se conserva Font Awesome; Leaflet y su CDN fueron eliminados.

## Endpoints y recursos utilizados

- Weather.com PWS actual: se conserva sin cambios.
- Radar provisional: `https://climasurgba.com.ar/radar/ezeiza0.png`.
- Página oficial de CONAE: `https://catalogos4.conae.gov.ar/goesr_l2/animaciones/animacionGOESU.aspx`.
- Secuencia CONAE: `https://catalogos4.conae.gov.ar/goesr_l2/animaciones/recuperarListaImagenes.aspx`.
- Meteored previstos: `/api/location/v1/search/txt/{text}`, `/api/forecast/v1/hourly/{hash}` y `/api/forecast/v1/daily/{hash}`.

## Pruebas realizadas

| Prueba | Resultado |
| --- | --- |
| Sintaxis JavaScript | Correcta: `node --check js/dashboard.js` finalizó sin errores. |
| Formato del diff | Correcto: `git diff --check` finalizó sin errores. |
| Radar HTTPS | Confirmado: `200 image/png`. |
| Endpoint CONAE | Confirmado: `POST 200`, JSON con seis cuadros reales de GOES-19 Infrarrojo para Argentina. |
| Imágenes CONAE | URLs HTTPS entregadas por el catálogo; sin contenido mixto. |
| CORS CONAE | La página y endpoint declararon `Access-Control-Allow-Origin: *`; OPTIONS respondió 404, por lo que la implementación emplea `FormData` como solicitud CORS simple, sin preflight. |
| Meteored localización | Confirmado: `200`, `ok: true`, hash de Ituzaingó resuelto. |
| Meteored horario | Confirmado: `200`, `ok: true`, 24 horas y campos reales procesados. |
| Meteored diario | Confirmado: `200`, `ok: true`, 5 días y campos reales procesados. |
| Meteored CORS | Confirmado: OPTIONS `200`, permite `X-API-Key` y origen `*`. |
| Mapa / Leaflet | Eliminado; se verificará que no quede ningún recurso o referencia en el control estático. |

## Recomendaciones para v1.0

1. Proporcionar la API key de Meteored mediante un secreto de backend o una configuración controlada, y ejecutar solo las dos consultas de prueba solicitadas.
2. Reemplazar ClimaSurGBA por un proveedor de radar con licencia comercial y HTTPS antes de activar anuncios.
3. Confirmar por escrito las condiciones de redistribución y uso comercial de las imágenes GOES-19 de CONAE antes de activar anuncios.
4. Probar visualmente la animación CONAE publicada en GitHub Pages y dentro del iframe de Blogger.
