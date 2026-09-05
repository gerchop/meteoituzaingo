# Changelog

## v1.8 - 2026-09-05

- Se incorporó un generador diario y determinístico de pronóstico para redes, basado en datos reales horarios y diarios de Meteored, con texto breve de mañana/tarde, noche, viento, mínimas/máximas y enlace al blog; no publica en ninguna red social.
- Se añadió el panel privado same-origin del Worker con login, sesión temporal firmada, CSRF, limitación básica de intentos, edición, regeneración, copia por publicación e historial de hasta 30 pronósticos.
- Se creó la migración no destructiva para pronósticos, caché Meteored y límites de login; `forecast_date` es único para que la generación diaria sea idempotente.
- Meteored se trasladó a un proxy cacheado del Worker y su credencial dejó de viajar en el dashboard público. Se agregó el cron `1 3 * * *` para las 00:01 de Argentina y se conservó la captura `*/10 * * * *`.

## v1.7.1 - 2026-09-05

- Se corrigieron los endpoints de estadísticas que podían finalizar con `error code: 1102` de Cloudflare Workers y provocar el mensaje de indisponibilidad aunque D1 tuviera datos reales.
- La conversión UTC a calendario `America/Argentina/Buenos_Aires` ahora se memoriza por día UTC durante cada agregación, evitando ejecutar `Intl` por cada observación. Se conservan el timezone, la metodología de lluvia, los contratos JSON y la agregación en backend.
- Se verificó la hidratación publicada de meses `2026-08` y `2026-09`, el año `2026`, las estadísticas parciales de septiembre, el año en curso, todo el histórico y ambos gráficos diarios.

## v1.7 - 2026-09-05

- Se añadió en `historicos.html` una capa de estadísticas reales por mes, año y «Desde el inicio», con opciones derivadas de D1, extremos con fecha/hora argentina, medias registradas, humedad, presión, racha máxima, lluvia, día más lluvioso, días con precipitación, observaciones y cobertura.
- Se incorporaron `GET /api/statistics/info` y `GET /api/statistics`: el Worker agrega datos y devuelve sólo resultados y series diarias compactas para Chart.js; no se descargan registros masivos al navegador ni se crean tablas, índices, D1, Worker o cron nuevos.
- Los acumulados de período y el día más lluvioso reutilizan la metodología validada de lluvia diaria de v1.6. Las comparativas de meses/años en curso usan el mismo tramo transcurrido del período anterior; sin cobertura suficiente se informa la limitación y la lluvia se expresa como diferencia absoluta.
- El bloque pasó a llamarse «Récords de la estación» y suma el día más lluvioso, siempre delimitado desde el inicio real del histórico. Los resultados no se presentan como climatología oficial.
- Se documentaron metodología, cobertura, límites y contratos en `STATISTICS.md`, `HISTORY_API.md`, `DAILY_SUMMARY.md`, `README.md` y `AI_INSTRUCTIONS.md`.

## v1.6.1 - 2026-09-04

- Se retiró de Home el bloque local «Registros recientes», que resumía una ventana parcial de `localStorage` y podía contradecir los extremos diarios de D1.
- «Resumen de hoy» queda como única referencia visible de máximas, mínimas, ráfaga, humedad, presión, lluvia, horarios y cobertura del día argentino.
- Se renombró el encabezado público a «Resumen diario», sin cambiar cálculos, endpoint, precipitación, tendencias de cabecera ni servicios meteorológicos.

## v1.6 - 2026-09-04

- Se incorporó el resumen meteorológico diario basado en observaciones reales de Cloudflare D1: máximas, mínimas, horas de extremos, humedad, presión, viento, ráfaga, lluvia y cobertura.
- La Home muestra una frase local determinística y compara hoy hasta ahora con ayer hasta la misma hora; el resumen de Históricos reutiliza el selector de fecha y presenta los extremos diarios disponibles.
- Se agregó `GET /api/daily-summary`, con límites de día en `America/Argentina/Buenos_Aires`, validación de datos y consultas acotadas al rango diario.
- La precipitación diaria se calcula desde `precip_total` con primera lectura, diferencias consecutivas y manejo de reinicios; no se suman acumulados completos.
- Se documentaron metodología, API, cobertura, limitaciones y uso editorial futuro sin crear servicios, bases ni tareas nuevas.

## v1.5 - 2026-08-28

