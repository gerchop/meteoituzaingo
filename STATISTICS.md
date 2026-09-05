# Estadísticas históricas de la estación

La sección «Estadísticas del período» de `historicos.html` usa exclusivamente observaciones reales de `weather_observations` en Cloudflare D1. Describe los **registros de la estación Meteo Ituzaingó** desde el inicio disponible; no es climatología oficial ni reconstruye información anterior.

## Períodos y zona horaria

Los meses, años y días se delimitan con `America/Argentina/Buenos_Aires`. D1 conserva UTC, pero el Worker transforma los límites locales a rangos UTC semiabiertos. La lista de meses y años se deriva de timestamps realmente almacenados, por lo que no ofrece períodos vacíos.

«Desde el inicio» usa exactamente la primera y la última observación de D1. Los años y meses en curso se señalan como parciales; si la estación comenzó durante un año, el rango visible y la cobertura impiden interpretarlo como un resumen anual completo.

## Metodología

- Temperatura, humedad y presión: mínimo, máximo y promedio de lecturas físicamente válidas. «Temperatura media registrada» es el promedio de observaciones, no una media oficial ni climatológica. Con el cron actual `*/10 * * * *`, las lecturas son aproximadamente regulares; los huecos se transparentan mediante cobertura.
- Extremos: se elige el primer timestamp almacenado cuando hay empate del valor real. La interfaz convierte siempre la fecha y hora a Argentina.
- Precipitación: cada total mensual/anual deriva primero los acumulados diarios usando la metodología auditada de v1.6: primera lectura válida, diferencias consecutivas y suma de una nueva lectura si el contador disminuye. Nunca se suman acumulados repetidos. El día más lluvioso es el máximo de esos totales diarios.
- Día con precipitación: total diario estrictamente mayor que `0 mm`; no se agrega un umbral artificial.
- Cobertura: observaciones registradas sobre las esperadas a partir del cron real de diez minutos (seis por hora). Se etiqueta internamente como buena (≥90 %), parcial (50–89 %) o insuficiente (<50 %). La comparativa requiere al menos 50 % en ambos períodos.

## Comparativas

Un mes o año en curso se compara con el mismo tramo transcurrido del período calendario anterior. Un período ya cerrado se compara con el período calendario completo anterior. La lluvia se informa siempre como diferencia absoluta: no se calculan porcentajes, especialmente cuando el período anterior registra `0 mm`.

## Rendimiento y límites actuales

`GET /api/statistics` realiza agregación y agrupación diaria dentro del Worker; el navegador recibe sólo indicadores, cobertura y una serie diaria compacta para Chart.js. No se descargan observaciones crudas para calcular estadísticas en el cliente. La consulta aprovecha el índice existente de `observed_at`; no se creó una tabla, índice, D1, Worker ni cron adicional. La conversión a fecha argentina se memoriza por día UTC durante la consulta para conservar el límite de CPU de Workers al crecer el histórico.

El histórico inicial todavía es corto. Las estadísticas mensuales/anuales están implementadas para que evolucionen con la base, pero hasta acumular años completos sólo expresan datos disponibles de la estación.
