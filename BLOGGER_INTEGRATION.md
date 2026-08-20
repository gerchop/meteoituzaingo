# Integración futura con Blogger

El sitio sigue siendo estático y compatible con GitHub Pages.

- Tiempo actual: enlazar o embeber `dashboard.html`.
- Históricos: enlazar `historicos.html` desde una entrada, menú o botón de Blogger.

Si Blogger usa un iframe cuyo `src` es GitHub Pages, las solicitudes históricas conservan el origen de GitHub Pages y no requieren otro cambio CORS. Si se publica el HTML directamente dentro de Blogger, agregar el origen HTTPS exacto del blog a `ALLOWED_ORIGINS` en `cloudflare/wrangler.jsonc` y desplegar el Worker. No usar `*`.
