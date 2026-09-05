# Informe de implementación v1.8.2

## Corrección de lectura de CSRF

La causa raíz fue un desajuste de contrato en `socialScript()`: el helper `api()` devolvía siempre `body.data`, pero `POST /api/admin/login` devuelve correctamente `{ ok: true, csrf: "…" }` en la raíz. Por ello `result` era `undefined` y la lectura `result.csrf` provocaba el error visible. El backend, secrets y contrato de login no requerían cambios.

El helper ahora admite respuestas raíz con `raw:true`, valida que exista `result.csrf` antes de asignarlo y muestra un mensaje controlado si falta. Se agregó `GET /api/admin/session`, protegido por la cookie existente, para restaurar el CSRF al recargar: F5 mantiene la sesión y permite mutaciones con el mismo token firmado.

Producción: el JavaScript descargado validó con Node; login devolvió `200`, `csrf` raíz presente y sin `data`; sesión restaurada devolvió el mismo token; pronóstico cargó con estado `generated`; logout devolvió `200` y una consulta posterior `401`. Worker publicado: `e4555069-00fe-49b5-942c-df8c486213b8`.

---

# Informe de implementación v1.8.1

## Corrección urgente del login

El diagnóstico de producción fue correcto: `redes.js` devolvía `200` pero contenía un `SyntaxError: Invalid or unexpected token` cerca de la columna 1209. La fuente afectada era `socialScript()` en `cloudflare/src/index.js`. Dentro de su template literal, `\n` se interpretaba al construir la respuesta y emitía una nueva línea física dentro de una cadena JavaScript delimitada por comillas simples (`...length+'` seguido de salto de línea), que el navegador no puede analizar.

La corrección duplica el escape en la fuente para que el recurso emitido conserve la secuencia JavaScript `\n`. Antes del deploy se evaluó el recurso generado con `new Function`; después del deploy, el recurso descargado de producción validó con Node como `ProductionJavaScript=OK`. La versión publicada del Worker es `95f039d7-baa3-4c8d-9e35-b33d3bba3b57`.

La prueba de producción confirmó `POST /api/admin/login` con contraseña correcta en `200`, CSRF presente y sesión creada; una contraseña incorrecta devuelve `401`. El panel HTML carga desde `/admin/redes`, el formulario y el script quedan disponibles sin SyntaxError. No se modificaron secrets, D1, Meteored, dashboard ni funciones públicas.

---

# Informe de implementación v1.8

## Generador privado para redes

La auditoría confirmó que Meteored se consumía directamente desde el dashboard y su caché sólo vivía en `localStorage`; esa caché no podía ser utilizada por un cron. v1.8 trasladó la solicitud al Worker existente con `METEORED_API_KEY` como Secret, cache persistente D1 hasta la expiración informada por Meteored y endpoints públicos equivalentes para no alterar las tarjetas de pronóstico.

Se agregó la migración no destructiva `0002_create_social_forecasts.sql`: pronósticos únicos por fecha, caché de fuente y límites de login. El cron existente `*/10 * * * *` continúa capturando Weather.com; `1 3 * * *` genera alrededor de las 00:01 de Argentina. La primera generación manual publicada produjo el 05/09/2026 una publicación real de 227 caracteres, con estado `generated`, a partir de 24 horas y cinco días Meteored.

El panel privado se sirve same-origin en `https://meteoituzaingo-history.meteoituzaingo.workers.dev/admin/redes`, sin Analytics, sitemap ni datos privados embebidos. Login, sesión firmada de 12 horas, cookie HttpOnly/Secure/SameSite=Strict, CSRF para mutaciones, logout y rate-limit de cinco fallos por quince minutos protegen la edición, regeneración e historial. No existe integración ni publicación automática en X.

---

# Informe de implementación v1.7.1

## Corrección de estadísticas y selectores

La causa raíz fue un excedente de CPU del Worker publicado (`error code: 1102`), no una ausencia de datos ni un error de CORS. `statisticsInfo()` y `dailyStatistics()` invocaban `Intl.DateTimeFormat` indirectamente para cada fila D1 al traducir UTC al calendario argentino. Al solicitar el histórico completo, esas miles de conversiones podían superar el límite de CPU y el frontend recibía el fallback «Estadísticas temporalmente no disponibles».

Se reemplazó esa repetición por una caché de fecha local por día UTC: cada día se resuelve con las utilidades existentes de `America/Argentina/Buenos_Aires` y sus observaciones reutilizan el resultado. No se codificó UTC-3, no se cambió el contrato API, la tabla, el índice, el cron ni la metodología de precipitación. El Worker corregido quedó desplegado como `6489d6c5-a144-4464-b143-7cd0a48ff012`.

La auditoría D1 real encontró inicio `2026-08-19T19:39:27.000Z`, última observación `2026-09-05T18:59:19.000Z`, 2383 filas, agosto con 1764 observaciones y septiembre con 619. El endpoint público devuelve esos dos meses y el año 2026. Para septiembre, sus 619 observaciones, mínima `5,8 °C`, máxima `24,0 °C` y ráfaga `30,6 km/h` coinciden con una consulta D1 independiente; el mes se informa correctamente como parcial y contiene cinco agregados diarios.

