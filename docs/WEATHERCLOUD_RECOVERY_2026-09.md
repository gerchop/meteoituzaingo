# Recuperacion WeatherCloud - septiembre de 2026 (fase 1)

## Estado

La fase 1 se completo como una auditoria y preview controlado. No se ejecuto ningun `INSERT`, `UPDATE`, `DELETE` ni `REPLACE` contra D1. Las consultas remotas informaron `rows_written: 0`.

El archivo original `Weathercloud MeteoItuzaingo 2026-09.csv` fue auditado desde su ruta local, sin copiarlo ni alterarlo. No contiene credenciales y no se incorpora al repositorio.

## Esquema D1 real

Base existente: `meteoituzaingo-history`. Tabla: `weather_observations`.

| Columna | Tipo | Obligatoria | Uso |
| --- | --- | --- | --- |
| `id` | INTEGER | no | clave primaria autoincremental |
| `observed_at` | TEXT | si | instante UTC ISO 8601, unico |
| `temperature` | REAL | si | grados C |
| `feels_like` | REAL | no | grados C |
| `humidity` | REAL | no | porcentaje |
| `pressure` | REAL | no | hPa |
| `wind_speed` | REAL | no | km/h |
| `wind_gust` | REAL | no | km/h |
| `wind_direction` | TEXT | no | rumbo cardinal |
| `wind_direction_degrees` | REAL | no | 0 a 360 grados |
| `precip_rate` | REAL | no | mm/h |
| `precip_total` | REAL | no | mm |
| `dew_point` | REAL | no | grados C |
| `weather_condition` | TEXT | no | descripcion de Weather.com |
| `created_at` | TEXT | si | UTC ISO 8601 de insercion |

`observed_at` tiene constraint `UNIQUE` (indice automatico unico) y existe `idx_weather_observations_observed_at`, no unico, sobre la misma columna. No existe una columna `source`; la procedencia `weathercloud_recovery` queda registrada en este documento sin cambiar el esquema.

## Hueco y preview real

- Ultima observacion D1 previa: `2026-09-05T20:49:18.000Z` (05/09 17:49:18 ART).
- Primera observacion D1 posterior: `2026-09-06T15:40:01.000Z` (06/09 12:40:01 ART).
- Hueco seguro: `2026-09-05T20:49:18.000Z < observed_at < 2026-09-06T15:40:01.000Z`.

| Validacion | Resultado |
| --- | --- |
| Delimitador CSV | `;` |
| Timezone declarada | `America/Argentina/Buenos_Aires` |
| Registros CSV | 116 |
| Periodo local | 05/09/2026 17:50 a 06/09/2026 13:00 |
| Periodo UTC | `2026-09-05T20:50:00.000Z` a `2026-09-06T16:00:00.000Z` |
| Existentes D1 con timestamp exacto | 0 |
| Fuera del hueco seguro | 2 |
| Candidatos exclusivos para insertar | **114** |
| Duplicados CSV | 0 |
| Errores de conversion o sanity checks | 0 |
| Intervalos distintos de 10 minutos | 0 |

Las dos filas fuera del hueco son `06/09/2026 12:50` (`2026-09-06T15:50:00.000Z`) y `06/09/2026 13:00` (`2026-09-06T16:00:00.000Z`). No son candidatas aunque no coincidan exactamente con las capturas posteriores a `15:50:01` y `15:59:56`: corresponden al tramo ya cubierto luego de recuperar el cron. No se redondean ni se fusionan timestamps.

## Mapping confirmado

