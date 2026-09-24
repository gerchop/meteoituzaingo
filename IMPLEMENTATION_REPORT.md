# Informe de implementación v1.14

## Avisos locales: altas temperaturas, viento y explicabilidad térmica

La API pública incorpora cuatro familias, en orden estable: `low_temperature`, `high_temperature`, `thunderstorm` y `wind`. Las nuevas familias son evaluadores puros sobre cache D1. `ACTIVE` continúa siendo aviso vigente; `partial` e `insufficient_data` sin trigger se proyectan como Sin aviso; `unavailable` queda reservado para fallas reales, como payload corrupto.

**HIGH_TEMP.** Evalúa hoy y mañana ART desde `daily.days[].temperature_max`, con cache de hasta ocho horas. `>=34 °C` activa Información local y `>=36 °C` Atención local; múltiples fechas se consolidan en una familia y conserva evidencia por fecha. Daily es autónomo: la indisponibilidad de hourly no elimina un trigger daily. La sensación térmica no dispara ni eleva nivel: sólo se agrega si un dayPart horario completo y válido confirma temperatura superior a 26 °C, humedad superior a 40 %, ST superior y diferencia de al menos 3 °C.

**LOW_TEMP.** No se tocaron umbrales, categoría, target ni requisitos de fuente. Cuando su racha existente de dos horas consecutivas cumple ST `<=0 °C` y temperatura `<=10 °C`, la respuesta añade `triggerRun` con mínima ST, temperatura en ese instante, inicio, fin, cantidad de slots y dayParts. Home usa esa evidencia para explicar la causa; la decisión es idéntica con los mismos inputs anteriores.

**WIND.** Usa sólo hourly futuro dentro de hoy/mañana ART, con `updated_at` de hasta ocho horas. Información: sostenido `>=30 km/h` durante dos slots consecutivos o ráfaga individual `>=45 km/h`. Atención: sostenido `>=45 km/h` durante dos slots o ráfaga individual `>=60 km/h`. Duplicados y huecos no pueden simular persistencia; 23:00→00:00 es consecutivo. Dirección sólo enriquece el texto. Daily y PWS no activan ni modifican esta familia.

**Infraestructura y cuota.** No hubo migraciones, D1 writes, cron, proveedor, secreto, endpoint upstream ni cambio al scheduler. `/api/advisories` sigue leyendo solamente D1 y realiza cero fetches Meteored; el presupuesto normal se mantiene en 12 requests diarios. Social, Home hourly, SMN/CAP, EMA y Resend permanecen sin cambios funcionales.

**Validación local.** `npm.cmd test` pasó completo, incluyendo suites Social, cache, Home hourly, SMN/CAP, Current, EMA y Resend. Los casos de avisos cubren límites 33,9/34/35,9/36/40, autonomía daily, sensación térmica descriptiva, rachas LOW_TEMP, persistencia de viento, ráfagas, duplicados, huecos, medianoche y combinaciones. `node --check` y `git diff --check` pasaron.

---

# Informe de implementación v1.13.5

## Corrección temporal Social y presentación pública local

La auditoría del payload real confirmó intervalos horarios 00:00→01:00 hasta 23:00→00:00. Social ya no usa la etiqueta `end` como hora del período: prioriza `hours[].start` cuando existe y es consistente y, en su ausencia, deriva el inicio desde `end - 1 h`. La fecha, hora y dayPart se calculan en `America/Argentina/Buenos_Aires`. Se mantienen cuatro períodos de seis slots únicos; fixtures cubren todos los bordes, cruce de medianoche, duplicados, ausencia de un slot e inválidos. No se flexibilizó la cobertura ni se incorporó fetch desde Social.

`GET /api/advisories` ahora expone por familia `evaluationStatus` técnico y `publicStatus` independiente. Los triggers y estados internos de LOW_TEMP y Tormentas permanecen sin cambios: `partial` sigue siendo `partial`, pero se proyecta como `no_advisory` cuando no hay aviso activo. `active` siempre prevalece y `unavailable` queda reservado a una falla real, incluyendo payload cacheado corrupto. Home muestra «Aviso vigente», «Sin aviso» o «Información temporalmente no disponible» y conserva el disclaimer no oficial.

No hubo migraciones ni cambios a crons, cuota Meteored, SMN/CAP, PWS, EMA, Resend ni Home hourly. El presupuesto normal sigue siendo 12 requests Meteored/día.

---

# Informe de implementación v1.13.2

## Ingesta incremental CAP SMN

**Arquitectura:** RSS/CAP oficial SMN → cron dedicado → D1 → `GET /api/alerts` D1-only → Home. La corrección elimina el límite posicional `slice(0, 40)`, confirmado como causa raíz al observar un RSS de 190 items con Tormentas en el item 76 y Viento en el 163.

**Migración:** `0006_create_smn_cap_ingestion.sql`, exclusivamente aditiva: estado singleton, items CAP y relaciones `UPDATE`/`CANCEL`. No almacena geometría completa ni modifica tablas existentes.

**Límites:** batch 8, concurrencia 3, timeout 8 s, máximo estructural de diez requests externos por tick con discovery y RSS. El cron SMN propuesto es `5,15,25,35,45,55 * * * *`; PWS, Meteored, Social, EMA, Resend y Avisos locales permanecen aislados. El bootstrap de 190 identidades requiere como máximo 24 ticks (~4 h), sin depender de posición RSS.

**API:** `/api/alerts` hace cero requests SMN por visita, mantiene `Cache-Control: public, max-age=300`, excluye vencidas y conserva alertas válidas cuando la fuente se vuelve temporalmente stale. Updates y Cancels se resuelven por relaciones persistentes, también fuera de orden.

**Validación local:** fixtures de 190 identidades, items equivalentes 76/163/último, onset futuro, Update, Cancel, polígono dentro/fuera, límite de batch y concurrencia máxima 3 pasan. Las suites existentes de Social, Current, Avisos, Forecast Cache, EMA y Resend permanecen verdes.

**Producción:** el inventario remoto confirmó dos cron triggers existentes y ningún otro schedule en la cuenta; el tercero queda dentro del máximo Free de cinco. La migración remota `0006` se aplicó sin cambios destructivos y el Worker se desplegó como `cc47daab-7d50-48fa-910c-12e976ce3f5d`. El primer cron SMN registró 190 identidades y procesó su batch normal de ocho CAP: siete exitosos y un retry aislado, sin alertas aplicables todavía durante el bootstrap. No se forzó una descarga masiva.

---

# Informe de implementación v1.13.1

## Resiliencia social a medianoche

El scheduler Meteored ahora calcula el próximo slot en `America/Argentina/Buenos_Aires` (00/04/08/12/16/20) en bootstrap y tras un éxito, evitando drift relativo. El cron físico `*/10`, lease de cinco minutos, backoff y presupuesto normal de seis ciclos / doce requests diarios se preservan. El cron social se mueve de `1 3 * * *` a `11 3 * * *`, equivalente a 00:11 ART.

