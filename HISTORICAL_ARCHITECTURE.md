# Arquitectura de históricos permanentes

## Implementada en v1.1

```text
Weather.com PWS
      │  WEATHER_API_KEY (Worker Secret)
      ▼
Cloudflare Worker programado cada 10 min
      ▼
Cloudflare D1: weather_observations
      ▼
API JSON pública con CORS limitado
      ▼
GitHub Pages → Blogger
```

El dashboard en tiempo real continúa consultando Weather.com directamente. El Worker/D1 es independiente: si la API histórica falla, no afecta las observaciones actuales, Meteored, radar ni satélite.

## Persistencia y consultas

- D1 guarda timestamps ISO 8601 UTC en `observed_at` y `created_at`.
- `observed_at` es único e `INSERT OR IGNORE` vuelve la captura idempotente.
- La tabla tiene índice temporal para consultas ordenadas.
- `/api/history?hours=24` devuelve muestras crudas ordenadas ascendentemente.
- `/api/history?days=7` y `days=30` agregan por hora para limitar transferencia y lectura.
- Estadísticas diarias calculan límites UTC derivados del día `America/Argentina/Buenos_Aires`; la lluvia utiliza el máximo de `precip_total`, no una suma de acumulados.

## Seguridad

- `WEATHER_API_KEY` y `ADMIN_TOKEN` viven exclusivamente en Cloudflare Worker Secrets.
- El endpoint de captura manual requiere `Authorization: Bearer <ADMIN_TOKEN>`.
- La API pública no revela secretos, payloads originales ni errores internos.
- D1 usa statements preparados para todos los parámetros recibidos.
- CORS permite orígenes configurados explícitamente; no usa comodín.

## Retención y evolución

v1.1 conserva datos sin borrar. En una fase posterior se podrá mantener datos crudos recientes y resúmenes horarios/diarios para períodos largos. Los próximos gráficos previstos son humedad, presión, viento y precipitación; sólo temperatura se muestra en v1.1.

## Alternativa inicial descartada

Azure Functions + Table Storage quedó como alternativa documental. Se eligieron Cloudflare Workers + D1 porque la cuenta ya estaba configurada, ofrece cron, D1 y Workers Free para esta primera escala, y evita incorporar una segunda plataforma en producción.
