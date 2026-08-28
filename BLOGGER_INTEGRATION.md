# Integración final con Blogger

## Decisión recomendada

La migración final debe integrar directamente el contenido principal de Meteo Ituzaingó en la plantilla o en una página estática de Blogger. GitHub Pages debe continuar como **staging** y entorno de pruebas. Un iframe puede servir como transición breve, pero no como arquitectura pública definitiva: el contenido dentro del frame tiene una URL y contexto de indexación separados, limita la integración editorial de Blogger y complica la atribución de Analytics y AdSense.

Los servicios de datos permanecen externos y sin cambios:

```text
Blogger (HTML, CSS, navegación, contenido editorial y SEO)
  ├─ Weather.com / Meteored / radar / CONAE desde el frontend existente
  ├─ Cloudflare Web Analytics para el host público final
  └─ Cloudflare Worker + D1 para históricos y API JSON
```

## Estrategias evaluadas

| Aspecto | Iframe de GitHub Pages | Integración directa en Blogger |
| --- | --- | --- |
| SEO del contenido meteorológico | Débil: el contenido principal pertenece al documento embebido. | Recomendado: contenido, títulos y datos estructurados pertenecen a la URL editorial. |
| Rendimiento | Carga un documento adicional y puede duplicar recursos. | Una sola composición, con control de recursos y layout. |
| Analytics | Mide el host del iframe; Blogger requiere otra propiedad si también se mide. | Requiere propiedad/token del host Blogger y mide la URL final. |
| AdSense | Menos control de contexto y políticas del documento contenedor. | Mejor encaje con la interfaz y herramientas de Blogger. |
| Mantenimiento | Rápido al inicio, pero dos contextos y navegación fragmentada. | Requiere migración inicial, luego una arquitectura pública coherente. |
| Responsive y accesibilidad | Riesgo de altura, foco y navegación entre documentos. | Se adapta al tema con una única semántica. |

## URLs y configuración

Mientras GitHub Pages sea producción, canonical, Open Graph, sitemap y navegación se mantienen en `https://gerchop.github.io/meteoituzaingo/`. Al migrar, actualizar en una única entrega:

1. canonical y `og:url` de cada página a las URLs públicas Blogger;
2. `WebSite.url` y `WebPage.url` del JSON-LD;
3. `sitemap.xml`, `robots.txt` y enlaces internos;
4. propiedad de Search Console y envío del sitemap final;
5. configuración por host en `js/analytics-config.js` con un Site Token de Cloudflare Web Analytics creado para Blogger;
6. CORS de Cloudflare Worker: agregar el origen HTTPS exacto del blog a `ALLOWED_ORIGINS` en `cloudflare/wrangler.jsonc` y redesplegar únicamente el Worker cuando se publique HTML directamente.

No usar `*` en CORS ni reutilizar el Site Token de un dominio raíz distinto. El iframe que conserve `src` en GitHub Pages no necesita el cambio CORS, pero tampoco ofrece los beneficios SEO de la integración directa.

## Dónde alojar cada componente

- **Blogger:** HTML de página/plantilla, navegación, footer, metadatos SEO de la URL final, CSS y JavaScript público revisado.
- **GitHub Pages:** staging, prototipos, versionado y sitemap/robots de ese entorno mientras permanezca indexable.
- **Cloudflare Worker + D1:** API histórica, captura programada y secretos; no se copian a Blogger.
- **Proveedores externos:** Weather.com, Meteored, ClimaSurGBA y CONAE conservan sus flujos, atribuciones y limitaciones de licencia.

## Checklist de migración

- [ ] Hacer backup del tema y contenido de Blogger.
- [ ] Crear una página de prueba no indexada en Blogger y copiar HTML/CSS/JS sin claves nuevas.
- [ ] Adaptar navegación Inicio/Históricos a URLs Blogger crawlables.
- [ ] Configurar el origen Blogger HTTPS exacto en CORS y validar API histórica.
- [ ] Crear una propiedad de Cloudflare Web Analytics para el host Blogger y añadir sólo su Site Token público.
- [ ] Cambiar canonical, Open Graph, JSON-LD, sitemap y robots a las URLs finales.
- [ ] Verificar propiedad de Google Search Console y enviar el sitemap final.
- [ ] Revisar desktop, tablet y 360/390/430 px.
- [ ] Validar Weather.com, Meteored, radar, satélite, históricos, CSV y Analytics.
- [ ] Evaluar AdSense y consentimiento antes de añadir anuncios.
- [ ] Mantener GitHub Pages como staging; no eliminarlo hasta estabilizar la publicación final.

## Restricciones de seguridad y monetización

No poner secretos de Cloudflare en Blogger. El Site Token de Web Analytics es público por diseño; las claves de Worker continúan como secretos de Cloudflare. Antes de monetizar, revisar la compatibilidad contractual de las fuentes visibles y las obligaciones de privacidad, consentimiento y CMP que traiga AdSense.
