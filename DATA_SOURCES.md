# Fuentes de datos

Auditoría realizada el 2026-07-19 para Meteo Ituzaingó. Los estados de autorización de Weather.com fueron comprobados con la clave configurada sin registrar ni exponer sus credenciales.

## Weather.com / Weather Underground

| Servicio | Endpoint / método / parámetros principales | Autenticación | Estado con la clave actual | Restricciones y uso comercial |
| --- | --- | --- | --- | --- |
| Observación actual PWS | `GET /v2/pws/observations/current` con `stationId`, `units=m`, `format=json`, `numericPrecision=decimal` | `apiKey` en query | Disponible; es la fuente activa | Sujeto al contrato de The Weather Company (TWC). |
| Pronóstico horario | `GET /v3/wx/forecast/hourly/{duration}` con `geocode`, `units`, `language`, `format` | `apiKey` en query | No autorizado para `1day` | La autorización es independiente por duración. La interfaz queda lista para mostrar temperatura, sensación, lluvia, viento, dirección y humedad si se habilita. |
| Pronóstico diario | `GET /v3/wx/forecast/daily/{duration}` con `geocode`, `units`, `language`, `format` | `apiKey` en query | No autorizado para `5day` | La autorización es independiente por duración. |
| Alertas | `GET /v3/alerts/headlines` con `geocode` | `apiKey` en query | Pendiente de licencia y cobertura | La cobertura documentada no incluye Argentina; requiere evaluar contrato TWC. |
| Índice UV | `GET /v2/indices/uv/current` con `geocode`, `language`, `format` | `apiKey` en query | No autorizado (`401`) | Producto de índices con licencia por API key. |
| Calidad del aire | `GET /v3/wx/globalAirQuality` con `geocode` | `apiKey` en query | Pendiente de licencia | Requiere atribución a Copernicus/ECMWF cuando se use. |
| Astronomía | `GET /v3/wx/forecast/astronomy/daily/1day` con `geocode`, `day`, `month`, `year`, `units`, `language` | `apiKey` en query | Pendiente de licencia | Disponible globalmente como producto TWC, condicionado a autorización. |
| Radar y mapas | Image TileServer / Tiler de Weather Imagery, con inventario, tiempo y teselas XYZ | `apiKey` en query | Pendiente de licencia | El flujo exige obtener series/tiempos antes de pedir teselas; no se usa sin producto autorizado. |
| Históricos rápidos 24 h | `GET /v2/pws/observations/all/1day` con `stationId`, `units`, `format` | `apiKey` en query | No autorizado (`401`) | Sin datos autorizados no se crean gráficos. |
| Históricos horarios 7 días | `GET /v2/pws/observations/hourly/7day` con `stationId`, `units`, `format` | `apiKey` en query | No autorizado (`401`) | Requiere autorización específica. |
| Histórico por fecha | `GET /v2/pws/history/all` con `stationId`, `date=YYYYMMDD`, `units`, `format` | `apiKey` en query | No autorizado (`401`) | No usar como alternativa hasta contratar/habilitar el producto. |

Todos los endpoints de TWC se consultan por `GET` y usan `apiKey` como parámetro de consulta. La licencia comercial, cuotas y atribución dependen del contrato asociado a la clave; no se debe asumir acceso a un producto solo porque exista en la documentación.

## Cloudflare Workers + D1 (v1.1)

| Fuente | Uso | Estado | Restricciones |
| --- | --- | --- | --- |
| Cloudflare Worker `meteoituzaingo-history` | Captura programada de la PWS y API histórica | Activo; cron cada 10 minutos | `WEATHER_API_KEY` y `ADMIN_TOKEN` son Worker Secrets; CORS con orígenes explícitos. |
| Cloudflare D1 `meteoituzaingo-history` | Históricos permanentes de observaciones propias | Activa; tabla `weather_observations` | Conserva UTC, `UNIQUE(observed_at)` e índice temporal. Sujeto a cuotas Workers Free/D1 Free documentadas en `CLOUDFLARE_COSTS.md`. |

Weather.com tiene ahora un segundo uso autorizado: abastecer al Worker programado con las mismas observaciones actuales de la estación `IITUZAIN9`. Meteored continúa reservado exclusivamente para pronósticos.

## Weathercloud

