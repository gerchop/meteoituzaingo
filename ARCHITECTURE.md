# Arquitectura propuesta para datos históricos

## Objetivo

Conservar observaciones propias de Meteo Ituzaingó sin modificar el dashboard estático ni exponer credenciales. La web seguirá publicada en GitHub Pages y Blogger solo la incrustará; la captura, almacenamiento y consulta ocurrirán fuera del navegador.

## Diseño

```text
Weather.com PWS ──> Azure Function programada ──> Azure Table Storage
                                                    └──> Azure Blob Storage (archivos diarios)

GitHub Pages / Blogger ──> Azure Function HTTP `/api/observations` ──> JSON cacheable
```

1. Una Azure Function programada consulta la observación actual cada 5 minutos. La clave de Weather.com se guarda en Application Settings o Key Vault, nunca en Git.
2. La función valida la respuesta, normaliza unidades y guarda una fila con `stationId`, `observedAtUtc`, temperatura, humedad, presión, viento, ráfaga y precipitación.
3. Azure Table Storage mantiene consultas por estación y rango temporal; Blob Storage guarda una copia NDJSON o CSV por día para exportación, auditoría y recuperación económica.
4. Una Azure Function HTTP devuelve agregados de 24 horas y 7 días, con `Cache-Control`, paginación y CORS limitado al dominio de GitHub Pages/Blogger.
5. El dashboard carga los gráficos de forma diferida solo cuando la API confirma que hay datos. No se mostrarán series simuladas.

## Modelo de datos inicial

| Campo | Uso |
| --- | --- |
| `PartitionKey` | `IITUZAIN9:YYYYMM` para particionar por estación y mes. |
| `RowKey` | Fecha UTC ISO 8601 o epoch invertido para orden estable. |
| `observedAtUtc` | Momento original de la observación. |
| `temperatureC`, `humidityPct`, `pressureHpa` | Gráficos base. |
| `windKph`, `windDirectionDeg`, `windGustKph`, `precipTotalMm` | Series auxiliares y agregados. |
| `source`, `schemaVersion` | Trazabilidad y migraciones. |

## Ventajas y escalabilidad

- GitHub Pages conserva coste y rendimiento de un sitio estático.
- Functions escala por demanda y evita exponer API keys a visitantes.
- Table Storage permite rangos recientes de bajo coste; Blob Storage retiene el archivo completo sin depender de un proveedor meteorológico.
- La API JSON desacopla el frontend de Weather.com y permite sumar fuentes complementarias bajo licencia sin cambiar el diseño.
- El mismo backend puede incorporar alertas, calidad de aire o pronóstico después de validar sus contratos.

## Costos y operación

En el plan Consumption de Azure Functions, Microsoft publica una concesión mensual de 1.000.000 ejecuciones y 400.000 GB-s; Storage y transferencia se cobran aparte. Una captura cada 5 minutos equivale aproximadamente a 8.928 ejecuciones mensuales, muy por debajo de esa concesión, aunque deben configurarse presupuestos, alertas de coste y retención. Los precios varían por región y fecha: confirmar con la calculadora de Azure antes de producción.

Comenzar con Table Storage y Blob Storage LRS, sin instancias siempre listas. Añadir Application Insights solo con muestreo y una política de retención corta para controlar costos.

## Seguridad y mantenimiento

- Secretos en Key Vault o Application Settings, con identidad administrada cuando sea posible.
- Validar esquema y descartar observaciones inválidas o duplicadas antes de persistir.
- CORS estricto, rate limiting y cache para la API pública.
- Backups diarios en Blob y ciclo de vida para archivar datos antiguos.
- Infraestructura declarada (Bicep o Terraform) y despliegue separado del sitio estático.

## Próximos pasos para v1.0

1. Crear la suscripción y el recurso Azure, con presupuesto mensual.
2. Implementar el colector y probarlo en una tabla de desarrollo.
3. Exponer `/api/observations?range=24h|7d` con datos reales.
4. Añadir gráficos livianos con carga diferida y estados vacíos accesibles.
5. Revisar las licencias de Weather.com y cualquier proveedor complementario antes de publicar nuevos datos.