El generador social sigue siendo D1-only y clasifica la salida como `complete`, `partial` o `incomplete`. Un día completo exige cuatro dayParts completos; los bloques incompletos se omiten. Cuando daily está dentro de su límite existente de 48 h y hourly no alcanza cobertura, se genera un resumen explícitamente general/parcial, sin dayParts ni términos meteorológicos fuera de la whitelist Social. No se modificaron Home, Avisos, SMN, EMA, scheduler de captura ni se añadieron migraciones.

---

# Informe de implementación v1.13

## Avisos locales multifamilia y tormentas

La respuesta de `GET /api/advisories` ahora añade `families`: `low_temperature` y `thunderstorm` exponen por separado `no_advisory`, `advisory` o `insufficient_data`. Los campos legacy de bajas temperaturas se conservan para no romper clientes existentes. La Home presenta ambas familias en el panel «Avisos locales» y reserva «Alertas oficiales» exclusivamente para el SMN.

La familia `thunderstorm` es un evaluador puro sin fetch ni escrituras. Usa únicamente daily ya almacenado en D1 y activa sólo con `THUNDERSTORM_SYMBOLS = [34, 35]`, conforme a `GET /api/doc/v1/forecast/symbol` / `DocForecastSymbolV1`: tormenta con cielo parcialmente nuboso o cubierto. Los símbolos 10/11 (tormenta seca) y 38/39 (tormenta con granizo) están explícitamente reservados para una decisión futura de producto.

La evaluación alcanza hoy y mañana ART, requiere `updated_at` de ocho horas o menos y no interpreta `expires_at` upstream como vigencia meteorológica. Daily es suficiente para activar `information`; hourly fresco sólo agrega dayParts respaldados por slots 34/35, sin afirmar duración de seis horas. Lluvia, POP, ráfagas, presión, humedad, PWS y radar no intervienen en trigger ni nivel. Ante información vieja o incompleta se devuelve `insufficient_data`, nunca un falso «Sin aviso».

No se modificaron scheduler, lease, backoff, 429, crons, presupuesto, D1, Social, EMA, Resend, SMN ni Home hourly v1.12.4. Los tests determinísticos cubren símbolos de trigger y reservados, frescura exacta y vencida, horizonte, daily-only, dayParts, medianoche, multiday, familias y la presentación pública; no realizan llamadas Meteored reales.

---

# Informe de implementación v1.12.4

## Pronóstico horario stale utilizable

La disponibilidad pública hourly ya no termina sólo al superar doce horas desde `updated_at`. La respuesta analiza el payload persistido en D1, valida `start` y los `end` epoch ms, elimina duplicados, ordena los slots y conserva exclusivamente aquellos con `end > now`. Cuatro slots futuros es la cobertura mínima para Home; con esa cobertura, la API responde `FRESH` o `STALE_USABLE` según la antigüedad. Con cero a tres, responde `EXHAUSTED` y no expone horas pasadas; sin payload parseable, responde `UNAVAILABLE`.

La guardia temporal conserva coherencia con el contrato observado de horizonte diario: `start` debe ser razonable respecto de la actualización y cada slot debe caer en la ventana horaria esperable. Así, un timestamp anormalmente futuro no puede convertir un cache antiguo en utilizable. A medianoche no se extiende ni duplica el payload: al agotarse los `end` futuros, el estado pasa naturalmente a `EXHAUSTED`.

El navegador mantiene la presentación actual de hasta doce tarjetas futuras y muestra una nota discreta para `STALE_USABLE`. Para `EXHAUSTED` informa falta de actualización reciente, sin atribuir erróneamente un fallo a Meteored. No se modificaron daily, Social, Avisos, scheduler, crons, lease, backoff, D1 ni presupuesto. Las pruebas cubren frescura, 12/8/4 y 3/2/1/0 slots, instante exacto, medianoche, duplicados, orden, payload inválido y guardia temporal, además de las regresiones v1.12.3.

---

# Informe de implementación v1.12.3

## Corrección estructural de la cuota Meteored

El incidente quedó atribuido a una incompatibilidad entre TTL upstream y scheduler: Meteored entregaba `expiracion` de aproximadamente 59 segundos, mientras el cron `*/10` consideraba insuficiente todo payload que no excediera diez minutos. Cada tick ejecutaba ambos endpoints y podía alcanzar 288 requests/día; el 18/09/2026 se confirmó `HTTP 429` después de 50 solicitudes teóricas entre 00:00 y 04:00 ART.

v1.12.3 desacopla `expires_at` de la autorización de consumo. La tabla singleton `meteored_refresh_state` contiene el próximo intento, último intento/éxito, estado técnico sanitizado, backoff y lease. La adquisición se realiza con `UPDATE ... WHERE` atómico y lease de cinco minutos. Sólo el cron existente puede obtener ese lease; visitantes, social y avisos no importan ni invocan el fetch upstream.

Un ciclo sano consulta como máximo `hourly` y `daily` cada cuatro horas: seis ciclos, doce requests/día. El resultado válido se persiste de manera independiente; un éxito parcial conserva la otra caché y usa backoff de una hora. Un 429 corta el ciclo antes de `daily` y usa `Retry-After` o 24 h; 401/403 usan 24 h; 5xx o red usan una hora. No se registra cuerpo de error ni secreto.

Las rutas públicas mantienen `data` y `expiracion` por compatibilidad y añaden `cache` (`stale`, `updatedAt`, `upstreamExpiresAt`). La Home sólo muestra una nota discreta cuando corresponde. Se permiten hasta 12 h stale para el pronóstico horario y 48 h para el diario; luego el endpoint falla de forma controlada. El bootstrap de migración espera 24 h, evitando una llamada inmediata tras un incidente de cuota.

Las pruebas determinísticas cubren presupuesto de 24 h, TTL upstream de 60 s, 100 lecturas públicas stale, lectura social, lease concurrente/vencido, 429, 401, 403, 5xx y éxitos parciales. No se ejecutaron consultas reales a Meteored durante implementación o pruebas.

---

# Informe de implementación v1.12.2

## Modelo temporal de Avisos Meteo Ituzaingó

La respuesta de cada aviso conserva los límites legacy `startsAt` y `endsAt`, e incorpora el modelo temporal explícito: `targetLocalDate` identifica la jornada elegida por la política ART sin cambios (antes de las 12:00, hoy; desde las 12:00, mañana); `evaluationPeriod` representa lo que evalúa la regla; `evidencePeriods` describe los bloques realmente respaldados; `displayValidity` es `dynamic`; y `temporalPrecision` declara `daily` u `hourly`.

La evidencia diaria no declara hora de mínima ni dayPart: Home muestra «Jornada prevista» con fecha humana en ART. La evidencia horaria se divide por los identificadores genéricos `dawn`, `morning`, `afternoon` y `night` (00:00–05:59, 06:00–11:59, 12:00–17:59 y 18:00–23:59), soporta múltiples días y resume los cuatro como «todo el día». Un intervalo cruzando medianoche conserva ambas fechas.

La regla de bajas temperaturas no cambió. Sensación térmica requiere la cobertura completa existente de seis slots de madrugada; sólo entonces se entrega y presenta el mínimo representativo. No se añaden requests meteorológicos, persistencia, D1, migraciones, crons, Workers o secretos.

---

# Informe de implementación v1.12.1