| Servicio | Endpoint / método | Autenticación | Estado | Restricciones y uso comercial |
| --- | --- | --- | --- | --- |
| Envío de datos desde estación | `GET /v01/set` en `api.weathercloud.net`, con `wid`, `key` y medidas | WID y device key | Documentado; no integrado | No almacenar WID, key, usuario ni contraseña en el repositorio. El intervalo documentado para Basic es 10 minutos; Pro/Premium permiten 1 minuto. |
| Lectura de dispositivos/datos v0 | API `data.weathercloud.net` | `Authorization: Bearer {AUTH_KEY}` en endpoints autenticados | Pendiente | Requiere credencial de cuenta y revisión de plan. No se solicita ni almacena la credencial. |
| Históricos, estadísticas y exportación | No confirmados públicamente para la cuenta Basic disponible | No evaluado | Pendiente de confirmar en la cuenta | No integrar hasta verificar plan, límites, licencia y permiso comercial. |
| Ubicación y dispositivos públicos | API v0 lista dispositivos públicos | Según endpoint | No integrado | Puede exponer datos de terceros; no usarlo para sustituir datos propios. |
| Pronósticos y mapas | No documentados como producto de la API de estación auditada | No aplicable | No disponible para esta integración | Sin fuente o licencia comercial confirmada. |

## OpenWeather (auditoría v0.9.5)

| Servicio | Endpoint / método | Autenticación | Plan y estado | Licencia, límites y uso comercial |
| --- | --- | --- | --- | --- |
| Condiciones actuales | `GET /data/2.5/weather` con `lat`, `lon`, `appid` | API key en query | Plan Free disponible; no integrado | El plan publicado indica 60 llamadas/minuto y hasta 1.000.000/mes para sus productos Free. Confirmar aceptación de licencia de la cuenta antes de producción. |
| Pronóstico de 5 días | `GET /data/2.5/forecast` con `lat`, `lon`, `appid` | API key en query | Plan Free disponible; no integrado | Entrega intervalos de 3 horas, por lo que no resuelve el requisito de pronóstico horario completo. |
| One Call | `GET /data/3.0/onecall` con `lat`, `lon`, `units=metric`, `lang=es`, `appid` | API key en query | Requiere suscripción One Call by Call; no integrada | Incluye 48 h horarias, 8 días, alertas y requiere cuenta/clave propia. La documentación indica 1.000 llamadas/día sin cargo en esa suscripción y consumo adicional de pago; validar precio y licencia al contratar. |
| Calidad del aire | `GET /data/2.5/air_pollution`, `/forecast`, `/history` | API key en query | Plan Free publicado; no integrado | Datos actuales, pronóstico 4 días e históricos desde 2020. |
| Índice UV | No existe endpoint UV independiente en el plan Free auditado | Depende del producto | Pendiente | One Call puede incluir `uvi`, sujeto a su suscripción. |
| Históricos meteorológicos | One Call por timestamp y `day_summary` | API key en query | One Call by Call; no integrado | Archivo desde 1979 según documentación, sujeto a producto/costo. |
| Alertas | Campo `alerts` de One Call | API key en query | One Call by Call; no integrado | Depende de que exista emisor gubernamental para la ubicación. |
| Mapas/radar | Teselas Weather Maps y Global Precipitation Maps | API key en query | Mapas actuales figuran en Free; radar/precipitación histórico tiene producto propio | No integrar sin confirmar licencia comercial, atribución y cuota de la cuenta. |

OpenWeather es un complemento potencial, no un reemplazo: Weather.com sigue siendo la única fuente de observaciones de la estación propia. No se incorporó una clave de OpenWeather al repositorio ni se activó un fallback porque no se proporcionó una cuenta, una clave ni aceptación verificable de su licencia comercial. Para una integración futura, la clave debe guardarse como secreto de Azure Function y la web debe consultar un endpoint propio (`/api/forecast`), nunca un `appid` embebido.

## Meteored (v0.10)

| Servicio | Endpoint previsto | Estado | Estrategia |
| --- | --- | --- | --- |
| Localización | `GET /api/location/v1/search/txt/{text}` | Disponible y probado con `X-API-Key` | Ituzaingó, Buenos Aires resolvió al hash `02fb9feb8e7f9462733d7279a5479236`. |
| Pronóstico horario | `GET /api/forecast/v1/hourly/{hash}` | Disponible y probado | Respuesta `ok: true`, 24 horas y CORS `*`; usa temperatura, sensación, símbolo, lluvia, humedad, viento y dirección. |
| Pronóstico diario | `GET /api/forecast/v1/daily/{hash}` | Disponible y probado | Respuesta `ok: true`, 5 días; usa mínima, máxima, símbolo, humedad, lluvia y viento. |

Meteored se usa solo para pronósticos; Weather.com sigue siendo la fuente de observaciones actuales. La autenticación requerida es el encabezado `X-API-Key`; el preflight respondió `200` y permite ese encabezado, con `Access-Control-Allow-Origin: *`. Las respuestas incluyen `expiracion` (milisegundos epoch) y se guardan por separado en `localStorage` hasta ese vencimiento, por lo que no hay polling ni consultas al actualizar las observaciones. El plan informado limita a 50 peticiones diarias: una carga normal usa como máximo una consulta horaria y una diaria por vencimiento. La clave no se registra en esta documentación ni en mensajes de error.

