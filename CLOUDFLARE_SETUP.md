# Cloudflare Workers + D1: estado de v1.1

## Recursos reales

- Worker: `meteoituzaingo-history`.
- URL: `https://meteoituzaingo-history.meteoituzaingo.workers.dev`.
- D1: `meteoituzaingo-history`.
- Database ID: `7cec06bd-da5d-4f6d-b04a-10df0e995579`.
- Binding: `HISTORY_DB`.
- Migración: `cloudflare/migrations/0001_create_weather_observations.sql`.
- Cron: `*/10 * * * *` (cada diez minutos).

## Secretos

Configurados por Cloudflare Worker Secrets, sin valores en Git:

- `WEATHER_API_KEY` para Weather.com.
- `ADMIN_TOKEN` para `POST /api/admin/capture`.

La estación no sensible se declara como `WEATHER_STATION_ID=IITUZAIN9` en `wrangler.jsonc`.

## Deploy y migraciones

Desde `cloudflare/`:

```powershell
npx wrangler d1 migrations apply meteoituzaingo-history --remote
npx wrangler deploy
```

No crear nuevamente la D1 si ya aparece en `npx wrangler d1 list`.

## Verificación

```powershell
npx wrangler d1 execute meteoituzaingo-history --remote --command "SELECT observed_at, temperature FROM weather_observations ORDER BY observed_at DESC LIMIT 10;"
```

La API pública expone datos de D1:

- `GET /api/current`
- `GET /api/history?hours=24`
- `GET /api/history?days=7`
- `GET /api/history?days=30`
- `GET /api/history/info`
- `GET /api/stats/today`
- `GET /api/stats/daily?date=YYYY-MM-DD`

Los orígenes CORS se centralizan en `ALLOWED_ORIGINS`. GitHub Pages está incluido; para publicar el frontend directamente en un dominio Blogger distinto, agregar su origen HTTPS exacto, separado por comas, y desplegar nuevamente. Un iframe que carga la página desde GitHub Pages conserva el origen de GitHub Pages.
