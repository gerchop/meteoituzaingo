# API de históricos

Base: `https://meteoituzaingo-history.meteoituzaingo.workers.dev`

Las observaciones se almacenan en UTC. Las consultas diarias, la presentación y la columna `fecha_hora` del CSV usan explícitamente `America/Argentina/Buenos_Aires`; los límites diarios se convierten a UTC con un intervalo semiabierto `[inicio, fin)`. Los endpoints son públicos, de sólo lectura y no requieren secretos.

| Endpoint | Parámetros válidos | Resultado |
| --- | --- | --- |
| `/api/history` | `hours=24`, `days=7`, `days=30` o `date=YYYY-MM-DD` | Series para gráficos. Los rangos de 7/30 días se agrupan por hora. |
| `/api/history/info` | — | Primera, última y cantidad total de observaciones. |
| `/api/stats/today` | — | Estadísticas del día actual argentino. |
| `/api/stats/daily` | `date=YYYY-MM-DD` | Estadísticas de una fecha registrada. |
| `/api/daily-summary` | `date=YYYY-MM-DD` opcional | Extremos diarios, horas, cobertura, precipitación y comparación con ayer. Sin parámetro usa hoy en Argentina. |
| `/api/compare` | `period=24h`, `7d` o `30d` | Estadísticas del período actual y del anterior equivalente. |
| `/api/records` | — | Extremos desde el inicio real del histórico D1. |
| `/api/export.csv` | `period=24h`, `7d`, `30d` o `date=YYYY-MM-DD` | CSV UTF-8 con BOM, delimitado por punto y coma. |

Fechas futuras, períodos no permitidos y formatos distintos de `YYYY-MM-DD` devuelven `400`.

## Datos y precipitación

Los promedios SQL ignoran `NULL`. La precipitación acumulada se calcula con las diferencias entre lecturas consecutivas de `precip_total`; ante un reinicio del acumulador se toma la nueva lectura. Nunca se suman acumulados completos fila a fila.

Las comparativas devuelven `sufficient: false` cuando no hay datos en ambos períodos. La exportación está limitada a 30 días como máximo y no expone un endpoint de «todo el histórico».

## Resumen diario

`/api/daily-summary` devuelve `date`, `timezone`, `isCurrentDay`, `data` y `comparison`. `data` es `null` si no hay observaciones. Cuando existe, incluye `firstObservation`, `lastObservation`, `observations`, `coverage`, `temperature`, `humidity`, `pressure`, `wind`, `gust` y `precipitation`.

Los extremos incluyen timestamp sólo donde aporta valor visible (máxima/mínima de temperatura, viento y ráfaga). El día actual se compara contra ayer hasta la misma hora; una fecha histórica se prepara contra el día anterior completo. La metodología de lluvia y cobertura está documentada en [DAILY_SUMMARY.md](DAILY_SUMMARY.md).

## Ejemplos

```text
GET /api/compare?period=7d
GET /api/history?date=2026-08-20
GET /api/export.csv?period=24h
GET /api/daily-summary?date=2026-08-27
```