Tras el deploy, `statistics/info`, mes, año y todo el histórico respondieron `200`; CORS devolvió exactamente `https://gerchop.github.io`; un parámetro inválido devolvió `400`. Una carga headless de GitHub Pages confirmó selectores hidratados, tarjetas reales y ambos canvas diarios renderizados, sin el fallback técnico. Un período válido sin filas continúa devolviendo `data: null` para que el frontend muestre «No hay datos disponibles para este período.»

---

# Informe de implementación v1.7

## Estadísticas históricas de la estación

La nueva capa de `historicos.html` consulta meses y años realmente disponibles en D1 y permite elegir un mes, un año o todo el histórico. Muestra extremos con timestamps argentinos, temperatura media registrada, humedad, presión, ráfaga, acumulado de lluvia, día más lluvioso, días con lluvia, observaciones y cobertura. Incluye gráficos diarios de temperatura y precipitación reutilizando Chart.js y la estética existente.

`/api/statistics` agrega los datos dentro del Worker; el frontend recibe indicadores y series diarias, no observaciones crudas masivas. No se modificaron Weather.com, Meteored, radar, satélite, dashboard, Analytics, SEO, sitemap, Search Console, D1, el Worker existente, la captura ni el cron `*/10 * * * *`.

Los límites de todos los períodos son `America/Argentina/Buenos_Aires`. La lluvia se calcula primero por día mediante la regla ya auditada de primera lectura, diferencias y reinicios de `precip_total`; los períodos suman esos resultados diarios. «Día con lluvia» significa un total diario mayor que cero. En empates, las consultas ordenan por timestamp ascendente y muestran la primera ocurrencia real.

La cobertura usa seis observaciones esperadas por hora, de acuerdo con el cron existente. Se considera suficiente para comparativas a partir de 50 % en ambos períodos. Los períodos en curso se contrastan sólo contra el mismo tramo relativo anterior; los cerrados contra el calendario anterior completo. No se usan porcentajes de lluvia, por lo que `0 mm` no produce resultados engañosos.

El histórico sigue siendo una base propia en crecimiento: toda interfaz emplea «registros de la estación» y «datos disponibles», nunca récord climatológico oficial. Los años parciales exponen su rango real. Metodología, límites y contrato se documentan en `STATISTICS.md` y `HISTORY_API.md`.

## Validación de datos reales

- El esquema remoto conserva exclusivamente `weather_observations` y `idx_weather_observations_observed_at`; no hubo migración ni escritura de D1.
- Tras el deploy del Worker, `/api/statistics/info` devolvió meses `2026-08` y `2026-09`, año `2026`, inicio real `2026-08-19T19:39:27.000Z` y el último timestamp disponible en la prueba.
- Para septiembre de 2026, `/api/statistics` devolvió 617 observaciones, 92 % de cobertura, cinco filas diarias y 6,1 mm. La suma independiente de los cinco `daily-summary` del mes también fue 6,1 mm.
- Se verificaron `400` para un período inválido y CORS exacto para `https://gerchop.github.io`. El empaquetado Wrangler, `node --check` de Worker/frontend y `git diff --check` completaron sin errores funcionales.

---

# Informe de implementación v1.6.1

## Corrección de registros diarios en Home

La auditoría confirmó que el bloque «Registros recientes» no usaba D1. `guardarObservacionLocal()` guardaba respuestas directas de Weather.com en `localStorage` por navegador, descartaba muestras con más de 24 horas y retenía un máximo de 96. `mostrarRegistrosRecientes()` calculaba sus máximas/mínimas sobre esa ventana local. Por lo tanto, su cobertura dependía de cuándo se abrió el dashboard, de la persistencia del navegador y de cuántas actualizaciones locales habían ocurrido; si sólo había lecturas similares, máxima y mínima podían coincidir.

En contraste, «Resumen de hoy» usa `GET /api/daily-summary` sobre observaciones persistentes de D1, delimitadas en `America/Argentina/Buenos_Aires`, con horas de extremos, cobertura y metodología de precipitación ya validada. Ambos bloques parecían describir el mismo día, pero no medían el mismo universo de datos, causando una inconsistencia de UX.

Se eliminó solamente el HTML, CSS y renderizado específico de «Registros recientes». El historial local y `localStorage` continúan porque las tendencias breves de temperatura, presión y viento de la cabecera los necesitan. No se cambió backend, endpoint, D1, cron, cálculo diario, lluvia, Históricos, SEO, Analytics, sitemap ni archivo de verificación de Google.

La etiqueta pública del bloque autoritativo cambió de «Registros permanentes» a «Resumen diario». Desde v1.6.1 es la única respuesta visible en Home para extremos y acumulados del día.

## Pruebas