En v1.0, el campo real `symbol` de cada objeto `days[]` se traduce mediante el catálogo de símbolos publicado por Meteored; no se infiere desde temperatura ni se consulta un endpoint adicional. La atribución «Fuente: Meteored» permanece separada de esa descripción.

## Fuentes visuales (v0.11)

| Fuente | Uso | Integración | Frecuencia | Limitación |
| --- | --- | --- | --- | --- |
| ClimaSurGBA | Radar Ezeiza | Imagen HTTPS `https://climasurgba.com.ar/radar/ezeiza0.png` mediante `radarProvider`; cache busting solo de la imagen | 10 minutos y botón manual | Provisional por solicitud del usuario. El sitio declara CC BY-NC-SA y puede estar desactualizado; no es apta como solución comercial definitiva. |
| CONAE | Animación satelital GOES-19 para Argentina | `POST https://catalogos4.conae.gov.ar/goesr_l2/animaciones/recuperarListaImagenes.aspx` con `tipo`, `cant=6` y `frec=30`; cada respuesta entrega las URLs HTTPS de JPG y `ultFecha` | 30 minutos, botón manual y cambio de producto | Fuente oficial pública. La animación depende de la disponibilidad del catálogo y no se carga ningún recurso si el endpoint falla. Mantener atribución CONAE visible y confirmar condiciones de redistribución antes de monetizar. |
| CX2SA | Imagen satelital | **DESCARTADO COMO FUENTE ACTIVA** | No aplica | Solo respondió mediante HTTP. Es incompatible con GitHub Pages/Blogger HTTPS por contenido mixto; se conserva únicamente como antecedente técnico. |

### CONAE GOES-19

- Página auditada: `https://catalogos4.conae.gov.ar/goesr_l2/animaciones/animacionGOESU.aspx`.
- Productos publicados: `ArgIrol` (Infra Rojo de Onda Larga), `ArgVisb2` (Visible Banda 2), `ArgRgbmn` (RGB Microfísica Nocturna) y `ArgVanm` (Niveles Medios de Vapor de Agua).
- Mecanismo: el sitio oficial usa `recuperarListaImagenes.aspx`, que devuelve JSON con `items.imagenes` y `items.ultFecha`. La aplicación solicita la secuencia mínima de seis cuadros, no realiza scraping ni sondeos masivos.
- Los nombres de los archivos incluyen fecha y hora de adquisición; `ultFecha` se etiqueta como UTC tal como lo informa el visor oficial. Las URLs de imagen son HTTPS, por lo que no hay contenido mixto en GitHub Pages/Blogger.
- La respuesta y la página auditada publicaron `Access-Control-Allow-Origin: *`; el módulo controla errores de red y muestra el fallback local.

## Mapa Leaflet

**ELIMINADO EN v0.11.** Se retiró la sección, Leaflet y toda su inicialización porque los problemas persistentes de mosaicos, zoom y redimensionamiento no justificaban su coste de mantenimiento frente al valor aportado.

## Fuentes descartadas por licencia

| Fuente | Motivo |
| --- | --- |
| Open-Meteo gratuito | Su licencia gratuita es solo para uso no comercial; un sitio con Google AdSense requiere plan comercial. |
| RainViewer gratuito | Permite uso personal, educativo y de pequeña comunidad, pero no es adecuado como dependencia para un sitio monetizado sin acuerdo comercial. |
| Teselas satelitales públicas de Esri | Las condiciones diferencian uso comercial y no comercial; no se agregan sin licencia o permiso verificable. |
| Radar de ClimaSurGBA como solución definitiva | El sitio muestra licencia CC BY-NC-SA y su página de Ezeiza indica imagen desactualizada. Se muestra únicamente de forma provisional por petición explícita del usuario; debe sustituirse antes de monetizar. |

## Arquitectura pendiente para v1.0

- Solicitar a TWC la habilitación explícita de los productos de pronóstico, UV, históricos, calidad del aire, astronomía y teselas de radar que se decida contratar.
- Confirmar dentro de Weathercloud el plan, la licencia comercial, los métodos de exportación y el acceso de lectura antes de crear una integración de servidor o cliente.
- Incorporar gráficos históricos solo después de recibir datos propios autorizados; preferir una librería ligera y carga diferida.
- Incorporar alertas locales únicamente con una fuente oficial que cubra Argentina y permita redistribución comercial.
