# Analítica de audiencia — v1.4

## Proveedor y alcance

Meteo Ituzaingó utiliza **Cloudflare Web Analytics** como única capa de analítica de audiencia. La implementación es estática, no modifica Weather.com, Meteored, el radar, el satélite, el Worker histórico, D1 ni el cron. No hay contador público de visitas.

Cloudflare Web Analytics es el proveedor elegido porque su beacon es liviano, funciona en páginas HTTPS estáticas como GitHub Pages y no requiere un SDK, backend ni costo adicional para este uso. La documentación oficial indica que el producto es gratuito y conserva los datos del panel durante hasta seis meses. No se incorporó Google Analytics 4 ni otro proveedor.

## Configuración técnica

- Configuración central: `js/analytics-config.js`.
- Cargador común no bloqueante: `js/analytics.js`.
- Páginas instrumentadas: `dashboard.html` y `historicos.html`.
- Beacon oficial: `https://static.cloudflareinsights.com/beacon.min.js`.
- El cargador agrega como máximo un beacon por documento mediante una marca global y una comprobación de `script[data-cf-beacon]`.
- No se carga en `localhost`, `127.0.0.1` ni `::1`; GitHub Pages sí se mide.
- El Site Token de Cloudflare se publica deliberadamente en el frontend porque identifica la propiedad de Web Analytics; no es una API key, secreto de Worker ni credencial con permisos administrativos.
- Si el beacon falla o es bloqueado, la página continúa: la analítica no es una dependencia funcional.

La propiedad actual corresponde al host `gerchop.github.io`. La URL y la ruta se envían por el beacon, por lo que `/meteoituzaingo/dashboard.html` y `/meteoituzaingo/historicos.html` quedan diferenciadas como pageviews.

## Acceso y métricas prioritarias

El panel se consulta en **Cloudflare Dashboard → Web Analytics → Meteo Ituzaingó — GitHub Pages**. La fecha de inicio de la línea base es el primer pageview recibido después de publicar v1.4; no se reconstruyen visitas anteriores.

Las métricas a revisar en la primera semana, a 30 días y a 90 días son:

- visitantes únicos estimados, pageviews y tendencia diaria, semanal y mensual;
- páginas y rutas más consultadas, en particular la proporción entre dashboard e Históricos;
- países, host, referrers, tipo de dispositivo, navegador y sistema operativo cuando el panel los informe;
- Core Web Vitals disponibles: LCP, INP y CLS;
- crecimiento de audiencia y procedencia del tráfico para orientar contenido, rendimiento y una eventual monetización.

Cloudflare Web Analytics no ofrece una métrica fiable de usuarios que regresan ni funnels basados en identificación individual. Por eso no se usa para afirmar recurrencia de personas concretas.

## Eventos

No se instrumentaron eventos personalizados. La documentación actual de Cloudflare Web Analytics no ofrece soporte para custom events; inventar un sistema propio o usar D1 para visitas contradiría el alcance y la privacidad de v1.4.

Eventos a reevaluar si Cloudflare incorpora soporte oficial, sin datos personales ni contenido sensible:

| Evento futuro | Uso |
| --- | --- |
| `history_period_change` | Interés por 24 h, 7 d o 30 d. |
| `history_date_search` | Uso de consulta histórica, sin enviar la fecha. |
| `history_csv_export` | Uso de exportación, sin enviar el archivo. |
| `radar_manual_refresh` | Interés por actualización manual de radar. |
| `satellite_interaction` | Uso general del visor satelital. |
| `satellite_product_change` | Preferencia de producto satelital. |
| `hourly_forecast_interaction` | Interés agregado por el pronóstico horario. |

## Compatibilidad con Blogger

### GitHub Pages actual

La configuración actual resuelve el token por hostname y mide `gerchop.github.io`. No requiere proxy de Cloudflare ni modificaciones en el Worker.

### Publicación futura en Blogger

Si Blogger inserta `dashboard.html` o `historicos.html` en un iframe servido desde GitHub Pages, el documento medido continúa siendo `gerchop.github.io`. Si el JavaScript se publica directamente en Blogger bajo otro host, se debe crear una propiedad de Web Analytics para ese host y agregar su Site Token en `sites` dentro de `js/analytics-config.js`. No se debe reutilizar un token de un dominio raíz distinto.

## Privacidad, bloqueadores y monetización

El detalle técnico de datos y consentimiento está en [PRIVACY_ANALYTICS.md](PRIVACY_ANALYTICS.md). Los bloqueadores de contenido o restricciones del navegador pueden impedir el beacon; las métricas deben interpretarse como agregadas y aproximadas, sin intentar evadir bloqueadores.

AdSense no forma parte de v1.4. Una futura publicidad puede incorporar cookies, consentimiento y una CMP, requisitos separados de la analítica actual. Antes de añadir GA4, Google Ads o un proveedor de eventos se deberá evaluar si la métrica adicional justifica el doble tracking y sus obligaciones de privacidad.

## Contador público futuro

No se mostrará un contador hasta contar con una definición y validación de calidad. Las alternativas a evaluar son total de pageviews, visitantes de los últimos 30 días, observaciones meteorológicas registradas o días con historial. Ninguna equivale automáticamente a «personas que visitaron», especialmente con bots, recargas y bloqueadores.

## Referencias oficiales

- [Cloudflare Web Analytics FAQ](https://developers.cloudflare.com/web-analytics/faq/)
- [Instalación para sitios sin proxy y SPA](https://developers.cloudflare.com/web-analytics/get-started/web-analytics-spa/)
- [Métricas y dimensiones](https://developers.cloudflare.com/web-analytics/data-metrics/dimensions/)
- [Core Web Vitals](https://developers.cloudflare.com/web-analytics/data-metrics/core-web-vitals/)
