# Resumen meteorológico diario

## Origen y zona horaria

El resumen usa exclusivamente observaciones propias de `weather_observations` en Cloudflare D1. D1 conserva `observed_at` en UTC, pero cada día se delimita mediante `America/Argentina/Buenos_Aires` con un rango semiabierto `[medianoche local, medianoche local siguiente)`. No se usa medianoche UTC ni se codifica manualmente UTC-3.

`GET /api/daily-summary` acepta opcionalmente `date=YYYY-MM-DD`; sin parámetro resume hoy en Argentina. Las fechas futuras, imposibles o con otro formato devuelven `400`.

## Datos y calidad

El endpoint devuelve sólo el día solicitado: cantidad, primera/última observación, cobertura, extremos, sus horas, lluvia y comparación. Los extremos se limitan a rangos físicamente plausibles antes de agregarse: temperatura -90 a 70 °C, humedad 0 a 100 %, presión 800 a 1100 hPa, viento 0 a 300 km/h y ráfaga 0 a 400 km/h. `NULL`, `NaN` y valores fuera de esos rangos no se presentan como datos válidos.

La cobertura esperada usa una captura cada diez minutos. Se marca parcial si faltan más de dos intervalos al inicio o final del rango. La Home informa discretamente «Datos disponibles desde HH:MM» cuando corresponde; los días sin filas devuelven `data: null` y no se convierten en ceros.

## Precipitación

La captura almacena dos campos diferentes de Weather.com PWS:

- `precip_rate`: intensidad instantánea en mm/h; se usa para los gráficos.
- `precip_total`: acumulado de precipitación del día de la estación; se usa para el resumen diario.

El acumulado diario no suma cada fila. Ordena los `precip_total` válidos del rango argentino, toma la primera lectura como lluvia ya registrada desde medianoche, añade sólo diferencias positivas y, ante una disminución, añade la nueva lectura como reinicio del acumulador. Así no multiplica valores acumulativos y tampoco pierde lluvia registrada antes de la primera captura del día.

La auditoría previa de datos reales verificó acumulados crecientes el 27/08/2026 (de 0,25 a 17,53 mm) y valores bajos reiniciados después del día siguiente. Esta evidencia respalda el tratamiento como acumulado diario. El cálculo sigue siendo conservador si una estación reinicia el contador dentro del rango.

## Comparación y frase

Para el día actual se compara **hoy hasta ahora** con **ayer hasta la misma hora**, evitando comparar una jornada parcial con un día completo. Para una fecha histórica, el endpoint prepara el día anterior completo como referencia; la interfaz actual sólo muestra la comparación compacta en Home.

La frase se genera con reglas determinísticas y sólo incluye variables disponibles: rango térmico, ráfaga y lluvia/no lluvia. No usa IA, datos simulados ni servicios externos.

## Rendimiento y fallback

El Worker reutiliza `idx_weather_observations_observed_at`: una agregación del rango diario, cuatro consultas acotadas para horas de extremos y una lectura de sólo `observed_at`/`precip_total` de hasta 300 filas. No descarga el histórico completo al navegador. La respuesta conserva el caché público de 60 segundos del Worker y Home la solicita al iniciar y cada diez minutos, acorde con la captura.

La agregación aplica `MIN`/`MAX` condicionales a los rangos válidos y las horas se resuelven con `ORDER BY valor, observed_at LIMIT 1` dentro del mismo rango temporal. Las consultas de lluvia seleccionan únicamente `observed_at, precip_total`. Por tanto, el endpoint no hace un scan de todo el histórico ni añade índices, tablas o bases.

Si el Worker o D1 falla, el bloque informa «Resumen diario temporalmente no disponible» y no bloquea observaciones actuales, pronósticos, radar, satélite ni gráficos.

## Uso editorial futuro

El mismo JSON puede alimentar una futura nota de Blogger, por ejemplo «Resumen meteorológico del 3 de septiembre de 2026». No se generan publicaciones, estadísticas mensuales, efemérides ni récords nuevos en v1.6.