## Hotfix de Avisos Meteo Ituzaingó

La evaluación separa mínima diaria, sensación horaria y contexto PWS. La mínima usa `daily.days[]` para la jornada térmica objetivo; sensación exige seis slots continuos de 00:00–05:59 ART. El resultado distingue `advisory`, `no_advisory` y `partial`, sin convertir ausencia de cobertura en ausencia de aviso.

El cron existente de captura verifica el cache Meteored y sólo solicita hourly/daily cerca de su vencimiento. La tarea está aislada: un error no bloquea la captura PWS ni EMA, no borra el último cache y no añade infraestructura.

---

# Informe de implementación v1.10

## Preparación local v1.11 — Monitor EMA

La implementación local reutiliza el cron de observaciones y no realiza consultas meteorológicas adicionales. `dataFreshness` se calcula a partir de `MAX(observed_at)` y conserva la verdad histórica aun si la captura actual falla; `captureHealth` reporta ese fallo por separado. La migración y el outbox permanecen sin aplicar en producción. El adaptador de correo es una interfaz de prueba: no existen secrets ni requests de Resend en esta fase.

La limitación permanece explícita: un Worker o cron que no ejecuta no puede alertarse desde sí mismo. El deploy queda condicionado a aplicar la migración controlada y configurar un proveedor/destino de correo aprobado.

---

## Pronóstico social avanzado, determinístico y acotado

v1.10 reutiliza exclusivamente los payloads Meteored ya cacheados y divide las horas del día argentino en cuatro períodos. Cada período registra cobertura, temperatura, sensación, POP, suma de lluvia sólo si sus seis horas están completas, viento, ráfaga, dirección dominante y símbolos. No se añadieron llamadas Meteored, D1, migraciones ni crons.

La revisión previa al deploy corrigió una ambigüedad: antes, el dominante se calculaba sólo entre símbolos válidos, por lo que `[1,1,1,1,3]` terminaba descrito como «Nubes y claros». Ahora se contabilizan `knownSymbolHours`, `unknownSymbolHours` y `symbolCoverage`; se exige cobertura validada de al menos 60 % para publicar un cielo. Los datos numéricos seguros no dependen de ese umbral. Los fixtures cubren minoría válida (20 % y 16,7 %) y mayoría válida (66,7 %).

La validación previa demostró que el JSON v1 no usa el catálogo XML histórico. Sólo 3, 4, 5, 12 y 13 pueden describirse automáticamente; 12/13 son lluvia débil, nunca chaparrones. Símbolos desconocidos conservan los datos numéricos seguros, no obtienen una descripción y generan un único log estructurado por código durante la ejecución. Tormentas, granizo, niebla/neblina, heladas, severidad e intensidad de lluvia siguen explícitamente prohibidos.

Las reglas editoriales se documentan en `SOCIAL_FORECAST.md`: POP ≥40 %, o ≥20 % con precipitación validada; ráfagas desde 35 km/h; «Ventoso» desde 30 km/h sostenidos o 45 km/h de ráfaga; sensación con diferencia ≥3 °C; fresco ≤10 °C, muy frío ≤5 °C, caluroso ≥30 °C y muy caluroso ≥35 °C. No son categorías de Meteored ni del SMN.

---

# Informe de implementación v1.9.1

## Corrección CORS de alertas SMN

La respuesta exitosa de `GET /api/alerts` se devolvía directamente desde `alertsResponse()`. Eso preservaba el resultado real del SMN y el caché, pero omitía `corsHeaders(request, env)`, a diferencia de los demás endpoints públicos y del camino de error. En una consulta desde GitHub Pages el navegador bloqueaba la lectura por no recibir `Access-Control-Allow-Origin`; el frontend entraba correctamente en su `catch` y mostraba indisponibilidad aunque `ok: true` y `alerts: []` fueran válidos.

El router ahora combina los encabezados de la respuesta de alertas con el helper CORS centralizado antes de devolverla. La respuesta conserva `Content-Type` y `Cache-Control`, obtiene `Vary: Origin` y, para `https://gerchop.github.io`, `Access-Control-Allow-Origin` con ese valor. El handler global `OPTIONS` ya reutilizaba este helper. No se habilitan credenciales, no se altera la Cache API ni se cambia la lógica de alertas.

---

# Informe de implementación v1.9

## Alertas oficiales SMN (GO-B)

Se integró `GET /api/alerts` en el Worker existente con fuente exclusiva SMN, Cache API y filtro polygon para Ituzaingó. El índice oficial `/rss` se trata como HTML para descubrir el feed; RSS/CAP continúan rechazando DOCTYPE/entidades. No se usan D1, crons ni servicios pagos y no se traducen niveles o colores SAT.

La causa del hotfix fue procesar el índice HTML como XML seguro. v1.9.3 separó ambos flujos y conserva fallback a la última URL CAP oficial validada. Producción devuelve HTTP 200 y `ok:true` cuando no hay CAP local aplicable.

---

# Informe de implementación v1.8.4

## Recuperación controlada WeatherCloud

Se auditó el CSV original de WeatherCloud de septiembre de 2026 y el esquema D1 real antes de escribir datos. El CSV usa `;`, `America/Argentina/Buenos_Aires`, decimales regionales y unidades explícitas. Se mapearon exclusivamente variables exteriores compatibles con `weather_observations`; las variables interiores, radiación, UV e índices de calor se omitieron. La lluvia e intensidad de lluvia son 0 en las 116 filas y se almacenaron como `precip_total=0` y `precip_rate=0` en las filas recuperadas.

El rango seguro fue el intervalo abierto entre la última observación previa `2026-09-05T20:49:18.000Z` y la primera captura automática posterior `2026-09-06T15:40:01.000Z`. De 116 filas CSV, 114 pertenecían a ese intervalo. Se excluyeron las filas de `2026-09-06T15:50:00.000Z` y `2026-09-06T16:00:00.000Z`, posteriores al hueco, incluso cuando no coincidían por segundos con la captura automática.

La operación insertó exactamente 114 timestamps UTC únicos, desde `2026-09-05T20:50:00.000Z` hasta `2026-09-06T15:40:00.000Z`. No se ejecutaron `UPDATE`, `DELETE` ni `REPLACE`. La verificación remota confirmó 114 filas y 114 timestamps distintos, 114 valores de precipitación/rate en cero, continuidad de diez minutos, cero inserciones de las dos filas excluidas y 118 filas únicas en el rango de borde completo. El historial total pasó a 2522 observaciones y su última captura fue `2026-09-06T17:49:55.000Z`, confirmando que el cron continúa activo.

Los endpoints de resumen diario, historia e información devolvieron `200`; Home e Históricos fueron accesibles en GitHub Pages. El panel privado continuó sirviéndose en `200` y su endpoint de sesión rechazó correctamente accesos no autenticados con `401`. No fue necesario desplegar el Worker, dado que la recuperación fue una operación D1 administrativa.

---

# Informe de implementación v1.8.3

## Restauración de captura automática

