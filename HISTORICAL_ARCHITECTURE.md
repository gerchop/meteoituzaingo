# Arquitectura futura de históricos

## Recomendación

Usar **Azure Functions (Flex Consumption) + Azure Table Storage + API HTTP propia**. Es el punto de partida recomendado para Meteo Ituzaingó: separa secretos del sitio estático, se adapta a GitHub Pages y Blogger, y permite consultas por rango sin introducir una base de datos compleja.

```text
Weather.com PWS
      │  (credencial sólo en Key Vault / configuración de Function)
      ▼
Azure Function programada (cada 5 min)
      ▼
Azure Table Storage: Observaciones
      │
      ▼
Azure Function HTTP /api/history
      │  (JSON cacheable, CORS limitado al dominio publicado)
      ▼
GitHub Pages → iframe o enlace desde Blogger
```

La Function programada usa un temporizador. Azure Functions soporta tareas programadas y los triggers de temporizador dependen del almacenamiento de Azure en producción. [Documentación de timer triggers](https://learn.microsoft.com/en-us/azure/azure-functions/functions-bindings-timer?pivots=programming-language-python&tabs=python-v2%2Cin-process%2Cnodejs-v4)

## Modelo de datos

Tabla `Observations`:

- `PartitionKey`: `YYYYMM` (consulta mensual y retención sencilla).
- `RowKey`: timestamp UTC ISO invertido o epoch con relleno (orden temporal).
- Campos: `timestampUtc`, `temperatureC`, `humidityPct`, `pressureHpa`, `windKph`, `gustKph`, `windDirectionDeg`, `precipTotalMm`, `precipRateMmH`, `stationId`, `sourceVersion`.

La API expone sólo rangos permitidos: `24h`, `7d`, `30d` y `year`. Para el año se consultan particiones mensuales y se devuelven agregados horarios o diarios; no se envían todas las muestras crudas al navegador.

## Operación y seguridad

- `WEATHER_COM_API_KEY` y cualquier clave futura se guardan como secretos de la Function o Key Vault, nunca en GitHub Pages, Blogger, JavaScript ni el repositorio.
- La Function HTTP valida parámetros, limita tamaño/rango, aplica rate limiting y devuelve `Cache-Control`.
- Configurar CORS sólo para el dominio de GitHub Pages y el dominio de Blogger publicados.
- Registrar fallos, retrasos de timer y edad de la última observación. Hacer reintentos acotados para no multiplicar el consumo de Weather.com.
- Exportar copias mensuales compactadas a Blob Storage para recuperación y análisis de bajo costo.

## Comparativa

| Alternativa | Costo relativo | Complejidad | Consultas y gráficos | Recomendación |
| --- | --- | --- | --- | --- |
| Azure Functions + Table Storage | Bajo para una PWS | Baja | Muy buena por rango/partición; agregados en Function | **Elegida** |
| Azure Functions + Blob JSON | Muy bajo | Baja al inicio, media al crecer | Buena para snapshots/archivos; peor para filtros arbitrarios | Complemento para exportación |
| Cosmos DB Serverless | Variable por operación y almacenamiento | Media | Excelente para consultas flexibles y crecimiento | Evaluar si crecen usuarios/consultas |

Cosmos DB Serverless factura por operaciones y almacenamiento sin mínimo de operaciones, por lo que es apropiado para tráfico intermitente, pero añade coste y modelado innecesarios en la primera etapa. [Detalles oficiales](https://azure.microsoft.com/en-us/pricing/details/cosmos-db/serverless/)

Los importes cambian por región, moneda, plan y tráfico: antes de aprovisionar se debe calcular el costo mensual con la calculadora oficial de Azure. Para una estación única con captura cada cinco minutos, Table Storage y Functions suelen ser la alternativa de menor complejidad/costo; Blob es útil como archivo. No se fija una cifra en este documento para no presentar precios desactualizados como compromiso.

## Evolución de la interfaz

1. Añadir `/api/history?range=24h&metrics=temperature,pressure,humidity,wind,precipitation`.
2. Cargar la librería de gráficos ligera sólo al abrir la sección de históricos.
3. Mostrar temperatura, presión, humedad, viento y precipitación de 24 h; luego 7 d, 30 d y año con agregación progresiva.
4. Identificar claramente los gráficos como observaciones de la estación propia y su intervalo de captura.

La memoria local de v1.0 no reemplaza esta arquitectura: sólo conserva muestras locales de este dispositivo, con expiración automática.
