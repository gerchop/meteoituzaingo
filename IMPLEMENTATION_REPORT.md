# Informe de implementación v1.3.2

## Corrección de timezone CSV

D1 conserva `observed_at` en UTC. El problema era doble: el CSV escribía ese valor directamente, por lo que sus horas aparecían tres horas adelantadas, y los límites de fecha usaban un offset fijo en lugar de una conversión centralizada de zona horaria.

`cloudflare/src/index.js` ahora centraliza `argentinaDateToUtcRange(date)`. Interpreta una fecha como medianoche de `America/Argentina/Buenos_Aires`, calcula el rango semiabierto `[inicio, fin)` en UTC y lo entrega a las consultas parametrizadas. Por ejemplo, `2026-08-21` se consulta entre `2026-08-21T03:00:00.000Z` y `2026-08-22T03:00:00.000Z`.

El mismo módulo usa `formatArgentinaDateTime(timestamp)` antes de escribir cada fila CSV. Así, una observación almacenada como `2026-08-21T17:00:00Z` se exporta como `21/08/2026 14:00`. Los períodos móviles 24 h, 7 d y 30 d mantienen su rango real en UTC, pero presentan cada instante en hora Argentina.

No se modificaron registros, tablas, índices, cron, frecuencia ni frontend de gráficos.

## Pruebas

- Sintaxis del Worker y `git diff --check` sin errores.
- Exportaciones CSV 24 h, 7 d, 30 d y fecha personalizada verificadas contra el Worker publicado.
- Se comprobaron los límites `[03:00Z, 03:00Z siguiente)` para la fecha argentina y que todas las filas exportadas pertenecen a la fecha local solicitada.

---

# Informe de implementación v1.3.1

## Corrección de exportación CSV

La interfaz v1.3 almacenaba los valores del selector de gráficos como `hours=24`, `days=7` y `days=30`. Esos valores son correctos para `/api/history`, pero `/api/export.csv` valida exclusivamente `24h`, `7d` y `30d`; por eso el backend respondía correctamente `400` y el enlace directo reemplazaba `historicos.html` por su JSON de error.

`js/history.js` ahora conserva una única variable `activePeriod` con los únicos valores válidos para exportación, y un `customDate` separado para la consulta por fecha. El mapeo explícito `PERIODS` traduce esos valores hacia el formato que necesita sólo el endpoint de gráficos.

El enlace se sustituyó por un botón. Su descarga usa `fetch`, verifica `response.ok` y `Content-Type: text/csv`, crea un `Blob` temporal y descarga nombres como `meteoituzaingo_7d_YYYY-MM-DD.csv`; en fecha personalizada usa `meteoituzaingo_YYYY-MM-DD.csv`. Durante la solicitud queda deshabilitado y muestra un estado localizado. Ante un fallo registra el detalle en consola sin abandonar la página.

No se modificaron Worker, D1, cron, captura, endpoints, gráficos ni fuentes meteorológicas.

## Pruebas

- Validación estática: los únicos valores de botones son `24h`, `7d` y `30d`; los gráficos siguen solicitando `hours=24`, `days=7` o `days=30` mediante el mapeo explícito.
- `node --check` y `git diff --check` sin errores.
- `/api/export.csv?period=24h`, `7d`, `30d` y una fecha registrada devuelven CSV UTF-8; un período inválido mantiene el rechazo `400` del backend.
- Tras publicar, se comprobará que GitHub Pages entrega el script con descarga controlada.

---

# Informe de implementación v1.3

## Resultado

La página `historicos.html` incorpora análisis avanzado con datos reales de D1: comparativas, resumen diario, consulta por fecha, récords y exportación CSV. La Home, Weather.com, Meteored, radar, satélite, D1, Worker y cron se conservaron.

## Endpoints v1.3

- `GET /api/compare?period=24h|7d|30d`: dos bloques agregados mediante `AVG`, `MIN`, `MAX` y `COUNT` para el período actual y el anterior.
- `GET /api/records`: extremos y timestamps desde el inicio de D1, sin transferir el histórico al navegador.
- `GET /api/history?date=YYYY-MM-DD`: muestras de un día argentino para los cinco gráficos existentes.
- `GET /api/stats/daily?date=YYYY-MM-DD`: resumen del día seleccionado; `/api/stats/today` reutiliza la misma ruta de cálculo.
- `GET /api/export.csv?period=…|date=…`: CSV de hasta 30 días, UTF-8 con BOM y separador `;` para compatibilidad con Excel.