- `node --check` y `git diff --check` sobre los archivos modificados.
- Auditoría estática: no quedan `recentRecordsSection`, `recentRecords` ni `mostrarRegistrosRecientes` en Home.
- GitHub Pages publicado respondió `200`: el HTML ya no contiene `recentRecordsSection` ni «Registros recientes», conserva Analytics y presenta «Resumen diario». Una carga controlada en navegador confirmó tarjetas D1, horarios, ráfaga, precipitación, narrativa y comparación renderizadas correctamente.

---

# Informe de implementación v1.6

## Resultado

v1.6 convierte los registros permanentes de D1 en un resumen meteorológico diario real. La Home incorpora un bloque compacto «Resumen de hoy» y `historicos.html` reutiliza su selector de fecha para presentar el mismo modelo enriquecido. Weather.com, Meteored, radar, satélite, Analytics, SEO, D1, cron, CSV y gráficos existentes se conservaron.

## Backend y timezone

Se añadió `GET /api/daily-summary` al Worker existente `meteoituzaingo-history`; no se crearon Worker, D1, tablas, migraciones, índices ni tareas. El endpoint admite `date=YYYY-MM-DD` opcional y responde `date`, `timezone`, `isCurrentDay`, `data` y `comparison`. Los días usan el rango semiabierto de medianoche a medianoche en `America/Argentina/Buenos_Aires`, convertido a UTC mediante las utilidades existentes.

`data` devuelve primera/última observación, cantidad, cobertura, máximas/mínimas, horas de máximas/mínimas de temperatura, viento y ráfaga, humedad, presión y precipitación. Los valores imposibles se excluyen antes de agregarse; cuando no hay filas el endpoint devuelve `data: null`, sin inventar ceros.

Para eficiencia, el Worker usa el índice temporal existente: una agregación del rango diario, cuatro consultas de extremos con timestamp y una lectura de sólo `observed_at`/`precip_total`, limitada a 300 filas. La Home consulta al iniciar y cada diez minutos; el caché público del endpoint se mantiene en 60 segundos.

## Precipitación y comparación

La auditoría de registros reales confirmó que `precip_total` es acumulativo durante el día local: el 27/08/2026 creció de 0,25 a 17,53 mm y se observaron valores reiniciados después del cambio de día. El resumen toma la primera lectura válida, suma diferencias consecutivas y, si el acumulado disminuye, suma la lectura nueva como reinicio. No suma acumulados completos fila a fila. `precip_rate` conserva su uso como intensidad para gráficos.

La comparación de Home es «hoy hasta ahora» contra «ayer hasta la misma hora», evitando comparar un día parcial con ayer completo. La frase local se genera con reglas determinísticas, omite variables faltantes y sólo informa lluvia cuando existe. Cobertura parcial se indica si faltan más de dos intervalos de diez minutos al inicio o al final.

## Frontend y documentación

- `dashboard.html`, `js/dashboard.js` y `css/dashboard.css`: bloque responsive, siete tarjetas reutilizando la identidad visual, cobertura, frase y comparación compacta.
- `js/history.js` y `js/history-api.js`: resumen diario enriquecido coordinado con el selector de fecha existente; no se agregaron controles nuevos.
- `DAILY_SUMMARY.md` y `HISTORY_API.md`: metodología, contrato, calidad, lluvia, cobertura, consultas y fallback.
- `README.md`, `AI_INSTRUCTIONS.md` y `CHANGELOG.md`: capacidad y restricciones actualizadas.

## Pruebas reales

- `node --check` sobre Worker y scripts modificados; `git diff --check`; empaquetado Wrangler `--dry-run` correcto con los mismos bindings.
- Worker desplegado como versión `60d600bd-0a7d-41d9-ba27-d61bfe7f18eb`; D1 y cron `*/10 * * * *` se conservaron.
- `/api/daily-summary` actual devolvió `200`, `America/Argentina/Buenos_Aires`, datos reales, CORS para GitHub Pages y comparación de mismo intervalo con ayer.
- `/api/daily-summary?date=2026-08-27` devolvió 17,53 mm; un cálculo independiente sobre `/api/history?date=2026-08-27` coincidió exactamente. Máxima, mínima y ráfaga máxima también coincidieron con las filas reales.
- Una fecha previa al comienzo del histórico devolvió `data: null`; una fecha inválida devolvió `400`.
- GitHub Pages publicado respondió `200` para Dashboard e Históricos. Una carga controlada en navegador confirmó el bloque Home renderizado con datos reales y comparación, y el resumen de Históricos coexistiendo con sus gráficos, comparativas y récords. Analytics, sitemap y el archivo de verificación de Google permanecieron accesibles.

## Limitaciones y siguiente paso

El histórico comenzó el 19/08/2026: los resúmenes tempranos o con cobertura parcial se identifican como tales. No se implementaron estadísticas mensuales, efemérides, nuevos récords ni publicaciones Blogger automáticas. La API puede usarse más adelante para contenido editorial sin cambiar la metodología diaria.

---

# Informe de implementación v1.5

## Resultado

v1.5 prepara la publicación y el crecimiento de Meteo Ituzaingó sin alterar las fuentes meteorológicas, el Worker, D1, cron, cachés, gráficos, CSV ni Cloudflare Web Analytics. Las mejoras reales son SEO estático, pequeños ajustes semánticos y de renderizado, y documentación operativa para Search Console, seguridad, AdSense y Blogger.