| Header WeatherCloud | D1 | Transformacion y unidad | Decision |
| --- | --- | --- | --- |
| `Fecha (America/Argentina/Buenos_Aires)` | `observed_at` | `dd/mm/aaaa HH:mm` ART a UTC ISO 8601 | insertar solo en el hueco |
| `Temperatura (grados C)` | `temperature` | decimal regional a REAL, grados C | insertar |
| `Sensacion termica (grados C)` | `feels_like` | decimal regional a REAL, grados C | insertar |
| `Punto de rocio (grados C)` | `dew_point` | decimal regional a REAL, grados C | insertar |
| `Humedad (%)` | `humidity` | decimal regional a REAL, % | insertar |
| `Velocidad media del viento (km/h)` | `wind_speed` | decimal regional a REAL, km/h | insertar |
| `Rafaga maxima de viento (km/h)` | `wind_gust` | decimal regional a REAL, km/h | insertar |
| `Direccion media del viento (grados)` | `wind_direction`, `wind_direction_degrees` | grados a cardinal de 16 rumbos y REAL 0-360 | insertar |
| `Presion atmosferica (hPa)` | `pressure` | `1.018` a `1018`; `1.018,40` a `1018.40` | insertar |
| `Lluvia (mm)` | `precip_total` | decimal regional a REAL, mm | insertar: todos 0 |
| `Intensidad de lluvia (mm/h)` | `precip_rate` | decimal regional a REAL, mm/h | insertar: todos 0 |

Las columnas interiores, indices de calor, radiacion solar y UV se omiten porque la tabla publica no las usa. `weather_condition` queda `NULL`, ya que el CSV no contiene una frase equivalente a la condicion de Weather.com. Los headers y unidades de lluvia son semanticamente compatibles con la tabla y las 116 filas contienen 0 en ambos campos.

Primera candidata: `05/09/2026 17:50` ART / `2026-09-05T20:50:00.000Z`; 11.6 grados C, 59 %, 1018 hPa, 15.8 km/h, rafaga 23.4 km/h, 51 grados (NE), lluvia 0 mm.

Ultima candidata: `06/09/2026 12:40` ART / `2026-09-06T15:40:00.000Z`; 10.5 grados C, 49 %, 1025.7 hPa, 5.4 km/h, rafaga 9.7 km/h, 172 grados (S), lluvia 0 mm.

La comparacion de bordes es coherente: D1 previo y primera candidata comparten 11.6 grados C; ultima candidata y D1 posterior comparten 10.5 grados C. No se detectaron saltos termicos importantes.

## Herramienta reproducible

`scripts/recover_weathercloud_gap.mjs` no contiene credenciales y usa Wrangler ya configurado:

```powershell
node scripts/recover_weathercloud_gap.mjs --csv "D:\ruta\Weathercloud MeteoItuzaingo 2026-09.csv" --preview
```

El preview detecta delimitador, mapea solamente campos exteriores, normaliza decimales regionales, convierte ART a UTC, valida orden, duplicados, intervalos y rangos fisicos, y consulta D1 en modo lectura. `--apply` vuelve a validar y usa solamente `INSERT ... SELECT ... WHERE NOT EXISTS`; no tiene operaciones de update, delete ni replace.

## Pendiente de fase 2

1. Recibir aprobacion explicita para los 114 candidatos.
2. Guardar el listado de timestamps existentes del rango como respaldo logico inmediatamente antes de aplicar.
3. Ejecutar `--apply`, verificar conteo, MIN/MAX, cobertura y ausencia de duplicados.
4. Documentar resultado final y entonces realizar el commit de v1.8.4.

## Resultado de fase 2

La aprobación explícita permitió aplicar los 114 candidatos. La primera ejecución serial completó una parte de forma idempotente y fue detenida de forma controlada al detectarse que superaba la ventana de ejecución. La herramienta se corrigió para fijar los límites auditados y enviar el resto en una única solicitud D1 con `INSERT ... SELECT ... WHERE NOT EXISTS`. D1 remoto no permite transacciones SQL `BEGIN`/`COMMIT` por CLI; la garantía aplicada es la condición individual por `observed_at` y la verificación posterior.

Resultado final: 114 filas recuperadas, desde `2026-09-05T20:50:00.000Z` hasta `2026-09-06T15:40:00.000Z`; 114 timestamps distintos; 0 duplicados; 0 filas insertadas de los dos timestamps excluidos; 114 filas con `precip_total=0` y `precip_rate=0`. La continuidad interna es de diez minutos. El rango completo entre los bordes contiene 118 timestamps únicos, incluyendo las observaciones previas y posteriores conservadas.

No se modificaron registros existentes y no se ejecutaron `UPDATE`, `DELETE` ni `REPLACE`. El cron siguió capturando después de la recuperación: la última observación al validar fue `2026-09-06T17:49:55.000Z`.
