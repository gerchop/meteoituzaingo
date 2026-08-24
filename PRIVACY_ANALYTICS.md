# Privacidad y analítica técnica — v1.4

> Este documento describe la implementación técnica. No sustituye una política de privacidad, asesoramiento legal ni una evaluación de obligaciones aplicables según jurisdicción.

## Proveedor

La analítica de audiencia usa Cloudflare Web Analytics mediante su beacon oficial. No se usa Google Analytics, D1, el Worker histórico ni un sistema propio de tracking de visitantes.

## Datos y almacenamiento

Según la documentación de Cloudflare Web Analytics, el producto está diseñado sin cookies y sin seguimiento individual. El beacon permite producir métricas agregadas sobre páginas/rutas, host, referrer, país, dispositivo, navegador, sistema operativo y rendimiento web; la disponibilidad concreta depende del panel y de la configuración del navegador.

Meteo Ituzaingó no envía manualmente al beacon:

- nombre, email, teléfono ni datos de formularios;
- direcciones IP, coordenadas precisas, identificadores de usuario ni perfiles;
- API keys, secretos, tokens de Worker o contenido de CSV;
- eventos personalizados en esta versión.

El sitio no lee ni escribe cookies, `localStorage` ni identificadores publicitarios para la analítica. Como proveedor que recibe solicitudes web, Cloudflare puede procesar metadatos técnicos necesarios para entregar el beacon y generar informes; la aplicación no conserva direcciones IP ni construye identificadores propios. Consultar la documentación y condiciones vigentes de Cloudflare para el tratamiento del proveedor y su retención, indicada para Web Analytics como hasta seis meses.

## Consentimiento

Por su diseño sin cookies, v1.4 no incorpora un banner de cookies exclusivamente para Cloudflare Web Analytics. Esto no determina por sí solo la obligación de consentimiento, aviso o base legal de cada publicación: el responsable del sitio debe revisar la normativa aplicable y el contexto de sus visitantes, especialmente si se distribuye desde Blogger o se dirige a otras jurisdicciones.

## Entornos y seguridad

El beacon se desactiva en `localhost`, `127.0.0.1` y `::1`, evitando contaminar las métricas con desarrollo local. El Site Token de Web Analytics es visible en el HTML por diseño y sólo identifica la propiedad; no concede acceso administrativo ni sustituye secretos. Las credenciales reales continúan fuera del repositorio.

Los bloqueadores de contenido pueden impedir la carga del beacon. El sitio no intenta evadirlos y sigue funcionando sin analítica.

## Blogger y futura monetización

Si el dashboard se publica directamente en Blogger u otro host, se debe registrar ese host como una propiedad separada y usar su token correspondiente. Un iframe que conserve el documento en GitHub Pages mantiene la medición de ese host.

AdSense, publicidad programática, Google Ads o analítica adicional no están instalados. Podrían introducir cookies, identificadores, transferencias de datos, un banner o CMP y requisitos de consentimiento adicionales. Deberán evaluarse por separado antes de activarse.

## Referencias técnicas

- [FAQ de Cloudflare Web Analytics](https://developers.cloudflare.com/web-analytics/faq/)
- [Origen y recopilación de datos](https://developers.cloudflare.com/web-analytics/data-metrics/data-origin-and-collection/)
- [Tipos de analítica de Cloudflare](https://developers.cloudflare.com/analytics/types-of-analytics/)