La auditoría D1 confirmó el hueco real: antes de la recuperación, la última fila era `2026-09-05T20:49:18.000Z` (17:49 Argentina). Se conservaron todas las filas y no se reconstruyó el período faltante. La configuración de Wrangler ya contenía ambos triggers, pero el handler introducido en v1.8 delegaba la captura a un `else` implícito, mientras el cron social tenía el único identificador explícito. Esa separación no era auditable ni protegía la responsabilidad crítica de captura frente a cambios de triggers.

v1.8.3 declara `CAPTURE_CRON` y `SOCIAL_CRON` y enruta cada valor de `event.cron` de forma explícita, con retorno independiente y aviso para cron desconocido. El deploy reinstaló ambos triggers: captura `*/10 * * * *` y social `1 3 * * *`. No se tocaron secrets, Weather.com, Meteored, tablas ni registros históricos.

Las verificaciones remotas posteriores mostraron nuevas filas consecutivas: `2026-09-06T15:40:01.000Z`, `15:50:01.000Z` y `15:59:56.000Z` (12:40, 12:50 y 12:59 Argentina). Las dos últimas son posteriores al deploy y prueban continuidad automática aproximada de diez minutos. `MAX(observed_at)` avanzó a `2026-09-06T15:59:56.000Z`; `/api/daily-summary` volvió a tener tres observaciones reales y cobertura parcial, `/api/history/info` informó la nueva última observación y `/admin/redes` continuó respondiendo `200`.

La prueba manual no usó `POST /api/admin/capture` porque requiere el `ADMIN_TOKEN` deliberadamente no disponible para el frontend ni el repositorio. La recuperación quedó validada mediante las ejecuciones automáticas reales, que ejercitan la misma función `captureWeatherObservation()` e inserción idempotente en D1.

---

# Informe de implementación v1.8.2

## Corrección de lectura de CSRF

La causa raíz fue un desajuste de contrato en `socialScript()`: el helper `api()` devolvía siempre `body.data`, pero `POST /api/admin/login` devuelve correctamente `{ ok: true, csrf: "…" }` en la raíz. Por ello `result` era `undefined` y la lectura `result.csrf` provocaba el error visible. El backend, secrets y contrato de login no requerían cambios.

El helper ahora admite respuestas raíz con `raw:true`, valida que exista `result.csrf` antes de asignarlo y muestra un mensaje controlado si falta. Se agregó `GET /api/admin/session`, protegido por la cookie existente, para restaurar el CSRF al recargar: F5 mantiene la sesión y permite mutaciones con el mismo token firmado.

Producción: el JavaScript descargado validó con Node; login devolvió `200`, `csrf` raíz presente y sin `data`; sesión restaurada devolvió el mismo token; pronóstico cargó con estado `generated`; logout devolvió `200` y una consulta posterior `401`. Worker publicado: `e4555069-00fe-49b5-942c-df8c486213b8`.

---

# Informe de implementación v1.8.1

## Corrección urgente del login

El diagnóstico de producción fue correcto: `redes.js` devolvía `200` pero contenía un `SyntaxError: Invalid or unexpected token` cerca de la columna 1209. La fuente afectada era `socialScript()` en `cloudflare/src/index.js`. Dentro de su template literal, `\n` se interpretaba al construir la respuesta y emitía una nueva línea física dentro de una cadena JavaScript delimitada por comillas simples (`...length+'` seguido de salto de línea), que el navegador no puede analizar.

La corrección duplica el escape en la fuente para que el recurso emitido conserve la secuencia JavaScript `\n`. Antes del deploy se evaluó el recurso generado con `new Function`; después del deploy, el recurso descargado de producción validó con Node como `ProductionJavaScript=OK`. La versión publicada del Worker es `95f039d7-baa3-4c8d-9e35-b33d3bba3b57`.

La prueba de producción confirmó `POST /api/admin/login` con contraseña correcta en `200`, CSRF presente y sesión creada; una contraseña incorrecta devuelve `401`. El panel HTML carga desde `/admin/redes`, el formulario y el script quedan disponibles sin SyntaxError. No se modificaron secrets, D1, Meteored, dashboard ni funciones públicas.

---

# Informe de implementación v1.8

## Generador privado para redes

La auditoría confirmó que Meteored se consumía directamente desde el dashboard y su caché sólo vivía en `localStorage`; esa caché no podía ser utilizada por un cron. v1.8 trasladó la solicitud al Worker existente con `METEORED_API_KEY` como Secret, cache persistente D1 hasta la expiración informada por Meteored y endpoints públicos equivalentes para no alterar las tarjetas de pronóstico.

Se agregó la migración no destructiva `0002_create_social_forecasts.sql`: pronósticos únicos por fecha, caché de fuente y límites de login. El cron existente `*/10 * * * *` continúa capturando Weather.com; `1 3 * * *` genera alrededor de las 00:01 de Argentina. La primera generación manual publicada produjo el 05/09/2026 una publicación real de 227 caracteres, con estado `generated`, a partir de 24 horas y cinco días Meteored.

El panel privado se sirve same-origin en `https://meteoituzaingo-history.meteoituzaingo.workers.dev/admin/redes`, sin Analytics, sitemap ni datos privados embebidos. Login, sesión firmada de 12 horas, cookie HttpOnly/Secure/SameSite=Strict, CSRF para mutaciones, logout y rate-limit de cinco fallos por quince minutos protegen la edición, regeneración e historial. No existe integración ni publicación automática en X.

---

# Informe de implementación v1.7.1

## Corrección de estadísticas y selectores

La causa raíz fue un excedente de CPU del Worker publicado (`error code: 1102`), no una ausencia de datos ni un error de CORS. `statisticsInfo()` y `dailyStatistics()` invocaban `Intl.DateTimeFormat` indirectamente para cada fila D1 al traducir UTC al calendario argentino. Al solicitar el histórico completo, esas miles de conversiones podían superar el límite de CPU y el frontend recibía el fallback «Estadísticas temporalmente no disponibles».

Se reemplazó esa repetición por una caché de fecha local por día UTC: cada día se resuelve con las utilidades existentes de `America/Argentina/Buenos_Aires` y sus observaciones reutilizan el resultado. No se codificó UTC-3, no se cambió el contrato API, la tabla, el índice, el cron ni la metodología de precipitación. El Worker corregido quedó desplegado como `6489d6c5-a144-4464-b143-7cd0a48ff012`.

La auditoría D1 real encontró inicio `2026-08-19T19:39:27.000Z`, última observación `2026-09-05T18:59:19.000Z`, 2383 filas, agosto con 1764 observaciones y septiembre con 619. El endpoint público devuelve esos dos meses y el año 2026. Para septiembre, sus 619 observaciones, mínima `5,8 °C`, máxima `24,0 °C` y ráfaga `30,6 km/h` coinciden con una consulta D1 independiente; el mes se informa correctamente como parcial y contiene cinco agregados diarios.

Tras el deploy, `statistics/info`, mes, año y todo el histórico respondieron `200`; CORS devolvió exactamente `https://gerchop.github.io`; un parámetro inválido devolvió `400`. Una carga headless de GitHub Pages confirmó selectores hidratados, tarjetas reales y ambos canvas diarios renderizados, sin el fallback técnico. Un período válido sin filas continúa devolviendo `data: null` para que el frontend muestre «No hay datos disponibles para este período.»