- Se reforzó el SEO técnico de Dashboard e Históricos con títulos, descripciones, canonical, Open Graph, Twitter Cards, favicon y datos estructurados `WebSite`/`WebPage` válidos en HTML estático.
- Se añadieron `sitemap.xml` y `robots.txt` en la raíz de GitHub Pages, exclusivamente con las dos páginas públicas canónicas.
- Se mejoró la semántica de cabecera y footer, la navegación interna crawlable, el texto descriptivo mínimo y el foco visible sin cambiar la identidad gráfica.
- Radar y satélite conservan carga diferida y ahora declaran decodificación asíncrona para reducir trabajo de renderizado no crítico.
- Se documentaron Search Console, seguridad de credenciales, preparación responsable de AdSense y la integración final recomendada con Blogger; no se instalaron anuncios, verificaciones, `ads.txt`, contadores ni servicios pagos.

## v1.4 - 2026-08-24

- Se incorporó Cloudflare Web Analytics mediante el beacon oficial para `dashboard.html` e `historicos.html`, sin cambios visuales ni funcionales en los servicios meteorológicos.
- Se centralizaron el Site Token público por host y el cargador no bloqueante; el beacon se añade una sola vez por documento y se excluye en `localhost`, `127.0.0.1` y `::1`.
- Se documentaron métricas, privacidad técnica, limitaciones de eventos personalizados, compatibilidad futura con Blogger y consideraciones previas a una eventual monetización.
- No se instrumentaron eventos personalizados, no se creó contador público y no se usaron D1, Worker, cron ni datos de visitantes propios para analítica.

## v1.3.4 - 2026-08-23

- Se corrigió el parser temporal del pronóstico horario Meteored y se restauró la visualización de franjas futuras.
- La selección utiliza el epoch real de `end` en milisegundos, ordena las horas válidas y conserva hasta 12 futuras, incluido el cruce de medianoche.
- Se mantuvieron cache, expiración y consumo de Meteored sin peticiones adicionales del cambio.

## v1.3.3 - 2026-08-23

- Se corrigió la selección del pronóstico horario: «Próximas horas» muestra hasta 12 franjas futuras según el instante actual de Ituzaingó.
- El filtrado usa el timestamp `end` real de Meteored, atraviesa correctamente la medianoche y mantiene el formato de 24 horas.
- La lista se recalcula localmente al comenzar una nueva hora usando el pronóstico cacheado, sin solicitudes Meteored adicionales.

## v1.3.2 - 2026-08-23

- Se corrigió la conversión UTC → `America/Argentina/Buenos_Aires` en las exportaciones CSV.
- Las exportaciones de 24 h, 7 d y 30 d ahora muestran fecha y hora local argentina en formato de 24 horas.
- Las exportaciones y consultas por fecha respetan exactamente el día calendario argentino mediante un rango UTC semiabierto.

## v1.3.1 - 2026-08-23

- Se corrigió el mapeo entre los períodos visuales y los parámetros válidos de exportación CSV (`24h`, `7d`, `30d`).
- La exportación CSV ahora se descarga de forma controlada sin abandonar la página de Históricos, con estado de carga y manejo de errores.
- Se corrigió la exportación de 24 horas, 7 días, 30 días y fecha personalizada.

## v1.3 - 2026-08-23

- Se añadieron comparativas de 24 h, 7 días y 30 días contra el período anterior equivalente, calculadas en Cloudflare D1.
- Se incorporaron resumen diario narrativo y por indicadores, consulta de una fecha real, gráficos actualizables sin recargar y exportación CSV UTF-8 con BOM.
- Se añadieron récords de temperatura, ráfaga, presión y humedad desde el inicio real de la base D1, junto con información de primera, última y total de observaciones.
- Se ampliaron los endpoints históricos del Worker existente con validación estricta de períodos y fechas; no se modificaron D1, cron, la captura ni las fuentes meteorológicas.

## v1.2.1 - 2026-08-20

- Se corrigió la carga de «Temperatura registrada» en Home: ahora solicita explícitamente las últimas 24 horas mediante el mismo cliente de API utilizado por Históricos.
- Se unificó el acceso a la API histórica en `js/history-api.js` y se eliminó la referencia residual a un período inexistente que convertía un error interno en un falso aviso de indisponibilidad.
- Se corrigieron los tooltips: la dirección del viento se muestra una sola vez y exclusivamente en el gráfico de viento y ráfagas.
- Se centralizó el formato de fecha y hora en `js/datetime-utils.js`, con `es-AR`, `America/Argentina/Buenos_Aires` y reloj de 24 horas en Home, pronóstico, radar, satélite e históricos.

## v1.2 - 2026-08-20

