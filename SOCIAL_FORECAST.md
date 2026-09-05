# Generador privado de pronóstico para redes

v1.8 prepara publicaciones manuales para redes; no integra ni automatiza X, Twitter, Bluesky, Telegram ni otra plataforma. El panel privado está en `https://meteoituzaingo-history.meteoituzaingo.workers.dev/admin/redes` y no pertenece a GitHub Pages, navegación, sitemap ni Analytics.

## Fuente, horario y datos

El Worker obtiene `hourly` y `daily` de Meteored con `METEORED_API_KEY` como Cloudflare Secret. El resultado se guarda temporalmente en D1 y se reutiliza hasta su expiración declarada por Meteored; el dashboard público usa el mismo proxy. La generación automática corre con `1 3 * * *`, equivalente a las 00:01 de Argentina (UTC-3 vigente); la fecha, franjas y presentación usan `America/Argentina/Buenos_Aires`.

La franja «Mañana y tarde» toma horas reales de 06:00 a 19:59 y «Noche» las de 20:00 a 23:59. Si Meteored no ofrece las franjas o temperaturas necesarias se guarda `incomplete`, sin inventar texto. El cron de observaciones `*/10 * * * *` permanece independiente.

## Reglas y publicaciones

Los símbolos Meteored priorizan tormentas, lluvia, niebla, nubosidad, parcialidad y cielo despejado. El viento usa dirección dominante sólo si representa al menos 55 % de las horas; de lo contrario se declara variable. Sus velocidades usan percentiles 20/80 y redondeo a 5 km/h. Las mínimas/máximas provienen del pronóstico diario Meteored, con fallback horario sólo si falta ese campo.

El texto conserva el enlace `https://meteoituzaingo.blogspot.com/`. Los bloques se dividen semánticamente con objetivo de ≤270 caracteres por publicación; el conteo es orientativo y v1.8 no usa X API. Si se requiere hilo, el enlace queda en la última parte.

## D1 y seguridad

La migración `0002_create_social_forecasts.sql` añade `social_forecasts` con `forecast_date UNIQUE`, texto original/final, partes, estado y contexto resumido. La ejecución automática es idempotente y conserva una edición manual existente; la regeneración autenticada la reemplaza explícitamente. El historial está limitado a 30 registros.

El panel se sirve same-origin desde Workers para que una cookie `HttpOnly; Secure; SameSite=Strict` de 12 horas no dependa de cookies cross-site de GitHub Pages. El token firmado contiene expiración y CSRF aleatorio, nunca la contraseña. Todas las rutas privadas requieren sesión; mutaciones requieren CSRF. Los intentos fallidos se limitan por hash de IP (cinco por quince minutos). Las respuestas privadas usan `no-store`, CSP y cabeceras de seguridad.

Secrets requeridos sólo en Cloudflare: `METEORED_API_KEY`, `SOCIAL_PANEL_PASSWORD` y `SOCIAL_SESSION_SECRET`. No se versionan valores. Los endpoints privados son login/logout, pronóstico actual, historial, regeneración y guardado; los endpoints públicos `/api/forecast/hourly` y `/api/forecast/daily` conservan CORS limitado a GitHub Pages.