---

# Informe de implementación v1.7

## Estadísticas históricas de la estación

La nueva capa de `historicos.html` consulta meses y años realmente disponibles en D1 y permite elegir un mes, un año o todo el histórico. Muestra extremos con timestamps argentinos, temperatura media registrada, humedad, presión, ráfaga, acumulado de lluvia, día más lluvioso, días con lluvia, observaciones y cobertura. Incluye gráficos diarios de temperatura y precipitación reutilizando Chart.js y la estética existente.

`/api/statistics` agrega los datos dentro del Worker; el frontend recibe indicadores y series diarias, no observaciones crudas masivas. No se modificaron Weather.com, Meteored, radar, satélite, dashboard, Analytics, SEO, sitemap, Search Console, D1, el Worker existente, la captura ni el cron `*/10 * * * *`.

Los límites de todos los períodos son `America/Argentina/Buenos_Aires`. La lluvia se calcula primero por día mediante la regla ya auditada de primera lectura, diferencias y reinicios de `precip_total`; los períodos suman esos resultados diarios. «Día con lluvia» significa un total diario mayor que cero. En empates, las consultas ordenan por timestamp ascendente y muestran la primera ocurrencia real.

La cobertura usa seis observaciones esperadas por hora, de acuerdo con el cron existente. Se considera suficiente para comparativas a partir de 50 % en ambos períodos. Los períodos en curso se contrastan sólo contra el mismo tramo relativo anterior; los cerrados contra el calendario anterior completo. No se usan porcentajes de lluvia, por lo que `0 mm` no produce resultados engañosos.

El histórico sigue siendo una base propia en crecimiento: toda interfaz emplea «registros de la estación» y «datos disponibles», nunca récord climatológico oficial. Los años parciales exponen su rango real. Metodología, límites y contrato se documentan en `STATISTICS.md` y `HISTORY_API.md`.

## Validación de datos reales

- El esquema remoto conserva exclusivamente `weather_observations` y `idx_weather_observations_observed_at`; no hubo migración ni escritura de D1.
- Tras el deploy del Worker, `/api/statistics/info` devolvió meses `2026-08` y `2026-09`, año `2026`, inicio real `2026-08-19T19:39:27.000Z` y el último timestamp disponible en la prueba.
- Para septiembre de 2026, `/api/statistics` devolvió 617 observaciones, 92 % de cobertura, cinco filas diarias y 6,1 mm. La suma independiente de los cinco `daily-summary` del mes también fue 6,1 mm.
- Se verificaron `400` para un período inválido y CORS exacto para `https://gerchop.github.io`. El empaquetado Wrangler, `node --check` de Worker/frontend y `git diff --check` completaron sin errores funcionales.

---

# Informe de implementación v1.6.1

## Corrección de registros diarios en Home

La auditoría confirmó que el bloque «Registros recientes» no usaba D1. `guardarObservacionLocal()` guardaba respuestas directas de Weather.com en `localStorage` por navegador, descartaba muestras con más de 24 horas y retenía un máximo de 96. `mostrarRegistrosRecientes()` calculaba sus máximas/mínimas sobre esa ventana local. Por lo tanto, su cobertura dependía de cuándo se abrió el dashboard, de la persistencia del navegador y de cuántas actualizaciones locales habían ocurrido; si sólo había lecturas similares, máxima y mínima podían coincidir.

En contraste, «Resumen de hoy» usa `GET /api/daily-summary` sobre observaciones persistentes de D1, delimitadas en `America/Argentina/Buenos_Aires`, con horas de extremos, cobertura y metodología de precipitación ya validada. Ambos bloques parecían describir el mismo día, pero no medían el mismo universo de datos, causando una inconsistencia de UX.

Se eliminó solamente el HTML, CSS y renderizado específico de «Registros recientes». El historial local y `localStorage` continúan porque las tendencias breves de temperatura, presión y viento de la cabecera los necesitan. No se cambió backend, endpoint, D1, cron, cálculo diario, lluvia, Históricos, SEO, Analytics, sitemap ni archivo de verificación de Google.

La etiqueta pública del bloque autoritativo cambió de «Registros permanentes» a «Resumen diario». Desde v1.6.1 es la única respuesta visible en Home para extremos y acumulados del día.

## Pruebas

- `node --check` y `git diff --check` sobre los archivos modificados.
- Auditoría estática: no quedan `recentRecordsSection`, `recentRecords` ni `mostrarRegistrosRecientes` en Home.
- GitHub Pages publicado respondió `200`: el HTML ya no contiene `recentRecordsSection` ni «Registros recientes», conserva Analytics y presenta «Resumen diario». Una carga controlada en navegador confirmó tarjetas D1, horarios, ráfaga, precipitación, narrativa y comparación renderizadas correctamente.

---

# Informe de implementación v1.6

## Resultado

v1.6 convierte los registros permanentes de D1 en un resumen meteorológico diario real. La Home incorpora un bloque compacto «Resumen de hoy» y `historicos.html` reutiliza su selector de fecha para presentar el mismo modelo enriquecido. Weather.com, Meteored, radar, satélite, Analytics, SEO, D1, cron, CSV y gráficos existentes se conservaron.

## Backend y timezone

Se añadió `GET /api/daily-summary` al Worker existente `meteoituzaingo-history`; no se crearon Worker, D1, tablas, migraciones, índices ni tareas. El endpoint admite `date=YYYY-MM-DD` opcional y responde `date`, `timezone`, `isCurrentDay`, `data` y `comparison`. Los días usan el rango semiabierto de medianoche a medianoche en `America/Argentina/Buenos_Aires`, convertido a UTC mediante las utilidades existentes.

`data` devuelve primera/última observación, cantidad, cobertura, máximas/mínimas, horas de máximas/mínimas de temperatura, viento y ráfaga, humedad, presión y precipitación. Los valores imposibles se excluyen antes de agregarse; cuando no hay filas el endpoint devuelve `data: null`, sin inventar ceros.

Para eficiencia, el Worker usa el índice temporal existente: una agregación del rango diario, cuatro consultas de extremos con timestamp y una lectura de sólo `observed_at`/`precip_total`, limitada a 300 filas. La Home consulta al iniciar y cada diez minutos; el caché público del endpoint se mantiene en 60 segundos.

## Precipitación y comparación

La auditoría de registros reales confirmó que `precip_total` es acumulativo durante el día local: el 27/08/2026 creció de 0,25 a 17,53 mm y se observaron valores reiniciados después del cambio de día. El resumen toma la primera lectura válida, suma diferencias consecutivas y, si el acumulado disminuye, suma la lectura nueva como reinicio. No suma acumulados completos fila a fila. `precip_rate` conserva su uso como intensidad para gráficos.

La comparación de Home es «hoy hasta ahora» contra «ayer hasta la misma hora», evitando comparar un día parcial con ayer completo. La frase local se genera con reglas determinísticas, omite variables faltantes y sólo informa lluvia cuando existe. Cobertura parcial se indica si faltan más de dos intervalos de diez minutos al inicio o al final.

## Frontend y documentación