- Se incorporó `historicos.html`, una página dedicada con gráficos reales de temperatura, humedad, presión, viento/ráfagas e intensidad de precipitación.
- Se añadió navegación de retorno al tiempo actual y una previsualización compacta de temperatura de 24 horas con enlace a todos los históricos desde la home.
- Se reutiliza una consulta por período (24 h, 7 d, 30 d), con caché en memoria de diez minutos y agregación horaria existente para períodos largos.
- Se agregó `/api/history/info` para informar la fecha real de inicio del histórico y su cantidad de observaciones.
- El acumulado de lluvia se calcula únicamente como diferencias entre lecturas consecutivas de `precip_total`; no se suman acumulados repetidos.

## v1.1 - 2026-08-19

- Se implementó el histórico permanente real mediante Cloudflare Worker + D1, sin sustituir las observaciones actuales de Weather.com en el dashboard.
- Se creó la captura programada cada 10 minutos con inserción idempotente, timestamps UTC, migración versionada e índice temporal.
- Se incorporó la API propia `/api/current`, `/api/history`, `/api/stats/today` y `/api/stats/daily`, con parámetros validados y CORS configurado para GitHub Pages.
- Se añadió la sección responsive «Temperatura registrada» con gráfico de datos reales, selector 24 horas / 7 días / 30 días, conversión horaria a Argentina y fallback controlado.
- Se mantiene la cuota inicial de Cloudflare Workers Free + D1 Free; no se activaron servicios pagos ni se añadieron secretos al repositorio.

## v1.0 - 2026-08-17

- Se incorporó un registro temporal local de observaciones de la estación, con expiración a 24 horas y un máximo de 96 muestras por dispositivo.
- Se añadieron tendencias de temperatura y presión en la cabecera; se muestran únicamente con una muestra válida a aproximadamente 30 o 60 minutos.
- Se incorporó el indicador de confort, Humidex, índice de calor y wind chill cuando las condiciones observadas permiten aplicar cada fórmula.
- Se añadieron registros recientes locales (máximos/mínimos de temperatura, humedad, presión y ráfagas), correctamente identificados como datos del dispositivo.
- La precipitación ahora diferencia intensidad actual y acumulado; viento incluye velocidad, rumbo cardinal y grados.
- Se creó una sección condicional de condiciones destacadas basada exclusivamente en observaciones locales y umbrales configurables.
- El pronóstico diario ahora traduce el código `symbol` de Meteored a un estado meteorológico profesional, sustituyendo la leyenda genérica «Pronóstico Meteored» sin aumentar consultas.
- Se reforzaron metadatos Twitter, foco visible y protección contra overflow horizontal, sin alterar la identidad visual.
- Se documentó la arquitectura futura de históricos, la preparación para monetización y la analítica futura sin incorporar backend, anuncios ni tracking.

## v0.11 - 2026-08-17

- Se eliminó completamente el mapa meteorológico, Leaflet, sus recursos CDN, controles, listeners y estilos exclusivos para retirar una función con problemas persistentes sin afectar el dashboard.
- Se sustituyó la fuente satelital activa CX2SA por el visor oficial HTTPS de CONAE GOES-19.
- Se incorporó una animación real de seis imágenes de Argentina, inicialmente en Infrarrojo de Onda Larga, con producto seleccionable (Infrarrojo, Visible Banda 2, RGB Microfísica nocturna y Vapor de agua).
- Se añadieron controles de reproducir/pausar, cuadro anterior/siguiente y actualización independiente; la secuencia se renueva cada 30 minutos, según la frecuencia del producto seleccionado en CONAE.
- Se muestra el timestamp UTC provisto por CONAE, atribución visible y un estado de disponibilidad controlado sin interferir con radar, observaciones ni pronósticos.
- Se ajustó el visor satelital para móvil, tablet y escritorio sin cambiar la identidad visual existente.

## v0.10 - 2026-08-15

- Se integró Meteored para los pronósticos horario y extendido de Ituzaingó: muestra datos reales, 12 horas iniciales y 5 días, con caché local gobernada por `expiracion`.
- Se añadió un radar visible de Ezeiza mediante `radarProvider`, con actualización independiente cada 10 minutos, cache busting y botón de actualización manual.
- Se incorporó la sección de imagen satelital y su `satelliteProvider`; se informa la indisponibilidad en GitHub Pages/Blogger HTTPS porque la fuente CX2SA solo respondió por HTTP.
- Se reconstruyó el mapa Leaflet con centro y zoom configurables, teselas OpenStreetMap sin límites locales, botón «Volver», popup con datos reales y redimensionamiento ante cambios de tamaño u orientación.
- Se eliminó el polling de pronósticos no autorizado de Weather.com; Meteored se consulta solo cuando vence su caché.
- Se documentaron las fuentes provisionales, la estrategia de caché y las limitaciones de licencia y contenido mixto.