## SEO e indexación

- `dashboard.html` usa el título **Clima en Ituzaingó | Tiempo actual, pronóstico y radar | Meteo Ituzaingó** y una descripción localizada, natural y directamente disponible en HTML.
- `historicos.html` conserva un título específico y una descripción de sus datos, períodos y variables registradas.
- Ambas páginas incluyen `lang="es"`, `robots=index,follow`, canonical absoluto de GitHub Pages, Open Graph completo (`title`, `description`, `type`, `url`, `site_name`) y Twitter Card `summary`. No se declaró `og:image` ni `summary_large_image` porque no existe aún una imagen social 1200×630 adecuada.
- Se reemplazó el JSON-LD aislado por grafos `WebSite` y `WebPage` con URL, nombre, descripción e idioma. No se inventó un `Dataset` para datos dinámicos ni propiedades meteorológicas no disponibles.
- Se agregaron `sitemap.xml` UTF-8 y `robots.txt` en la raíz. El sitemap contiene sólo `dashboard.html` e `historicos.html`, con URLs absolutas y sin APIs, localhost ni `lastmod` artificial.
- Se creó `favicon.svg`, un recurso vectorial liviano y local.

## HTML, accesibilidad y rendimiento

- Las cabeceras principales ahora son elementos `header`; cada página conserva un único H1 y se añadió contexto textual breve sin sobrecargar el dashboard.
- Se añadieron footer semántico, enlaces HTML crawlables entre Inicio e Históricos, fuentes y foco visible de teclado. No se modificó la distribución de los módulos meteorológicos.
- Radar y satélite mantienen `loading="lazy"` y suman `decoding="async"`. Se mantienen sus contenedores de altura mínima existentes para reservar espacio; no se fijó una relación de aspecto ficticia porque los proveedores entregan imágenes dinámicas de dimensiones variables.
- No se tocaron ciclos de actualización, cachés, peticiones de Meteored, carga histórica, Chart.js ni beacon de Analytics. La importación de Inter ya utilizaba `display=swap`; no se agregaron fuentes ni SDKs.

## Monetización, Blogger y seguridad

- `MONETIZATION.md` define posiciones futuras sin renderizar contenedores ni anuncios. AdSense, Publisher ID, `ads.txt`, CMP y código publicitario quedan fuera de v1.5.
- `BLOGGER_INTEGRATION.md` compara iframe frente a integración directa y recomienda integrar el contenido principal en Blogger, manteniendo GitHub Pages como staging y Worker/D1 como API externa.
- `SEARCH_CONSOLE.md` detalla el procedimiento manual de propiedad, verificación y envío de sitemap sin valores inventados.
- `SECURITY.md` separa secretos de Worker, identificadores públicos y credenciales expuestas por el frontend. Recomienda una futura migración de la observación actual de Weather.com al Worker, pero no la ejecuta por riesgo operativo.

## Auditoría y limitaciones detectadas

La v1.4 no tenía canonical, `og:url`, `og:site_name`, metadatos sociales completos en Históricos, sitemap, robots, favicon ni documentación operativa de Search Console/seguridad. El HTML ya tenía `lang`, descripciones parciales, alt de radar/satélite, carga diferida y navegación básica. No se encontró CSS activo de Leaflet ni CX2SA para retirar.

La futura migración a Blogger deberá sustituir de forma coordinada canonical, URLs de JSON-LD, Open Graph, sitemap, robots, navegación, CORS del Worker y Site Token de Analytics. Los pageviews de v1.4 siguen activos porque los scripts de Analytics permanecen sin cambios.

## Pruebas

- Se verificó que ambos HTML tienen un único H1, canonical, descripción, metadatos Open Graph/Twitter, scripts de Analytics y enlaces internos.
- Se validó el JSON-LD de ambas páginas con `JSON.parse` y el XML del sitemap con el parser XML del sistema.
- Se verificó la sintaxis de `robots.txt`, que las URLs del sitemap son absolutas y que no incluye API, localhost ni rutas privadas.
- Se ejecutaron `node --check` sobre scripts actuales, `git diff --check` y comprobaciones estáticas de recursos/atributos nuevos.
- GitHub Pages publicado respondió `200` para Dashboard, Históricos, sitemap, robots y favicon. Se confirmaron en producción ambos canonical, los grafos `WebSite`/`WebPage`, las dos URLs del sitemap, su referencia desde robots y las referencias existentes al cargador de Analytics.
- Search Console y AdSense requieren acciones manuales/autenticadas y no se simularon. La propiedad de Analytics conserva el mismo cargador y Site Token de v1.4; sus métricas agregadas se verifican desde el panel autenticado de Cloudflare.

## Recomendación v1.6

Validar los metadatos publicados en Search Console y un validador de resultados enriquecidos, crear una imagen social 1200×630 antes de usar `og:image`, y planificar la migración de Weather.com al Worker sólo mediante una versión dedicada con pruebas de cuota, cache, CORS y reversión.

