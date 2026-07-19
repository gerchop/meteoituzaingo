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

## Weathercloud

| Servicio | Endpoint / método | Autenticación | Estado | Restricciones y uso comercial |
| --- | --- | --- | --- | --- |
| Envío de datos desde estación | `GET /v01/set` en `api.weathercloud.net`, con `wid`, `key` y medidas | WID y device key | Documentado; no integrado | No almacenar WID, key, usuario ni contraseña en el repositorio. El intervalo documentado para Basic es 10 minutos; Pro/Premium permiten 1 minuto. |
| Lectura de dispositivos/datos v0 | API `data.weathercloud.net` | `Authorization: Bearer {AUTH_KEY}` en endpoints autenticados | Pendiente | Requiere credencial de cuenta y revisión de plan. No se solicita ni almacena la credencial. |
| Históricos, estadísticas y exportación | No confirmados públicamente para la cuenta Basic disponible | No evaluado | Pendiente de confirmar en la cuenta | No integrar hasta verificar plan, límites, licencia y permiso comercial. |
| Ubicación y dispositivos públicos | API v0 lista dispositivos públicos | Según endpoint | No integrado | Puede exponer datos de terceros; no usarlo para sustituir datos propios. |
| Pronósticos y mapas | No documentados como producto de la API de estación auditada | No aplicable | No disponible para esta integración | Sin fuente o licencia comercial confirmada. |

## Fuentes descartadas por licencia

| Fuente | Motivo |
| --- | --- |
| Open-Meteo gratuito | Su licencia gratuita es solo para uso no comercial; un sitio con Google AdSense requiere plan comercial. |
| RainViewer gratuito | Permite uso personal, educativo y de pequeña comunidad, pero no es adecuado como dependencia para un sitio monetizado sin acuerdo comercial. |
| Teselas satelitales públicas de Esri | Las condiciones diferencian uso comercial y no comercial; no se agregan sin licencia o permiso verificable. |

## Arquitectura pendiente para v1.0

- Solicitar a TWC la habilitación explícita de los productos de pronóstico, UV, históricos, calidad del aire, astronomía y teselas de radar que se decida contratar.
- Confirmar dentro de Weathercloud el plan, la licencia comercial, los métodos de exportación y el acceso de lectura antes de crear una integración de servidor o cliente.
- Incorporar gráficos históricos solo después de recibir datos propios autorizados; preferir una librería ligera y carga diferida.
- Incorporar alertas locales únicamente con una fuente oficial que cubra Argentina y permita redistribución comercial.
