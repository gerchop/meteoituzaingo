# API de históricos

Base: `https://meteoituzaingo-history.meteoituzaingo.workers.dev`

Las observaciones se almacenan en UTC y las consultas diarias usan `America/Argentina/Buenos_Aires` (UTC-03:00). Los endpoints son públicos, de sólo lectura y no requieren secretos.

| Endpoint | Parámetros válidos | Resultado |
| --- | --- | --- |
| `/api/history` | `hours=24`, `days=7`, `days=30` o `date=YYYY-MM-DD` | Series para gráficos. Los rangos de 7/30 días se agrupan por hora. |
| `/api/history/info` | — | Primera, última y cantidad total de observaciones. |
| `/api/stats/today` | — | Estadísticas del día actual argentino. |
| `/api/stats/daily` | `date=YYYY-MM-DD` | Estadísticas de una fecha registrada. |
| `/api/compare` | `period=24h`, `7d` o `30d` | Estadísticas del período actual y del anterior equivalente. |
| `/api/records` | — | Extremos desde el inicio real del histórico D1. |
| `/api/export.csv` | `period=24h`, `7d`, `30d` o `date=YYYY-MM-DD` | CSV UTF-8 con BOM, delimitado por punto y coma. |

Fechas futuras, períodos no permitidos y formatos distintos de `YYYY-MM-DD` devuelven `400`.

## Datos y precipitación

Los promedios SQL ignoran `NULL`. La precipitación acumulada se calcula con las diferencias entre lecturas consecutivas de `precip_total`; ante un reinicio del acumulador se toma la nueva lectura. Nunca se suman acumulados completos fila a fila.

Las comparativas devuelven `sufficient: false` cuando no hay datos en ambos períodos. La exportación está limitada a 30 días como máximo y no expone un endpoint de «todo el histórico».

## Ejemplos

```text
GET /api/compare?period=7d
GET /api/history?date=2026-08-20
GET /api/export.csv?period=24h
```