---

# Informe de implementación v1.4

## Resultado

Se integró Cloudflare Web Analytics para medir pageviews reales de `dashboard.html` e `historicos.html`, sin alterar Weather.com, Meteored, radar, satélite, el Worker `meteoituzaingo-history`, D1, cron, API histórica, gráficos ni CSV. No se añadieron componentes visuales, SDKs ni servicios pagos.

## Implementación

- `js/analytics-config.js` centraliza el proveedor, URL del beacon, hosts locales excluidos y el Site Token público correspondiente a `gerchop.github.io`.
- `js/analytics.js` se carga con `defer`, resuelve el token por `location.hostname` y crea el script oficial de Cloudflare con `type="module"`, `async`, `src="https://static.cloudflareinsights.com/beacon.min.js"` y `data-cf-beacon`.
- El cargador evita cargas duplicadas mediante `window.__meteoAnalyticsBeaconLoaded` y una comprobación de `script[data-cf-beacon]`.
- `dashboard.html` y `historicos.html` incluyen los dos archivos comunes. No existen otras páginas públicas HTML en el repositorio.
- El Site Token es un identificador público del beacon, no un secreto ni una credencial administrativa. No se añadieron API keys, Account IDs, secretos ni variables de Worker.

## Eventos, privacidad y rendimiento

Cloudflare Web Analytics no soporta eventos personalizados en su implementación actual, por lo que no se instrumentaron clics, períodos históricos, CSV, radar, satélite ni pronóstico. `ANALYTICS.md` deja priorizados los eventos para reevaluación futura, sin inventar un tracker propio ni usar D1.

El beacon se omite en `localhost`, `127.0.0.1` y `::1`. No usa cookies ni almacenamiento local desde el código de Meteo Ituzaingó; no se envían datos personales, IP, contenido de CSV, claves ni datos de formularios. `PRIVACY_ANALYTICS.md` documenta el alcance técnico, bloqueadores, Blogger y los requisitos separados que podría introducir AdSense.

La carga se realiza después de los scripts funcionales y de forma asíncrona. Si la solicitud falla o un bloqueador la impide, no afecta al dashboard ni a Históricos y no se muestra ningún error al visitante.

## Pruebas y publicación

- Se validó sintaxis con `node --check` para los dos scripts agregados.
- Se verificó estáticamente que ambas páginas incluyen exactamente una carga del iniciador común, que el token sólo figura en la configuración central y que no se modificaron archivos meteorológicos ni Cloudflare Worker.
- Se validó la exclusión de hosts locales, resolución de `gerchop.github.io` y prevención de duplicados con un DOM simulado.
- Se verificó `git diff --check`.
- GitHub Pages publicado respondió `200` para las dos páginas y ambos scripts de analítica. Cargas únicas con Edge en producción confirmaron que dashboard e Históricos insertan exactamente un `script[data-cf-beacon]`; Históricos conservó gráficos, comparativas, récords y CSV.
- El recurso oficial `https://static.cloudflareinsights.com/beacon.min.js` respondió `200` por HTTPS. El navegador ejecutó el cargador y añadió el beacon; por diseño, esa etiqueta genera el envío de pageview al proveedor.
- El panel autenticado de Cloudflare no es accesible desde este entorno, por lo que la aparición agregada del pageview debe confirmarse en **Cloudflare Dashboard → Web Analytics → Meteo Ituzaingó — GitHub Pages**. Cloudflare advierte que el panel puede demorar en reflejarlo; no se debe interpretar una demora breve como un fallo del beacon.

## Limitaciones y recomendación v1.5

- La métrica es agregada y puede verse reducida por bloqueadores; no se intentará evadirlos.
- No hay recurrencia individual fiable ni eventos personalizados en el proveedor actual.
- Para publicación directa en Blogger u otro host se requiere crear otra propiedad de Web Analytics y añadir su token por host; un iframe que se mantenga en GitHub Pages conserva la propiedad actual.
- Antes de añadir AdSense, GA4 o Google Ads, revisar consentimiento, CMP, privacidad y evitar doble tracking innecesario.

---

# Informe de implementación v1.3.4

## Corrección del parser horario Meteored

La inspección técnica de una única respuesta horaria real confirmó 24 franjas en `data.hours`. Cada objeto contiene el campo temporal `end` como epoch Unix en milisegundos, no como ISO: ejemplo saneado, `{ end: 1787457600000, symbol: …, temperature: … }`. La primera corrección v1.3.3 aplicaba `Date.parse(horaData.end)`; al ser numérico, el resultado era inválido y las 24 franjas quedaban excluidas.

Se agregó `timestampMeteored()`: reconoce explícitamente epoch de milisegundos (13 dígitos), convierte epoch de segundos sólo cuando corresponde y acepta cadenas temporales inequívocas como respaldo. `renderizarHorario()` normaliza, elimina timestamps inválidos, ordena, filtra `timestamp > Date.now()` y finalmente ejecuta `slice(0, 12)`. La comparación usa instantes absolutos; la presentación se mantiene en `America/Argentina/Buenos_Aires` y formato 24 h.

