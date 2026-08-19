# Backend histórico Cloudflare

Worker: `meteoituzaingo-history`.

- D1 binding: `HISTORY_DB`.
- Base: `meteoituzaingo-history`.
- Captura programada: cada 10 minutos (`*/10 * * * *`).
- Fuente: Weather.com PWS `IITUZAIN9`, en unidades métricas.

## Secretos requeridos

```powershell
npx wrangler secret put WEATHER_API_KEY
npx wrangler secret put ADMIN_TOKEN
```

No se almacenan valores de secretos en el repositorio. `ADMIN_TOKEN` protege `POST /api/admin/capture` mediante `Authorization: Bearer <token>`.

## Operación

```powershell
npx wrangler d1 migrations apply meteoituzaingo-history --remote
npx wrangler deploy
npx wrangler d1 execute meteoituzaingo-history --remote --command "SELECT observed_at, temperature FROM weather_observations ORDER BY observed_at DESC LIMIT 10;"
```

Los endpoints públicos son `/api/current`, `/api/history?hours=24`, `/api/history?days=7`, `/api/history?days=30`, `/api/stats/today` y `/api/stats/daily?date=YYYY-MM-DD`.
