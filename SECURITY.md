# Seguridad de frontend y credenciales

## Clasificación

| Elemento | Tratamiento | Estado y recomendación |
| --- | --- | --- |
| `WEATHER_API_KEY` del Worker | Secreto. | Está configurado como secret de Cloudflare Worker; nunca incluir su valor en documentación, HTML o commits. |
| `ADMIN_TOKEN` del Worker | Secreto de alto privilegio. | Sólo Cloudflare Worker Secrets. Nunca usarlo desde frontend o Blogger. |
| API key de Weather.com en `js/dashboard.js` | Credencial expuesta por el diseño actual del frontend. | No se modifica en v1.5 para no arriesgar la observación estable. Migrar la observación actual al Worker en una versión futura y retirar la clave del navegador tras pruebas de cuota, CORS y cache. |
| API key/hash de Meteored en `js/dashboard.js` | Credencial expuesta por el diseño actual del frontend. | Mantener sólo mientras el proveedor lo autorice para este modelo. Evaluar proxy/secret de Worker antes de una migración pública directa a Blogger. |
| Site Token de Cloudflare Web Analytics | Identificador público. | Puede estar en `js/analytics-config.js`; no da permisos administrativos ni reemplaza secretos. |
| GitHub | No almacenar tokens, PAT ni credenciales. | Usar credenciales del entorno de publicación, nunca archivos versionados. |

## Reglas

- `.gitignore` ya excluye variables y directorios locales de Wrangler; verificar `git status` antes de cada commit.
- No registrar secretos en consola, changelog, reportes, URLs de documentación, Issues ni snippets de Blogger.
- No enviar secretos, IPs o datos personales a Cloudflare Web Analytics, D1 o eventos propios.
- Los endpoints `workers.dev` son APIs de aplicación y no deben figurar en sitemap ni usarse como contenido indexable.
- Rotar una credencial si se sospecha exposición fuera del alcance autorizado por su proveedor.

## Recomendación futura: observación Weather.com

El Worker existente ya obtiene Weather.com usando `WEATHER_API_KEY` como secret para la captura histórica. La evolución recomendada es incorporar una ruta pública de observación actual con cache, respuesta mínima y CORS explícito; el dashboard la consumiría en lugar de llamar Weather.com directamente. No se realiza ahora porque cambia la ruta crítica de observaciones, afecta cuota/cache y requiere validación de latencia y disponibilidad antes de retirar la implementación estable.