Si la respuesta tuviera horas pero ninguna fecha interpretable, el mensaje ahora indica un problema de interpretación, no una ausencia ficticia de futuro. Se conserva el recálculo local al iniciar la hora y no se modifica `obtenerPronosticoMeteored()`, su cache, expiración, endpoint ni API key.

## Pruebas

- Respuesta real inspeccionada: 24 horas, `end` numérico en milisegundos; no se registraron secretos ni se añadieron sondeos al flujo de la página.
- Casos deterministas para 00:20, 06:30, 12:10, 17:19 y 22:30 verifican normalización, filtro futuro, límite de 12 y cruce de medianoche.
- `node --check`, `git diff --check` y publicación de GitHub Pages verificados.
- Solicitudes Meteored adicionales introducidas por la corrección: 0; la inspección técnica se limitó a las dos lecturas necesarias para identificar la forma real tras un error de formateo local.

---

# Informe de implementación v1.3.3

## Corrección de «Próximas horas»

La implementación anterior renderizaba `data.hours.slice(0, 12)`. Aunque `end` ya era el campo real de fecha/hora de Meteored utilizado para la tarjeta, ese recorte fijo podía mostrar horas pasadas al avanzar el día.

`renderizarHorario()` ahora convierte cada `end` con `Date.parse`, descarta timestamps no válidos o anteriores al instante actual, ordena las franjas futuras y recién entonces conserva hasta doce. `fechaMeteored()` mantiene la presentación explícita en `America/Argentina/Buenos_Aires` y formato de 24 horas. Al ser timestamps absolutos, la comparación no depende de la zona del navegador y atraviesa medianoche sin offset manual.

La respuesta horaria recibida se conserva sólo en memoria. Un temporizador local vuelve a renderizar al inicio de cada hora con esa misma respuesta; no consulta Meteored, no altera su caché, expiración, endpoint, clave ni consumo de API. El pronóstico extendido no se modificó.

## Pruebas

- Sintaxis de `dashboard.js` y `git diff --check`, sin errores.
- Se verificó que el filtrado se realiza antes de `slice(0, 12)` y que no quedan selecciones de horas por índice fijo.
- Escenarios de tarde, medianoche, madrugada y mediodía se cubren por comparación de timestamps futuros; si hay menos de 12, se muestran sólo los disponibles.
- El cambio no crea solicitudes Meteored nuevas: sólo usa la respuesta ya cacheada por `obtenerPronosticoMeteored()`.

---

# Informe de implementación v1.3.2

## Corrección de timezone CSV

D1 conserva `observed_at` en UTC. El problema era doble: el CSV escribía ese valor directamente, por lo que sus horas aparecían tres horas adelantadas, y los límites de fecha usaban un offset fijo en lugar de una conversión centralizada de zona horaria.

`cloudflare/src/index.js` ahora centraliza `argentinaDateToUtcRange(date)`. Interpreta una fecha como medianoche de `America/Argentina/Buenos_Aires`, calcula el rango semiabierto `[inicio, fin)` en UTC y lo entrega a las consultas parametrizadas. Por ejemplo, `2026-08-21` se consulta entre `2026-08-21T03:00:00.000Z` y `2026-08-22T03:00:00.000Z`.

El mismo módulo usa `formatArgentinaDateTime(timestamp)` antes de escribir cada fila CSV. Así, una observación almacenada como `2026-08-21T17:00:00Z` se exporta como `21/08/2026 14:00`. Los períodos móviles 24 h, 7 d y 30 d mantienen su rango real en UTC, pero presentan cada instante en hora Argentina.

No se modificaron registros, tablas, índices, cron, frecuencia ni frontend de gráficos.

## Pruebas

- Sintaxis del Worker y `git diff --check` sin errores.
- Exportaciones CSV 24 h, 7 d, 30 d y fecha personalizada verificadas contra el Worker publicado.
- Se comprobaron los límites `[03:00Z, 03:00Z siguiente)` para la fecha argentina y que todas las filas exportadas pertenecen a la fecha local solicitada.

---

# Informe de implementación v1.3.1

## Corrección de exportación CSV

La interfaz v1.3 almacenaba los valores del selector de gráficos como `hours=24`, `days=7` y `days=30`. Esos valores son correctos para `/api/history`, pero `/api/export.csv` valida exclusivamente `24h`, `7d` y `30d`; por eso el backend respondía correctamente `400` y el enlace directo reemplazaba `historicos.html` por su JSON de error.

`js/history.js` ahora conserva una única variable `activePeriod` con los únicos valores válidos para exportación, y un `customDate` separado para la consulta por fecha. El mapeo explícito `PERIODS` traduce esos valores hacia el formato que necesita sólo el endpoint de gráficos.

El enlace se sustituyó por un botón. Su descarga usa `fetch`, verifica `response.ok` y `Content-Type: text/csv`, crea un `Blob` temporal y descarga nombres como `meteoituzaingo_7d_YYYY-MM-DD.csv`; en fecha personalizada usa `meteoituzaingo_YYYY-MM-DD.csv`. Durante la solicitud queda deshabilitado y muestra un estado localizado. Ante un fallo registra el detalle en consola sin abandonar la página.