- `dashboard.html`, `js/dashboard.js` y `css/dashboard.css`: bloque responsive, siete tarjetas reutilizando la identidad visual, cobertura, frase y comparación compacta.
- `js/history.js` y `js/history-api.js`: resumen diario enriquecido coordinado con el selector de fecha existente; no se agregaron controles nuevos.
- `DAILY_SUMMARY.md` y `HISTORY_API.md`: metodología, contrato, calidad, lluvia, cobertura, consultas y fallback.
- `README.md`, `AI_INSTRUCTIONS.md` y `CHANGELOG.md`: capacidad y restricciones actualizadas.

## Pruebas reales

- `node --check` sobre Worker y scripts modificados; `git diff --check`; empaquetado Wrangler `--dry-run` correcto con los mismos bindings.
- Worker desplegado como versión `60d600bd-0a7d-41d9-ba27-d61bfe7f18eb`; D1 y cron `*/10 * * * *` se conservaron.
- `/api/daily-summary` actual devolvió `200`, `America/Argentina/Buenos_Aires`, datos reales, CORS para GitHub Pages y comparación de mismo intervalo con ayer.
- `/api/daily-summary?date=2026-08-27` devolvió 17,53 mm; un cálculo independiente sobre `/api/history?date=2026-08-27` coincidió exactamente. Máxima, mínima y ráfaga máxima también coincidieron con las filas reales.
- Una fecha previa al comienzo del histórico devolvió `data: null`; una fecha inválida devolvió `400`.
- GitHub Pages publicado respondió `200` para Dashboard e Históricos. Una carga controlada en navegador confirmó el bloque Home renderizado con datos reales y comparación, y el resumen de Históricos coexistiendo con sus gráficos, comparativas y récords. Analytics, sitemap y el archivo de verificación de Google permanecieron accesibles.

## Limitaciones y siguiente paso

El histórico comenzó el 19/08/2026: los resúmenes tempranos o con cobertura parcial se identifican como tales. No se implementaron estadísticas mensuales, efemérides, nuevos récords ni publicaciones Blogger automáticas. La API puede usarse más adelante para contenido editorial sin cambiar la metodología diaria.

---

# Informe de implementación v1.5

## Resultado

v1.5 prepara la publicación y el crecimiento de Meteo Ituzaingó sin alterar las fuentes meteorológicas, el Worker, D1, cron, cachés, gráficos, CSV ni Cloudflare Web Analytics. Las mejoras reales son SEO estático, pequeños ajustes semánticos y de renderizado, y documentación operativa para Search Console, seguridad, AdSense y Blogger.

## SEO e indexación

- `dashboard.html` usa el título **Clima en Ituzaingó | Tiempo actual, pronóstico y radar | Meteo Ituzaingó** y una descripción localizada, natural y directamente disponible en HTML.
- `historicos.html` conserva un título específico y una descripción de sus datos, períodos y variables registradas.
- Ambas páginas incluyen `lang="es"`, `robots=index,follow`, canonical absoluto de GitHub Pages, Open Graph completo (`title`, `description`, `type`, `url`, `site_name`) y Twitter Card `summary`. No se declaró `og:image` ni `summary_large_image` porque no existe aún una imagen social 1200×630 adecuada.
- Se reemplazó el JSON-LD aislado por grafos `WebSite` y `WebPage` con URL, nombre, descripción e idioma. No se inventó un `Dataset` para datos dinámicos ni propiedades meteorológicas no disponibles.
- Se agregaron `sitemap.xml` UTF-8 y `robots.txt` en la raíz. El sitemap contiene sólo `dashboard.html` e `historicos.html`, con URLs absolutas y sin APIs, localhost ni `lastmod` artificial.
- Se creó `favicon.svg`, un recurso vectorial liviano y local.

## HTML, accesibilidad y rendimiento

- Las cabeceras principales ahora son elementos `header`; cada página conserva un único H1 y se añadió contexto textual breve sin sobrecargar el dashboard.
- Se añadieron footer semántico, enlaces HTML crawlables entre Inicio e Históricos, fuentes y foco visible de teclado. No se modificó la distribución de los módulos meteorológicos.
- Radar y satélite mantienen `loading="lazy"` y suman `decoding="async"`. Se mantienen sus contenedores de altura mínima existentes para reservar espacio; no se fijó una relación de aspecto ficticia porque los proveedores entregan imágenes dinámicas de dimensiones variables.
- No se tocaron ciclos de actualización, cachés, peticiones de Meteored, carga histórica, Chart.js ni beacon de Analytics. La importación de Inter ya utilizaba `display=swap`; no se agregaron fuentes ni SDKs.

## Monetización, Blogger y seguridad

- `MONETIZATION.md` define posiciones futuras sin renderizar contenedores ni anuncios. AdSense, Publisher ID, `ads.txt`, CMP y código publicitario quedan fuera de v1.5.
- `BLOGGER_INTEGRATION.md` compara iframe frente a integración directa y recomienda integrar el contenido principal en Blogger, manteniendo GitHub Pages como staging y Worker/D1 como API externa.
- `SEARCH_CONSOLE.md` detalla el procedimiento manual de propiedad, verificación y envío de sitemap sin valores inventados.
- `SECURITY.md` separa secretos de Worker, identificadores públicos y credenciales expuestas por el frontend. Recomienda una futura migración de la observación actual de Weather.com al Worker, pero no la ejecuta por riesgo operativo.

## Auditoría y limitaciones detectadas

La v1.4 no tenía canonical, `og:url`, `og:site_name`, metadatos sociales completos en Históricos, sitemap, robots, favicon ni documentación operativa de Search Console/seguridad. El HTML ya tenía `lang`, descripciones parciales, alt de radar/satélite, carga diferida y navegación básica. No se encontró CSS activo de Leaflet ni CX2SA para retirar.

La futura migración a Blogger deberá sustituir de forma coordinada canonical, URLs de JSON-LD, Open Graph, sitemap, robots, navegación, CORS del Worker y Site Token de Analytics. Los pageviews de v1.4 siguen activos porque los scripts de Analytics permanecen sin cambios.

## Pruebas

- Se verificó que ambos HTML tienen un único H1, canonical, descripción, metadatos Open Graph/Twitter, scripts de Analytics y enlaces internos.
- Se validó el JSON-LD de ambas páginas con `JSON.parse` y el XML del sitemap con el parser XML del sistema.
- Se verificó la sintaxis de `robots.txt`, que las URLs del sitemap son absolutas y que no incluye API, localhost ni rutas privadas.
- Se ejecutaron `node --check` sobre scripts actuales, `git diff --check` y comprobaciones estáticas de recursos/atributos nuevos.
- GitHub Pages publicado respondió `200` para Dashboard, Históricos, sitemap, robots y favicon. Se confirmaron en producción ambos canonical, los grafos `WebSite`/`WebPage`, las dos URLs del sitemap, su referencia desde robots y las referencias existentes al cargador de Analytics.
- Search Console y AdSense requieren acciones manuales/autenticadas y no se simularon. La propiedad de Analytics conserva el mismo cargador y Site Token de v1.4; sus métricas agregadas se verifican desde el panel autenticado de Cloudflare.

## Recomendación v1.6