## v0.9.5 - 2026-08-13

- Se reconstruyó la inicialización de Leaflet: mosaico base optimizado, zoom nativo, botón de retorno, marcador accesible, popup moderno y ajuste de tamaño mediante `ResizeObserver` y `invalidateSize`.
- Se eliminó CSS responsive duplicado sin cambiar la identidad visual.
- Se mejoró el aviso de pronóstico para especificar que el bloqueo es la falta de autorización del endpoint de Weather.com.
- Se auditó OpenWeather y se documentó como fuente complementaria potencial, sin integrar credenciales ni sustituir Weather.com como fuente de la estación.
- Se descartó el radar de ClimaSurGBA: su licencia CC BY-NC-SA no permite el futuro uso comercial y su visor de Ezeiza informa imagen desactualizada.
- Se creó `ARCHITECTURE.md` con una propuesta GitHub Pages + Azure Functions + Azure Table/Blob Storage para históricos propios.

## v0.9 - 2026-07-19

- Se auditó Weather.com/Weather Underground y Weathercloud; se incorporó `DATA_SOURCES.md` con endpoints, autenticación, licencias, resultados de autorización y funcionalidades pendientes.
- Se verificó que la clave actual autoriza las observaciones PWS actuales, pero devuelve `401` para históricos rápidos, históricos de 7 días, históricos por fecha e índice UV. No se habilitaron gráficos ni datos simulados.
- El pronóstico conserva la integración oficial de Weather.com y comunica la limitación de licencia cuando los endpoints de pronóstico no están habilitados.
- Se configuró el zoom inicial del mapa y se garantiza que el popup de la estación se sincronice aun si la observación llega antes de que Leaflet termine de inicializarse.
- Se añadieron metadatos Open Graph, robots y datos estructurados `WeatherStation` para mejorar SEO técnico sin alterar la interfaz.
- No se integraron radar, calidad del aire, alertas, astronomía ni capas satelitales: requieren productos/licencias no autorizados o una fuente compatible con monetización que no está disponible actualmente.

## v0.8 - 2026-07-19

- Se amplió el renderizado de pronósticos de Weather.com para incluir probabilidad de lluvia y velocidad de viento por hora; el extendido ahora muestra probabilidad de precipitación junto a mínima, máxima, icono y descripción.
- Se identificó visualmente la fuente de los pronósticos cuando los endpoints de Weather.com estén autorizados.
- Se mantiene el aviso de indisponibilidad cuando la clave no autoriza los productos de pronóstico, sin emplear datos simulados.
- No se integró una alternativa gratuita: Open-Meteo y RainViewer restringen sus capas gratuitas a usos no comerciales, incompatibles con la futura monetización prevista para el sitio.
- El mapa Leaflet ahora tiene marcador profesional de la estación, popup actualizado con datos locales y control para volver a centrarlo.
- Se documentó la limitación del radar: el SMN no publica una integración de radar documentada para terceros, por lo que no se incorporaron capas no autorizadas ni imágenes estáticas.

## v0.7 - 2026-07-18

- El estado actual usa `wxPhraseMedium`, `wxPhraseLong` o `wxPhraseShort` cuando la estación lo informa; se añadió una clasificación de respaldo basada en precipitación, humedad y viento.
- Se sustituyó la tarjeta de radiación solar por punto de rocío, obtenido de la API o calculado con la fórmula de Magnus.
- Se incorporaron secciones responsive de pronóstico horario (12 horas) y extendido (5 días), conectadas a los endpoints oficiales v3 de Weather.com.
- Los pronósticos solo se muestran cuando la clave dispone de autorización para esos productos; en caso contrario se informa claramente sin usar datos simulados.
- Se incorporó un mapa de ubicación con Leaflet y OpenStreetMap, compatible con GitHub Pages y Blogger.
- Se preparó la sección de radar meteorológico para conectar una fuente pública en una próxima versión; todavía no incluye capas de radar por no haber una fuente abierta validada en esta implementación.

## v0.6 - 2026-07-18

- Rediseño completo del dashboard con una cabecera y jerarquía visual renovadas.
- Diseño responsive creado con enfoque móvil primero.
- Tarjetas de condiciones modernizadas y agregado de la lectura de ráfagas.
- Corrección de textos UTF-8 y reemplazo de emojis por iconos de Font Awesome.
- Mejoras de accesibilidad, estados de carga/error y manejo seguro de datos incompletos.