No se modificaron Worker, D1, cron, captura, endpoints, gráficos ni fuentes meteorológicas.

## Pruebas

- Validación estática: los únicos valores de botones son `24h`, `7d` y `30d`; los gráficos siguen solicitando `hours=24`, `days=7` o `days=30` mediante el mapeo explícito.
- `node --check` y `git diff --check` sin errores.
- `/api/export.csv?period=24h`, `7d`, `30d` y una fecha registrada devuelven CSV UTF-8; un período inválido mantiene el rechazo `400` del backend.
- Tras publicar, se comprobará que GitHub Pages entrega el script con descarga controlada.

---

# Informe de implementación v1.3

## Resultado

La página `historicos.html` incorpora análisis avanzado con datos reales de D1: comparativas, resumen diario, consulta por fecha, récords y exportación CSV. La Home, Weather.com, Meteored, radar, satélite, D1, Worker y cron se conservaron.

## Endpoints v1.3

- `GET /api/compare?period=24h|7d|30d`: dos bloques agregados mediante `AVG`, `MIN`, `MAX` y `COUNT` para el período actual y el anterior.
- `GET /api/records`: extremos y timestamps desde el inicio de D1, sin transferir el histórico al navegador.
- `GET /api/history?date=YYYY-MM-DD`: muestras de un día argentino para los cinco gráficos existentes.
- `GET /api/stats/daily?date=YYYY-MM-DD`: resumen del día seleccionado; `/api/stats/today` reutiliza la misma ruta de cálculo.
- `GET /api/export.csv?period=…|date=…`: CSV de hasta 30 días, UTF-8 con BOM y separador `;` para compatibilidad con Excel.

Las fechas se validan como `YYYY-MM-DD`, no aceptan futuros y se convierten a límites UTC sólo en el Worker. No se agregaron migraciones ni índices: el índice temporal existente atiende los rangos y el volumen histórico actual.

## Precipitación y rendimiento

La precipitación se calcula dentro del Worker sobre filas del rango mediante diferencias consecutivas de `precip_total`, incluidas reinicializaciones del acumulador. No se suman acumulados repetidos. Los promedios D1 excluyen `NULL` y la comparación/estadística no envía filas al navegador. El CSV sí entrega las filas seleccionadas, limitado a 24 h, 7 d, 30 d o una fecha.

Los gráficos mantienen una solicitud por período y caché de sesión de diez minutos. Comparativa, récords y resumen manejan sus fallos por separado para no bloquear gráficos. Los récords se piden una vez por carga de página.

## Pruebas reales

- Worker existente desplegado como versión `2e671595-536a-4a9d-96da-1085ce25993e`; el cron permanece `*/10 * * * *`.
- Con 570 observaciones reales: `/api/compare?period=24h`, `/api/records`, `/api/history?date=2026-08-19`, `/api/stats/daily` y `/api/export.csv?period=24h` respondieron correctamente.
- El CSV devolvió `text/csv; charset=utf-8` y encabezados UTF-8 con BOM.
- Sintaxis de Worker y JavaScript, además de `git diff --check`, sin errores.

## Recomendaciones v1.4

- Revaluar índices de extremos cuando el histórico crezca significativamente.
- Mantener el límite de exportación de 30 días y revisar cuotas D1 antes de ampliar períodos.
- Verificar visualmente en GitHub Pages la disposición de comparativas, fecha y CSV en 360/390/430 px, tablet y escritorio tras publicar el commit.

---

# Informe de implementación v1.2.1

## Correcciones

### Histórico de Home

La Home tenía una implementación distinta a la de `historicos.html`. Tras retirar el selector de períodos de Home en v1.2, quedaron dos referencias a la variable `periodo`, que ya no existe: una al construir las etiquetas del gráfico y otra al armar la URL. El `ReferenceError` se capturaba en el `catch` y se mostraba erróneamente «Históricos temporalmente no disponibles», aunque Cloudflare y D1 respondían correctamente.

Se creó `js/history-api.js`, usado por ambas páginas. La Home ahora llama explícitamente `fetchHistory("hours=24")`; Históricos usa el mismo método para sus tres períodos. No se modificaron Worker, D1, cron, registros ni frecuencia de captura.

### Tooltips

El callback `afterBody` estaba en la configuración común de Chart.js, por lo que añadía dirección a cada gráfico. Ahora sólo se habilita al crear `windChart`; construye una única línea con rumbo y grados cuando están disponibles. Temperatura, humedad, presión y precipitación ya no reciben ese callback.

### Formato horario

`js/datetime-utils.js` centraliza `formatTime`, `formatDate`, `formatDateTime` y `formatShortDateTime` con locale `es-AR`, zona `America/Argentina/Buenos_Aires` y `hour12: false`. Se aplicó en actualización actual, Meteored horario, radar, históricos, ejes y tooltips. Los timestamps de D1 continúan en UTC y se convierten sólo al presentar.

## Archivos corregidos