Validar los metadatos publicados en Search Console y un validador de resultados enriquecidos, crear una imagen social 1200×630 antes de usar `og:image`, y planificar la migración de Weather.com al Worker sólo mediante una versión dedicada con pruebas de cuota, cache, CORS y reversión.

---

# Informe de implementación v1.4

## Resultado

Se integró Cloudflare Web Analytics para medir pageviews reales de `dashboard.html` e `historicos.html`, sin alterar Weather.com, Meteored, radar, satélite, el Worker `meteoituzaingo-history`, D1, cron, API histórica, gráficos ni CSV. No se añadieron componentes visuales, SDKs ni servicios pagos.

## Implementación

- `js/analytics-config.js` centraliza el proveedor, URL del beacon, hosts locales excluidos y el Site Token público correspondiente a `gerchop.github.io`.
- `js/analytics.js` se carga con `defer`, resuelve el token por `location.hostname` y crea el script oficial de Cloudflare con `type="module"`, `async`, `src="https://static.cloudflareinsights.com/beacon.min.js"` y `data-cf-beacon`.
- El cargador evita cargas duplicadas mediante `window.__meteoAnalyticsBeaconLoaded` y una comprobación de `script[data-cf-beacon]`.
- `dashboard.html` y `historicos.html` incluyen los dos archivos comunes. No existen otras páginas públicas HTML en el repositorio.
- El Site Token es un identificador público del beacon, no un secreto ni una credencial administrativa. No se añadieron API keys, Account IDs, secretos ni variables de Worker.

## Eventos, privacidad y rendimiento

Cloudflare Web Analytics no soporta eventos personalizados en su implementación actual, por lo que no se instrumentaron clics, períodos históricos, CSV, radar, satélite ni pronóstico. `ANALYTICS.md` deja priorizados los eventos para reevaluación futura, sin inventar un tracker propio ni usar D1.

El beacon se omite en `localhost`, `127.0.0.1` y `::1`. No usa cookies ni almacenamiento local desde el código de Meteo Ituzaingó; no se envían datos personales, IP, contenido de CSV, claves ni datos de formularios. `PRIVACY_ANALYTICS.md` documenta el alcance técnico, bloqueadores, Blogger y los requisitos separados que podría introducir AdSense.

La carga se realiza después de los scripts funcionales y de forma asíncrona. Si la solicitud falla o un bloqueador la impide, no afecta al dashboard ni a Históricos y no se muestra ningún error al visitante.

## Pruebas y publicación

- Se validó sintaxis con `node --check` para los dos scripts agregados.
- Se verificó estáticamente que ambas páginas incluyen exactamente una carga del iniciador común, que el token sólo figura en la configuración central y que no se modificaron archivos meteorológicos ni Cloudflare Worker.
- Se validó la exclusión de hosts locales, resolución de `gerchop.github.io` y prevención de duplicados con un DOM simulado.
- Se verificó `git diff --check`.
- GitHub Pages publicado respondió `200` para las dos páginas y ambos scripts de analítica. Cargas únicas con Edge en producción confirmaron que dashboard e Históricos insertan exactamente un `script[data-cf-beacon]`; Históricos conservó gráficos, comparativas, récords y CSV.
- El recurso oficial `https://static.cloudflareinsights.com/beacon.min.js` respondió `200` por HTTPS. El navegador ejecutó el cargador y añadió el beacon; por diseño, esa etiqueta genera el envío de pageview al proveedor.
- El panel autenticado de Cloudflare no es accesible desde este entorno, por lo que la aparición agregada del pageview debe confirmarse en **Cloudflare Dashboard → Web Analytics → Meteo Ituzaingó — GitHub Pages**. Cloudflare advierte que el panel puede demorar en reflejarlo; no se debe interpretar una demora breve como un fallo del beacon.

## Limitaciones y recomendación v1.5

- La métrica es agregada y puede verse reducida por bloqueadores; no se intentará evadirlos.
- No hay recurrencia individual fiable ni eventos personalizados en el proveedor actual.
- Para publicación directa en Blogger u otro host se requiere crear otra propiedad de Web Analytics y añadir su token por host; un iframe que se mantenga en GitHub Pages conserva la propiedad actual.
- Antes de añadir AdSense, GA4 o Google Ads, revisar consentimiento, CMP, privacidad y evitar doble tracking innecesario.

---

# Informe de implementación v1.3.4

## Corrección del parser horario Meteored

La inspección técnica de una única respuesta horaria real confirmó 24 franjas en `data.hours`. Cada objeto contiene el campo temporal `end` como epoch Unix en milisegundos, no como ISO: ejemplo saneado, `{ end: 1787457600000, symbol: …, temperature: … }`. La primera corrección v1.3.3 aplicaba `Date.parse(horaData.end)`; al ser numérico, el resultado era inválido y las 24 franjas quedaban excluidas.

Se agregó `timestampMeteored()`: reconoce explícitamente epoch de milisegundos (13 dígitos), convierte epoch de segundos sólo cuando corresponde y acepta cadenas temporales inequívocas como respaldo. `renderizarHorario()` normaliza, elimina timestamps inválidos, ordena, filtra `timestamp > Date.now()` y finalmente ejecuta `slice(0, 12)`. La comparación usa instantes absolutos; la presentación se mantiene en `America/Argentina/Buenos_Aires` y formato 24 h.

Si la respuesta tuviera horas pero ninguna fecha interpretable, el mensaje ahora indica un problema de interpretación, no una ausencia ficticia de futuro. Se conserva el recálculo local al iniciar la hora y no se modifica `obtenerPronosticoMeteored()`, su cache, expiración, endpoint ni API key.

## Pruebas

- Respuesta real inspeccionada: 24 horas, `end` numérico en milisegundos; no se registraron secretos ni se añadieron sondeos al flujo de la página.
- Casos deterministas para 00:20, 06:30, 12:10, 17:19 y 22:30 verifican normalización, filtro futuro, límite de 12 y cruce de medianoche.
- `node --check`, `git diff --check` y publicación de GitHub Pages verificados.
- Solicitudes Meteored adicionales introducidas por la corrección: 0; la inspección técnica se limitó a las dos lecturas necesarias para identificar la forma real tras un error de formateo local.

---

# Informe de implementación v1.3.3

## Corrección de «Próximas horas»

La implementación anterior renderizaba `data.hours.slice(0, 12)`. Aunque `end` ya era el campo real de fecha/hora de Meteored utilizado para la tarjeta, ese recorte fijo podía mostrar horas pasadas al avanzar el día.

`renderizarHorario()` ahora convierte cada `end` con `Date.parse`, descarta timestamps no válidos o anteriores al instante actual, ordena las franjas futuras y recién entonces conserva hasta doce. `fechaMeteored()` mantiene la presentación explícita en `America/Argentina/Buenos_Aires` y formato de 24 horas. Al ser timestamps absolutos, la comparación no depende de la zona del navegador y atraviesa medianoche sin offset manual.

La respuesta horaria recibida se conserva sólo en memoria. Un temporizador local vuelve a renderizar al inicio de cada hora con esa misma respuesta; no consulta Meteored, no altera su caché, expiración, endpoint, clave ni consumo de API. El pronóstico extendido no se modificó.