Las fechas se validan como `YYYY-MM-DD`, no aceptan futuros y se convierten a límites UTC sólo en el Worker. No se agregaron migraciones ni índices: el índice temporal existente atiende los rangos y el volumen histórico actual.

## Precipitación y rendimiento

La precipitación se calcula dentro del Worker sobre filas del rango mediante diferencias consecutivas de `precip_total`, incluidas reinicializaciones del acumulador. No se suman acumulados repetidos. Los promedios D1 excluyen `NULL` y la comparación/estadística no envía filas al navegador. El CSV sí entrega las filas seleccionadas, limitado a 24 h, 7 d, 30 d o una fecha.

Los gráficos mantienen una solicitud por período y caché de sesión de diez minutos. Comparativa, récords y resumen manejan sus fallos por separado para no bloquear gráficos. Los récords se piden una vez por carga de página.

## Pruebas reales

- Worker existente desplegado como versión `2e671595-536a-4a9d-96da-1085ce25993e`; el cron permanece `*/10 * * * *`.
- Con 570 observaciones reales: `/api/compare?period=24h`, `/api/records`, `/api/history?date=2026-08-19`, `/api/stats/daily` y `/api/export.csv?period=24h` respondieron correctamente.
- El CSV devolvió `text/csv; charset=utf-8` y encabezados UTF-8 con BOM.
- Sintaxis de Worker y JavaScript, además de `git diff --check`, sin errores.

## Recomendaciones v1.4

- Revaluar índices de extremos cuando el histórico crezca significativamente.
- Mantener el límite de exportación de 30 días y revisar cuotas D1 antes de ampliar períodos.
- Verificar visualmente en GitHub Pages la disposición de comparativas, fecha y CSV en 360/390/430 px, tablet y escritorio tras publicar el commit.

---

# Informe de implementación v1.2.1

## Correcciones

### Histórico de Home

La Home tenía una implementación distinta a la de `historicos.html`. Tras retirar el selector de períodos de Home en v1.2, quedaron dos referencias a la variable `periodo`, que ya no existe: una al construir las etiquetas del gráfico y otra al armar la URL. El `ReferenceError` se capturaba en el `catch` y se mostraba erróneamente «Históricos temporalmente no disponibles», aunque Cloudflare y D1 respondían correctamente.

Se creó `js/history-api.js`, usado por ambas páginas. La Home ahora llama explícitamente `fetchHistory("hours=24")`; Históricos usa el mismo método para sus tres períodos. No se modificaron Worker, D1, cron, registros ni frecuencia de captura.

### Tooltips

El callback `afterBody` estaba en la configuración común de Chart.js, por lo que añadía dirección a cada gráfico. Ahora sólo se habilita al crear `windChart`; construye una única línea con rumbo y grados cuando están disponibles. Temperatura, humedad, presión y precipitación ya no reciben ese callback.

### Formato horario

`js/datetime-utils.js` centraliza `formatTime`, `formatDate`, `formatDateTime` y `formatShortDateTime` con locale `es-AR`, zona `America/Argentina/Buenos_Aires` y `hour12: false`. Se aplicó en actualización actual, Meteored horario, radar, históricos, ejes y tooltips. Los timestamps de D1 continúan en UTC y se convierten sólo al presentar.

## Archivos corregidos

- `dashboard.html`, `js/dashboard.js`: carga del módulo común, Home de 24 h y horarios de presentación.
- `historicos.html`, `js/history.js`: módulos comunes, etiquetas de 24 h y tooltips específicos por gráfico.
- `js/history-api.js`: cliente histórico compartido y validación uniforme de respuestas.
- `js/datetime-utils.js`: formato temporal único para el frontend.

## Pruebas realizadas

- `node --check` sobre los módulos nuevos y los scripts de dashboard/históricos, sin errores.
- `git diff --check`, sin errores de espacios.
- Auditoría de scripts: no quedan usos de `toLocaleTimeString`/`toLocaleString` ni formateadores históricos que omitan `America/Argentina/Buenos_Aires`; Meteored conserva su formateador localizado con `hour12: false`.
- Se verificará en GitHub Pages publicado la Home, los tres períodos y los tooltips tras enviar el commit remoto.