- `dashboard.html`, `js/dashboard.js`: carga del módulo común, Home de 24 h y horarios de presentación.
- `historicos.html`, `js/history.js`: módulos comunes, etiquetas de 24 h y tooltips específicos por gráfico.
- `js/history-api.js`: cliente histórico compartido y validación uniforme de respuestas.
- `js/datetime-utils.js`: formato temporal único para el frontend.

## Pruebas realizadas

- `node --check` sobre los módulos nuevos y los scripts de dashboard/históricos, sin errores.
- `git diff --check`, sin errores de espacios.
- Auditoría de scripts: no quedan usos de `toLocaleTimeString`/`toLocaleString` ni formateadores históricos que omitan `America/Argentina/Buenos_Aires`; Meteored conserva su formateador localizado con `hour12: false`.
- Se verificará en GitHub Pages publicado la Home, los tres períodos y los tooltips tras enviar el commit remoto.

---

# Informe de implementación v1.2

## Resultado

v1.2 amplía los históricos permanentes de v1.1 sin cambiar las fuentes de observación actuales ni la infraestructura existente:

```text
Weather.com PWS → Cloudflare Worker → Cloudflare D1 → API JSON → Dashboard / históricos
```

El dashboard conserva su diseño y muestra solamente la vista compacta de temperatura de 24 horas. La exploración avanzada se trasladó a `historicos.html`.

## Recursos Cloudflare conservados

- Worker: `meteoituzaingo-history`.
- URL: `https://meteoituzaingo-history.meteoituzaingo.workers.dev`.
- D1: `meteoituzaingo-history`.
- Binding: `HISTORY_DB`.
- Cron: `*/10 * * * *`.
- No se creó ni recreó ninguna base, Worker, secreto o tarea programada.

El Worker fue desplegado con la versión `36dd1781-a0c7-4cac-a753-176a28a84bd6`.

## Backend

- Se añadió `GET /api/history/info`, que devuelve la primera y última observación disponibles y el total de registros. No consulta Weather.com ni modifica D1.
- `GET /api/history?hours=24` mantiene las muestras disponibles; los períodos de 7 y 30 días mantienen la agregación horaria existente.
- La API conserva CORS restringido a los orígenes configurados y no expone secretos.

## Frontend

- `historicos.html` ofrece períodos de 24 horas, 7 días y 30 días con gráficos de temperatura, humedad, presión, viento y ráfagas, e intensidad de precipitación.
- Cada período realiza una sola solicitud de datos y se reutiliza para todos los gráficos. La respuesta se mantiene en caché de memoria durante diez minutos.
- `js/history-config.js` centraliza la URL del Worker y los colores compartidos para no duplicar configuración entre la home y la página avanzada.
- Los tooltips muestran fecha y hora en `America/Argentina/Buenos_Aires`; incluyen dirección del viento cuando el registro la contiene.
- El resumen del período informa máxima y mínima, humedad máxima, ráfaga máxima, lluvia y variación de presión sólo cuando existen datos suficientes.
- La lluvia se calcula mediante diferencias entre lecturas consecutivas de `precip_total`; no se suman valores acumulados repetidos.
- Si no hay registros o la API falla, se vacían los gráficos y se muestra un estado controlado sin afectar el resto del sitio.

## Datos y pruebas reales

Al verificar el despliegue, D1 contenía 128 observaciones reales, desde `2026-08-19T19:39:27.000Z` hasta `2026-08-20T16:50:13.000Z`.

| Prueba | Resultado |
| --- | --- |
| Despliegue Worker | Correcto, sin modificar cron, D1 ni secretos. |
| `/api/history/info` | `200`, con conteo y límites temporales reales. |
| `/api/history?hours=24` | `200`, muestras reales de D1. |
| `/api/history?days=7` y `days=30` | `200`, agregación horaria real. |
| CORS desde GitHub Pages | Origen `https://gerchop.github.io` autorizado, sin comodín. |
| Sintaxis | `node --check` para Worker y scripts de históricos, sin errores. |
| Integridad de cambios | `git diff --check`, sin errores. |

## Responsive y Blogger

Los paneles usan una columna en teléfono y dos en tablet/escritorio, con altura de gráfico reducida en pantallas pequeñas. La integración prevista con Blogger está detallada en `BLOGGER_INTEGRATION.md`; si se usa un iframe desde GitHub Pages no cambia CORS. Si se publica JavaScript directamente en Blogger, debe añadirse su origen HTTPS exacto y redesplegar el Worker.

## Limitaciones y siguiente versión

- El historial comenzó recientemente: 7 y 30 días mostrarán sólo registros capturados realmente; no se fabrican datos faltantes.
- La dirección del viento no está incluida en las agregaciones horarias largas, por lo que el tooltip la presenta únicamente en registros que la incluyen.
- La precipitación se representa como intensidad; el acumulado requiere al menos dos lecturas de `precip_total` válidas.
- Antes de v1.3 conviene validar visualmente la página publicada en 360, 390 y 430 px, tablet y escritorio, una vez que GitHub Pages reciba este commit.
