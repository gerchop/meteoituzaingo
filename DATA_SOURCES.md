# Fuentes de datos

## Alertas oficiales SMN: ingesta incremental CAP (v1.13.2)

La fuente continúa siendo exclusivamente el índice oficial `https://ws2.smn.gob.ar/rss` y el RSS CAP descubierto en `ssl.smn.gob.ar`. El RSS puede superar el máximo de subrequests externos de Workers Free si se descargan todos los CAP en una única invocación; por eso el Worker persiste URL/GUID como identidad práctica en D1 y procesa lotes de hasta ocho CAP mediante un cron separado, con concurrencia máxima de tres y timeout de ocho segundos.

La API pública `GET /api/alerts` no consulta SMN: lee solamente alertas aplicables y no vencidas desde D1 y conserva caché pública de cinco minutos. Las relaciones CAP `Update` y `Cancel` se guardan entre invocaciones para evitar la publicación de una versión anterior. No se guardan polígonos completos después de determinar aplicabilidad para Ituzaingó. Si SMN falla o devuelve 403/challenge, no se borra una alerta válida persistida; la ingesta reintenta posteriormente sin evasión.

## Meteored: resiliencia social a medianoche (v1.13.1)

El refresh Meteored conserva seis ciclos diarios y se alinea a 00/04/08/12/16/20 ART. Social se ejecuta a las 00:11 ART y sólo lee D1. Su contrato distingue `complete` (cuatro dayParts completos), `partial` (dayParts completos parciales o resumen daily general) e `incomplete`. El fallback daily no inventa períodos horarios y no modifica el catálogo de símbolos permitido por Social. No hay requests Meteored de Home, Admin, Social ni Avisos.

## Meteored: catálogo de símbolos y avisos locales (v1.13)

La documentación Meteored `GET /api/doc/v1/forecast/symbol` (ejemplo `DocForecastSymbolV1`) define el catálogo JSON v1 compartido por `daily.days[].symbol` y `hourly.hours[].symbol`. Para avisos locales se usan exclusivamente 34 («Thunderstorm with partly cloudy sky») y 35 («Thunderstorm with cloudy sky»). Los códigos 10/11 («Dry thunderstorm») y 38/39 («Thunderstorm with hail») son símbolos validados reservados: no activan avisos v1.13.

`GET /api/advisories` lee sólo los payloads D1 existentes. La familia de tormentas usa daily con horizonte hoy/mañana ART y `updated_at` de hasta ocho horas; `expires_at` sólo es metadata upstream. Hourly fresco puede aportar dayParts, pero no es requisito. Lluvia, POP, ráfagas, PWS y radar no son triggers. La incorporación no crea requests Meteored, no modifica crons ni el presupuesto normal de seis ciclos / doce requests diarios.

## Meteored hourly: utilidad temporal (v1.12.4)

La publicación pública horaria distingue `FRESH`, `STALE_USABLE`, `EXHAUSTED` y `UNAVAILABLE`. La antigüedad de doce horas conserva el rol de clasificar fresco/stale, pero ya no descarta por sí sola un payload: se publican únicamente cuatro o más slots futuros reales de `hours[].end`. Con menos de cuatro, el payload queda agotado y no se presentan horas pasadas. Se validan `start`/`end` epoch ms, unicidad, orden y la ventana diaria esperable antes de publicar un payload stale; esto impide que un timestamp corrupto prolongue indefinidamente su vida útil.

Daily permanece con su límite stale de 48 horas. Social y Avisos continúan leyendo sus fuentes D1 mediante sus propios criterios de calidad; esta política visual no los relaja ni inicia fetch upstream.

## Meteored: presupuesto persistente (v1.12.3)

Meteored continúa siendo sólo la fuente de pronósticos. El `expires_at` informado por upstream se conserva como metadata, pero no autoriza otra consulta. La autorización local está en D1 (`meteored_refresh_state.next_refresh_at`) y el cron existente `*/10 * * * *` sólo evalúa ese estado: normalmente habilita un ciclo pareado cada 4 h (6 ciclos, 12 requests/día), no 288 requests/día.

`GET /api/forecast/hourly`, `GET /api/forecast/daily`, `GET /api/advisories` y el panel social sólo leen D1. La caché puede entregarse marcada como stale durante 12 h (horaria) o 48 h (diaria), con `updatedAt`; después se responde indisponible en vez de presentar datos indefinidamente viejos. El lease persistente de cinco minutos coordina isolates. Un 429 no intenta el segundo endpoint y activa backoff de 24 h si no hay `Retry-After`; 401/403 usan el mismo período y 5xx/red una hora. No se guardan claves ni cuerpos de error.

## Avisos Meteo Ituzaingó (v1.12.2)

No se incorporó una fuente nueva. `GET /api/advisories` sigue leyendo exclusivamente los payloads Meteored `daily` y `hourly` ya almacenados en `social_forecast_cache`, el contexto PWS de D1 y el estado EMA. La presentación temporal usa la zona `America/Argentina/Buenos_Aires`: daily sólo respalda una jornada; hourly puede respaldar bloques `dawn`, `morning`, `afternoon` y `night`. El endpoint continúa siendo dinámico, sin vigencia persistida ni consultas externas iniciadas por visitantes.

## Avisos Meteo Ituzaingó (v1.12.1)

`social_forecast_cache` conserva fuentes separadas `daily` y `hourly`: la mínima prevista se evalúa desde `daily.days[]` para la jornada térmica objetivo y la sensación sólo desde seis intervalos completos de 00:00–05:59 ART. `GET /api/advisories` sigue leyendo exclusivamente D1 y nunca llama Meteored. La política de refresh indicada originalmente fue sustituida por el presupuesto persistente de v1.12.3.

## Avisos Meteo Ituzaingó (v1.12)

| Componente | Uso | Restricciones |
| --- | --- | --- |
| `social_forecast_cache` D1 | Pronóstico horario Meteored ya disponible para evaluar bajas temperaturas | El endpoint de avisos lee el payload cacheado directamente y no puede provocar una consulta Meteored. Un cache vencido se informa como no disponible. |
| `weather_observations` D1 | Contexto confirmatorio de PWS | Sólo se usa con dos lecturas recientes y continuas cuando el monitor EMA permite observaciones. No origina un aviso por sí mismo. |
| `ema_health_state` D1 | Calidad de observación | Sólo `FRESH` + `OK` habilita el componente observacional; el forecast puede evaluarse independientemente. |

Los Avisos Meteo Ituzaingó son indicadores automáticos no oficiales. Su primer alcance es bajas temperaturas: `information` para mínima prevista ≤4 °C y `attention` para mínima ≤2 °C o sensación ≤0 °C durante dos horas continuas con temperatura ≤10 °C. No reproducen SAT-TE, no usan niveles oficiales ni recomendaciones sanitarias. No añaden proveedores, secretos, cron ni costo de API.

La observación actual de Home se sirve mediante `GET /api/current` desde la última fila de `weather_observations` en D1. El navegador ya no consulta Weather.com ni recibe su credencial; la misma key existente permanece únicamente como `WEATHER_API_KEY` en el Worker. El endpoint informa `available`, `stale` o `unavailable` y no genera solicitudes meteorológicas por visitante.

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