---

# Informe de implementación v1.2

## Resultado

v1.2 amplía los históricos permanentes de v1.1 sin cambiar las fuentes de observación actuales ni la infraestructura existente:

```text
Weather.com PWS → Cloudflare Worker → Cloudflare D1 → API JSON → Dashboard / históricos
```

El dashboard conserva su diseño y muestra solamente la vista compacta de temperatura de 24 horas. La exploración avanzada se trasladó a `historicos.html`.

## Recursos Cloudflare conservados

- Worker: `meteoituzaingo-history`.
- URL: `https://meteoituzaingo-history.meteoituzaingo.workers.dev`.
- D1: `meteoituzaingo-history`.
- Binding: `HISTORY_DB`.
- Cron: `*/10 * * * *`.
- No se creó ni recreó ninguna base, Worker, secreto o tarea programada.

El Worker fue desplegado con la versión `36dd1781-a0c7-4cac-a753-176a28a84bd6`.

## Backend

- Se añadió `GET /api/history/info`, que devuelve la primera y última observación disponibles y el total de registros. No consulta Weather.com ni modifica D1.
- `GET /api/history?hours=24` mantiene las muestras disponibles; los períodos de 7 y 30 días mantienen la agregación horaria existente.
- La API conserva CORS restringido a los orígenes configurados y no expone secretos.

## Frontend

- `historicos.html` ofrece períodos de 24 horas, 7 días y 30 días con gráficos de temperatura, humedad, presión, viento y ráfagas, e intensidad de precipitación.
- Cada período realiza una sola solicitud de datos y se reutiliza para todos los gráficos. La respuesta se mantiene en caché de memoria durante diez minutos.
- `js/history-config.js` centraliza la URL del Worker y los colores compartidos para no duplicar configuración entre la home y la página avanzada.
- Los tooltips muestran fecha y hora en `America/Argentina/Buenos_Aires`; incluyen dirección del viento cuando el registro la contiene.
- El resumen del período informa máxima y mínima, humedad máxima, ráfaga máxima, lluvia y variación de presión sólo cuando existen datos suficientes.
- La lluvia se calcula mediante diferencias entre lecturas consecutivas de `precip_total`; no se suman valores acumulados repetidos.
- Si no hay registros o la API falla, se vacían los gráficos y se muestra un estado controlado sin afectar el resto del sitio.

## Datos y pruebas reales

Al verificar el despliegue, D1 contenía 128 observaciones reales, desde `2026-08-19T19:39:27.000Z` hasta `2026-08-20T16:50:13.000Z`.

| Prueba | Resultado |
| --- | --- |
| Despliegue Worker | Correcto, sin modificar cron, D1 ni secretos. |
| `/api/history/info` | `200`, con conteo y límites temporales reales. |
| `/api/history?hours=24` | `200`, muestras reales de D1. |
| `/api/history?days=7` y `days=30` | `200`, agregación horaria real. |
| CORS desde GitHub Pages | Origen `https://gerchop.github.io` autorizado, sin comodín. |
| Sintaxis | `node --check` para Worker y scripts de históricos, sin errores. |
| Integridad de cambios | `git diff --check`, sin errores. |

## Responsive y Blogger

Los paneles usan una columna en teléfono y dos en tablet/escritorio, con altura de gráfico reducida en pantallas pequeñas. La integración prevista con Blogger está detallada en `BLOGGER_INTEGRATION.md`; si se usa un iframe desde GitHub Pages no cambia CORS. Si se publica JavaScript directamente en Blogger, debe añadirse su origen HTTPS exacto y redesplegar el Worker.

## Limitaciones y siguiente versión

- El historial comenzó recientemente: 7 y 30 días mostrarán sólo registros capturados realmente; no se fabrican datos faltantes.
- La dirección del viento no está incluida en las agregaciones horarias largas, por lo que el tooltip la presenta únicamente en registros que la incluyen.
- La precipitación se representa como intensidad; el acumulado requiere al menos dos lecturas de `precip_total` válidas.
- Antes de v1.3 conviene validar visualmente la página publicada en 360, 390 y 430 px, tablet y escritorio, una vez que GitHub Pages reciba este commit.