## Pruebas

- Sintaxis de `dashboard.js` y `git diff --check`, sin errores.
- Se verificó que el filtrado se realiza antes de `slice(0, 12)` y que no quedan selecciones de horas por índice fijo.
- Escenarios de tarde, medianoche, madrugada y mediodía se cubren por comparación de timestamps futuros; si hay menos de 12, se muestran sólo los disponibles.
- El cambio no crea solicitudes Meteored nuevas: sólo usa la respuesta ya cacheada por `obtenerPronosticoMeteored()`.

---

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

# Implementación v1.12 — Avisos Meteo Ituzaingó

## Hardening de observación actual

Se eliminó la consulta directa a Weather.com desde `dashboard.js`, incluyendo la credencial que estaba expuesta previamente en el recurso público. Home utiliza `GET /api/current`, una lectura de la última observación persistida en D1. La credencial no se rotó ni se trasladó: continúa únicamente como `WEATHER_API_KEY` en Cloudflare Worker.

El endpoint conserva el campo `data` para compatibilidad e incorpora `source: "d1"`, `sourceStatus` (`available`, `stale`, `unavailable`) y `observation`. Una observación de más de 20 minutos se identifica como `stale`, sin inventar valores. El refresco de frontend es cada cinco minutos, por lo que no genera requests Weather.com por visitante.

## Alcance

Se implementó localmente un aviso automático y no oficial de bajas temperaturas. La evaluación es determinística, no conserva estado y no sustituye las Alertas Oficiales SMN.

## Arquitectura

`GET /api/advisories` consulta directamente en D1 la fila vigente `hourly` de `social_forecast_cache`, el estado `ema_health_state` y, sólo para contexto, las dos últimas filas de `weather_observations`. No importa ni invoca el refresco Meteored, Weather.com, la captura, los cron ni el monitor EMA.

El pronóstico requiere al menos 18 horas locales futuras válidas del primer día elegible en `America/Argentina/Buenos_Aires`. La respuesta se cachea durante cinco minutos y distingue forecast `available`, `insufficient` o `unavailable`.

## Reglas

- `information`: mínima prevista ≤4 °C.
- `attention`: mínima prevista ≤2 °C, o sensación prevista ≤0 °C durante dos horas consecutivas y con temperatura ≤10 °C.
- La observación sólo agrega `basis` confirmatorio con EMA `FRESH` + `OK`, dos lecturas ≤20 minutos de antigüedad, separación ≤15 minutos y umbral cumplido en ambas.

No hay avisos observacionales aislados, hysteresis, tablas nuevas, migraciones ni costos de API adicionales. Condición sostenida y los demás fenómenos permanecen fuera de v1.12.
# Informe de implementación v1.13.3

## Consolidación de alertas CAP SMN

La auditoría read-only de D1 reprodujo nueve versiones activas para Tormentas y Viento. Los CAP oficiales verificaron que `<references>` tiene el formato `sender,identifier,sent`; por ejemplo, la emisión de Tormentas `...08.51.56.28` referencia `...21.54.01`. El identificador del CAP aplicable contiene un componente geográfico final (`.<n>`), por lo cual la comparación exacta previa no encontraba a la versión antecedente. Parsing y persistencia ya conservaban la referencia correcta: el defecto estaba exclusivamente en el matching de la consulta pública.

La proyección D1 conserva sólo alertas `success`, aplicables, no vencidas y no `Cancel`, y ahora considera superseded una versión cuyo identificador coincide exactamente con una referencia posterior o es una variante delimitada por punto de esa referencia. También normaliza la comparación temporal SQL de `expires_at`, ya que CAP usa offsets `-03:00` y el reloj del Worker usa UTC. La simulación sobre D1 reduce el conjunto actual de nueve a tres CAP vigentes: dos períodos geográficos/temporales distintos de la emisión más reciente de Tormentas y una emisión de Viento. No se elimina ni actualiza historia. Las pruebas cubren Alert, Update, Cancel, procesamiento fuera de orden, referencias múltiples y CAP independientes con mismos campos meteorológicos.

## Nivel oficial SAT

No implementado deliberadamente. Los CAP de Tormentas y Viento auditados contienen `severity=Moderate`, `urgency=Future` y `certainty=Likely`, sin parámetro ni código explícito que declare AMARILLO, NARANJA o ROJO. Como no se realizó scraping SAT ni existe evidencia oficial que confirme la equivalencia, el nivel queda clasificado como **UNCONFIRMED**. La API conserva compatibilidad y Home sigue mostrando «ALERTA OFICIAL DEL SMN» sin color inventado. Avisos locales no fueron modificados.

## Horario de fin de día

La caché real hourly auditada tenía 24 slots desde 20/09 01:00 hasta 21/09 00:00 ART. Con la regla anterior de cuatro mínimos, a las 21:00, 22:00, 23:00 y 23:30 ART los 3, 2, 1 y 1 slots restantes eran clasificados incorrectamente como `EXHAUSTED`; a las 20:00 había cuatro. Home acepta ahora `>=1` slot futuro real y conserva `FRESH`/`STALE_USABLE` según los mismos doce horas de antigüedad; sólo cero slots queda `EXHAUSTED`. No se fabrican horas ni se modifica Social, Avisos, scheduler o el consumo Meteored: las pruebas ejecutaron 0 requests reales a Meteored.

## Infraestructura y validación local

No hay migración ni cambios de cron. Se preservan batch CAP 8, concurrencia 3, timeout 8 s, `/api/alerts` D1-only y `Cache-Control: public, max-age=300`. PWS, EMA, Resend, el scheduler/cuota Meteored, Social y Avisos permanecen sin cambios. `npm.cmd test`, `node --check` de los módulos modificados y `git diff --check` finalizaron correctamente antes del deploy.

# Informe de implementación v1.13.4

## Severidad CAP oficial

La normalización de cada `<info>` aplicable conserva ahora `severity`, `urgency` y `certainty` tal como llegan en el XML CAP oficial y los persiste dentro de `public_payload_json`. No fue necesaria una migración: la proyección de `/api/alerts` continúa leyendo D1 solamente. Los CAP procesados antes de esta versión no se reconsultan ni reciben backfill; simplemente no muestran severidad hasta que un CAP nuevo o Update la provea.

Home presenta «Severidad CAP: Extrema/Severa/Moderada/Menor/No determinada» sólo para el catálogo CAP reconocido. La línea usa estilo textual neutral y una ayuda accesible que declara expresamente que no equivale a nivel amarillo, naranja o rojo del SAT. Valores ausentes, inválidos o no reconocidos no rompen ni agregan contenido. `urgency` y `certainty` se exponen para consumo futuro, pero no se muestran aún.

La consolidación identifier/references, variantes zonales, vencimientos ART/UTC, Update, Cancel y procesamiento fuera de orden permanecen intactos; por ello la severidad visual pertenece exclusivamente al payload de la versión vigente. No hay cambios de ingesta (batch 8, concurrencia 3, timeout 8 s), crons, solicitudes públicas SMN, Meteored, Social, Avisos, PWS, EMA ni Resend.
