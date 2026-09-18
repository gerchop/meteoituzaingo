# Generador privado de pronóstico para redes

v1.8 prepara publicaciones manuales para redes; no integra ni automatiza X, Twitter, Bluesky, Telegram ni otra plataforma. El panel privado está en `https://meteoituzaingo-history.meteoituzaingo.workers.dev/admin/redes` y no pertenece a GitHub Pages, navegación, sitemap ni Analytics.

## Fuente, horario y datos

El Worker obtiene `hourly` y `daily` de Meteored con `METEORED_API_KEY` como Cloudflare Secret únicamente desde el scheduler existente. El resultado se guarda en D1; `expiracion` de upstream es metadata, no permiso para volver a consumirlo. Un estado persistente habilita un ciclo pareado cada cuatro horas (12 requests/día normales), con lease y backoff. Dashboard, panel y generación social sólo leen D1 y nunca pueden disparar Meteored. La generación automática corre con `1 3 * * *`, equivalente a las 00:01 de Argentina (UTC-3 vigente); la fecha, franjas y presentación usan `America/Argentina/Buenos_Aires`.

La franja «Mañana y tarde» toma horas reales de 06:00 a 19:59 y «Noche» las de 20:00 a 23:59. Si Meteored no ofrece las franjas o temperaturas necesarias se guarda `incomplete`, sin inventar texto. El cron de observaciones `*/10 * * * *` permanece independiente.

## Reglas y publicaciones

Desde v1.10 el generador divide el día calendario de Argentina en madrugada (00:00–05:59), mañana (06:00–11:59), tarde (12:00–17:59) y noche (18:00–23:59). Sólo fusiona mañana y tarde cuando ambas son normales y comparten la misma condición validada. Las mínimas/máximas provienen del pronóstico diario Meteored, con fallback horario sólo si falta ese campo.

Los únicos `symbol` JSON v1 autorizados para texto son 3 («Nubes y claros»), 4 («Parcialmente nuboso»), 5 («Cubierto»), 12 («Lluvia débil con cielo parcialmente nuboso») y 13 («Lluvia débil con cielo cubierto»). El catálogo XML histórico no se usa. Un símbolo desconocido no recibe descripción, no interrumpe la generación y se registra una vez por ejecución como observabilidad técnica.

Cada período informa internamente `knownSymbolHours`, `unknownSymbolHours` y `symbolCoverage`. El cielo sólo se describe si los símbolos validados cubren al menos el 60 % de las horas realmente recibidas del período. Así, una minoría conocida no representa horas con código desconocido: `[1,1,1,1,3]` omite el cielo (20 %), `[99,99,4,99,99,99]` también (16,7 %) y `[4,4,4,4,99,99]` sí puede decir «Parcialmente nuboso» (66,7 %). Temperatura, sensación, POP, lluvia validada y viento siguen disponibles independientemente de esa cobertura.

`rain_probability` se muestra cuando alcanza 40 %, o desde 20 % si existe precipitación validada. `rain` es mm/l/m² por hora y sólo se suma si el período local tiene todas sus horas, una vez cada una. Las ráfagas se incluyen desde 35 km/h. «Ventoso» es una regla editorial propia: velocidad máxima de al menos 30 km/h o ráfaga máxima de al menos 45 km/h. Sensación térmica se informa con una diferencia de al menos 3 °C. También son reglas editoriales propias: fresco a ≤10 °C, muy frío a ≤5 °C, caluroso a ≥30 °C y muy caluroso a ≥35 °C; no implican heladas ni clasificaciones oficiales.

La lista centralizada de términos prohibidos impide generar chaparrones, tormentas, granizo, niebla/neblina, heladas, tiempo severo, lluvia intensa/torrencial o temporal. Alertas SMN continúan fuera del generador.

El texto conserva el enlace `https://meteoituzaingo.blogspot.com/`. Los bloques se dividen semánticamente con objetivo de ≤270 caracteres por publicación; el conteo es orientativo y no usa X API. Si se requiere hilo, el enlace queda en la última parte.

## D1 y seguridad

La migración `0002_create_social_forecasts.sql` añade `social_forecasts` con `forecast_date UNIQUE`, texto original/final, partes, estado y contexto resumido. `0005_create_meteored_refresh_state.sql` añade el singleton no sensible para la coordinación de refresh y lo inicia con una espera conservadora de 24 horas. La ejecución automática es idempotente y conserva una edición manual existente; la regeneración autenticada la reemplaza explícitamente. El historial está limitado a 30 registros.

El panel se sirve same-origin desde Workers para que una cookie `HttpOnly; Secure; SameSite=Strict` de 12 horas no dependa de cookies cross-site de GitHub Pages. El token firmado contiene expiración y CSRF aleatorio, nunca la contraseña. Todas las rutas privadas requieren sesión; mutaciones requieren CSRF. Los intentos fallidos se limitan por hash de IP (cinco por quince minutos). Las respuestas privadas usan `no-store`, CSP y cabeceras de seguridad.

Secrets requeridos sólo en Cloudflare: `METEORED_API_KEY`, `SOCIAL_PANEL_PASSWORD` y `SOCIAL_SESSION_SECRET`. No se versionan valores. Los endpoints privados son login/logout, pronóstico actual, historial, regeneración y guardado; los endpoints públicos `/api/forecast/hourly` y `/api/forecast/daily` conservan CORS limitado a GitHub Pages.
