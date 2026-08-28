# Google Search Console: preparación

Google Search Console no se configura automáticamente en v1.5 porque requiere una cuenta y verificación manual. No se agregó meta tag ni archivo de verificación ficticio.

## GitHub Pages actual

1. Abrir [Google Search Console](https://search.google.com/search-console/) y elegir **Agregar propiedad**.
2. Crear una propiedad de prefijo de URL con `https://gerchop.github.io/meteoituzaingo/`.
3. Elegir uno de los métodos de verificación que Search Console muestre para esa propiedad. Si entrega una meta tag, agregarla al `<head>` de las dos páginas en un cambio separado; no usar un valor inventado.
4. Confirmar que se pueden inspeccionar `dashboard.html` e `historicos.html`.
5. En **Sitemaps**, enviar `https://gerchop.github.io/meteoituzaingo/sitemap.xml`.
6. Usar **Inspección de URL** para solicitar indexación sólo tras confirmar que el HTML publicado, canonical y robots son definitivos.

El sitemap es una señal de descubrimiento, no garantiza indexación inmediata. Revisar en Search Console cobertura/indexación, consultas, CTR, páginas y Core Web Vitals antes de extraer conclusiones.

## Migración futura a Blogger

Al publicar directamente en Blogger, crear o verificar la propiedad del host final, generar/enviar su sitemap, cambiar canonicals y verificar redirecciones o señales de migración. Mantener la propiedad de GitHub Pages como staging. No mezclar sitemaps ni canonicals de hosts diferentes.

## Referencias oficiales

- [Agregar una propiedad](https://support.google.com/webmasters/answer/34592)
- [Informe Sitemaps](https://support.google.com/webmasters/answer/7451001)
- [Crear y enviar un sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
