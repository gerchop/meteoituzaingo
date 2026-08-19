# Costos y cuotas de Cloudflare v1.1

## Escenario configurado

La captura programada cada 10 minutos genera como máximo 144 invocaciones/día y 52.560 observaciones/año. Cada captura realiza una consulta a Weather.com y una escritura idempotente en D1. No utiliza Workers Paid, R2, Queues, Durable Objects ni servicios pagos.

| Recurso | Escenario inicial | Límite Workers Free vigente | Margen |
| --- | ---: | ---: | --- |
| Requests Worker | 144/día, más lecturas del frontend | 100.000/día | Amplio para la captura; monitorear tráfico público. |
| D1 filas escritas | Hasta 144/día; 52.560/año | 100.000/día | Amplio. |
| D1 filas leídas | Depende de visitantes; 24 h limita a 300 filas | 5.000.000/día | Amplio al inicio; los períodos de 7/30 d se agregan por hora. |
| D1 almacenamiento | ~13–26 MiB/año estimados para 52.560 filas e índices | 5 GB | Amplio; estimación no es garantía. |
| Cron Triggers | 1 | 5 por cuenta | Dentro del límite. |

Las cuotas vigentes indican 100.000 requests diarios para Workers Free, 5 millones de filas leídas/día, 100.000 filas escritas/día y 5 GB de almacenamiento para D1 Free. [Límites de Workers](https://developers.cloudflare.com/workers/platform/limits/) y [precios/cuotas de D1](https://developers.cloudflare.com/workers/platform/pricing/).

## Monitoreo

Revisar en Cloudflare Dashboard:

- Workers & Pages → `meteoituzaingo-history` → métricas de requests, errores y cron.
- Storage & Databases → D1 → `meteoituzaingo-history` → filas leídas, escritas y almacenamiento.

Si el tráfico se aproxima a una cuota, reducir consultas de gráficos, habilitar caché HTTP o evaluar la arquitectura antes de activar cualquier plan pago. Los límites se reinician diariamente según la documentación de Cloudflare; los costos y cuotas deben verificarse antes de cambios de escala.
