# Meteo Ituzaingó v1.11 — Auditoría del monitor de salud de la EMA

**Fase:** 0 — auditoría y diseño solamente
**Fecha:** 2026-09-11
**Decisión:** **GO CONDICIONADO**

Es técnicamente viable detectar una EMA sin datos reutilizando el cron de captura ya existente y sin sumar consultas a Weather.com. La implementación queda condicionada a elegir y configurar, en una fase posterior, un canal de correo que pueda entregar a la dirección privada del administrador sin suponer que existe un dominio propio. Esta fase no modificó producción, Worker, D1, crons, secrets, frontend ni datos históricos.

## 1. Hechos comprobados

### 1.1 Flujo actual de captura

El flujo productivo actual es:

```text
Cron */10 * * * *
  → scheduled(event, env, ctx)                  cloudflare/src/index.js
  → captureWeatherObservation(env)              cloudflare/src/index.js
  → fetchWeatherObservation(env)                cloudflare/src/weather.js
  → GET https://api.weather.com/v2/pws/observations/current
       stationId=IITUZAIN9, format=json, units=m,
       numericPrecision=decimal, apiKey=<secret>
  → normalizeWeatherObservation(payload)        cloudflare/src/weather.js
  → insertObservation(HISTORY_DB, observation)  cloudflare/src/database.js
  → weather_observations                        Cloudflare D1
```

`scheduled()` declara rutas explícitas: `CAPTURE_CRON = "*/10 * * * *"` llama a captura y `SOCIAL_CRON = "1 3 * * *"` al pronóstico social. Cada rama se ejecuta mediante `ctx.waitUntil`; los errores llegan al `catch` de esa rama y se registran como `Error de captura programada: ...` o `Error de pronóstico social: ...`. No hay estado de salud, alerta ni reintento específico.

El endpoint Weather.com real configurado es `https://api.weather.com/v2/pws/observations/current`; el secreto se agrega como `apiKey` dentro de `URLSearchParams`, por lo que no se registra en los mensajes de log actuales. `fetchWeatherObservation()` rechaza HTTP no exitoso con el estado (`Weather.com respondió <status>`). Si faltan observación, métrica, temperatura o timestamp válidos, `normalizeWeatherObservation()` arroja un error explícito.

La inserción usa `INSERT OR IGNORE`. `weather_observations.observed_at` es `TEXT NOT NULL UNIQUE`; `idx_weather_observations_observed_at` existe sobre esa columna. Por lo tanto, una observación repetida no crea una fila nueva y `captureWeatherObservation()` registra `Duplicado ignorado: <timestamp>`. Una nueva registra `Captura almacenada: <timestamp>`. Un error D1 se propaga al `catch` del cron; hoy no se clasifica ni persiste.

### 1.2 Timestamp autoritativo

El timestamp de medición usado por el proyecto es, en orden:

1. `observations[0].obsTimeUtc` de Weather.com.
2. Sólo si no existe, `observations[0].obsTimeLocal`.

`normalizeWeatherObservation()` aplica `Date.parse()` y almacena `new Date(timestamp).toISOString()` en `observation.observedAt`; `insertObservation()` lo guarda sin reemplazarlo en `weather_observations.observed_at`. `created_at` se genera aparte con `new Date().toISOString()` justo antes del `INSERT`.

**Conclusión:** `observed_at` representa el instante informado por la EMA/Weather.com, en UTC ISO 8601; no representa el instante de ejecución del Worker. `created_at` sí aproxima el momento de captura del Worker. La presentación y los límites de días siguen usando `America/Argentina/Buenos_Aires` (ART, UTC−03:00 en el período auditado). El monitor futuro debe usar tiempo absoluto UTC para comparar edad y convertir a ART sólo para mensajes.

**Riesgo existente a conservar bajo observación:** el fallback `obsTimeLocal` depende de que Weather.com incluya una zona u offset parseable. Para salud, Fase 1 deberá conservar el valor original y rechazar timestamps ausentes, inválidos o materialmente futuros; no deberá considerar saludable a una EMA por el reloj del Worker.

### 1.3 Incidente del 10/09 al 11/09

Se ejecutó exclusivamente este `SELECT` remoto sobre D1 (sin `INSERT`, `UPDATE`, `DELETE` ni `REPLACE`):

```sql
SELECT observed_at, created_at, temperature, humidity
FROM weather_observations
WHERE observed_at >= '2026-09-10T18:30:00.000Z'
  AND observed_at <  '2026-09-11T13:30:00.000Z'
ORDER BY observed_at ASC;
```

Cloudflare informó `rows_written: 0` y `changed_db: false`.

| Hito | UTC | ART | Evidencia |
| --- | --- | --- | --- |
| Última observación nueva antes del hueco | `2026-09-10T19:30:59.000Z` | 10/09 16:30:59 | fila con temperatura 21,0 °C, humedad 53 % |
| Momento de su captura en D1 | `2026-09-10T19:40:13.005Z` | 10/09 16:40:13 | `created_at` de esa fila |
| Primera observación nueva tras recuperación | `2026-09-11T12:40:02.000Z` | 11/09 09:40:02 | fila con temperatura 14,0 °C, humedad 83 % |
| Duración entre mediciones | `17 h 09 min 03 s` | igual duración absoluta | diferencia entre ambos `observed_at` |

Con una cadencia nominal de diez minutos, faltan aproximadamente **102–103 mediciones** entre ambos extremos (la cifra exacta no puede imponerse porque la EMA no mide en segundos fijos ni el cron garantiza ejecución puntual). La evidencia coincide con el incidente comunicado: transmisión detenida aproximadamente desde 16:30 ART y reanudada antes de las 09:40 ART. El hueco es irrecuperable y no se intentó reconstruirlo.

### 1.4 Qué ocurrió durante el congelamiento

Hay evidencia directa de que al menos la ejecución alrededor de las 16:40 ART obtuvo una observación que ya tenía como tiempo de medición las 16:30:59 ART: la fila de ese `observed_at` tiene `created_at` 16:40:13 ART. Esto es consistente con Weather.com respondiendo correctamente con el último dato de la EMA, no con una medición nueva.

No hay un almacén histórico de logs de cada ejecución dentro del repositorio ni en D1. Las repeticiones posteriores se descartan por `INSERT OR IGNORE`, por lo que no quedan filas que permitan demostrar el comportamiento de **todo** el intervalo de 17 horas. La conclusión precisa es:

> **A probado para al menos una ejecución inmediatamente posterior al congelamiento; continuidad durante todo el hueco: NO DETERMINABLE CON LA EVIDENCIA DISPONIBLE.**

No existe evidencia que permita afirmar B (sin observaciones), C (error Weather.com) o un fallo total del cron durante todo el período.

## 2. Inferencias y diseño recomendado

### 2.1 Detector de datos stale

El estado de la EMA debe depender de que avance el timestamp autoritativo, no de que `fetch()` reciba HTTP 200 ni de que el Worker haya sido invocado.

```text
latestObservedAt = MAX(weather_observations.observed_at)
ageMs = nowUtc - Date.parse(latestObservedAt)

si el chequeo técnico es válido y ageMs >= 30 min → EMA_STALE
si llega/ya existe una observación con timestamp más nuevo → EMA_OK
```

Además de observar el resultado de la consulta actual, Fase 1 debe comparar su `observedAt` contra el máximo persistido. Esto detecta de inmediato HTTP 200 con observación repetida. Tras un reinicio, deploy o una ejecución concurrente, `MAX(observed_at)` o el estado persistido permiten recomponer el diagnóstico sin depender de memoria del Worker.

**Umbral recomendado: 30 minutos.** La EMA y el cron trabajan alrededor de diez minutos; 20 minutos podría alertar por una ejecución perdida o retraso transitorio. Treinta minutos exige aproximadamente tres intervalos sin timestamp nuevo y reduce falsos positivos. Por la granularidad del cron, una caída se anunciaría normalmente entre 30 y casi 40 minutos después de la última medición, suficiente frente al incidente de 17 horas. No se recomienda 40 minutos: retrasa la detección sin aportar una tolerancia necesaria demostrada.

Un timestamp futuro por encima de una pequeña tolerancia operativa (por ejemplo, cinco minutos) o malformado debe producir `UNKNOWN`, nunca `OK`.

### 2.2 Máquina de estados mínima y segura

| Estado | Significado | Entrada principal | Transición |
| --- | --- | --- | --- |
| `OK` | Se conoce una observación reciente, con timestamp válido y no futuro. | `age < 30 min` | a `STALE` cuando vence el umbral; a `UNKNOWN` si no puede verificarse. |
| `STALE` | El monitor funciona y el último `observed_at` válido tiene 30 min o más. | `age >= 30 min` | a `OK` sólo con timestamp nuevo; a `UNKNOWN` ante imposibilidad técnica de comprobar. |
| `UNKNOWN` | No puede establecerse el estado de la EMA. | Error Weather.com, autenticación, D1, payload/timestamp inválido. | a `OK`/`STALE` tras un ciclo verificable. |

`UNKNOWN` no equivale a “EMA caída” y debe tener un asunto/registro técnico distinto si se decide notificarlo. Un HTTP 401/403, 5xx o fallo de red puede clasificarse desde el error de `fetchWeatherObservation()`; un fallo de D1 se clasifica al consultar o guardar el estado; un error no capturado del Worker se ve en logs, pero no puede ser autoclasificado por una ejecución inexistente.

### 2.3 Anti-spam e idempotencia

Política propuesta para `STALE`:

1. `OK → STALE`: una alerta.
2. `STALE` continuo durante tres horas desde `stale_since`: un único recordatorio.
3. `STALE → OK` con un `observed_at` estrictamente más nuevo: una recuperación.

Nunca se manda correo por cada cron. `UNKNOWN` se registra; una futura política puede alertar por `UNKNOWN` sostenido, pero no debe reutilizar el mensaje “EMA sin transmitir”.

Para sobrevivir reinicios, deploys y concurrencia, la recomendación es una transacción/operación condicional D1 que reserve un evento con una clave única determinística, por ejemplo `stale:<stale_since>`, `reminder:<stale_since>` o `recovery:<stale_since>:<observed_at>`. El envío se hace sólo para el evento reservado. Resend también admite `Idempotency-Key` durante 24 horas, como capa adicional, pero D1 debe ser la fuente de verdad de largo plazo.

No existe garantía distribuida perfecta entre una API de correo y D1: si el correo se acepta pero falla la confirmación D1, un reintento podría duplicarlo; si se confirma antes de enviar, podría perderse. Un outbox con `pending/sending/sent/failed`, identificador remoto y reintento acotado hace explícita esa compensación y es preferible a afirmar una garantía inexistente. Para este volumen, priorizar **al menos una notificación y deduplicación práctica** es razonable.

### 2.4 Persistencia mínima

No se debe agregar columnas a `weather_observations`: esa tabla representa mediciones históricas, no salud operativa.

Se recomienda en Fase 1:

- `ema_health_state`: una fila (`id = 1`) con estado actual, último timestamp válido, `stale_since`, último chequeo técnico, versión/actualización y referencias a eventos.
- `ema_health_notifications`: outbox/auditoría pequeño con `event_key UNIQUE`, tipo, estado de envío, intentos, id remoto y marcas temporales.

Una sola tabla de estado puede funcionar para el mínimo absoluto, pero no resuelve con claridad el fallo parcial correo/D1 ni conserva auditoría. Dos tablas muy pequeñas son la opción más limpia. El estado ocupa una fila; incluso varios miles de notificaciones por año representarían pocos MB, despreciable frente al límite D1 Free de 500 MB por base de datos. Con la política prevista el volumen real debe ser muy inferior.

### 2.5 Casos de prueba futuros

Los tests unitarios determinísticos deben inyectar `now` y una interfaz de repositorio/correo; no deben esperar 30 minutos reales. Casos mínimos:

1. 5 min → `OK`.
2. 20 min → `OK` con umbral 30.
3. Exactamente 30 min → `STALE`.
4. 31 min → `STALE`.
5. HTTP 200 con timestamp repetido → `STALE` al corresponder.
6. Timestamp nuevo → `OK`.
7. `OK → STALE` reserva una alerta.
8. Siguiente cron stale no la duplica.
9. Tres horas stale reserva un solo recordatorio.
10. Siguiente cron posterior no duplica el recordatorio.
11. `STALE → OK` reserva recuperación.
12. Recuperación posterior no duplica correo.
13. Error Weather.com/red → `UNKNOWN`.
14. Error D1 → error técnico/`UNKNOWN` si el estado puede persistirse.
15. Timestamp futuro → no `OK`.
16. Timestamp malformado → no `OK`.
17. Reinicio/deploy en stale → sin alerta duplicada.
18. Dos ejecuciones concurrentes → una sola reserva por `event_key`.
19. Cruce de medianoche ART.
20. Cambio de día, mes y año con UTC como base de cálculo.

### 2.6 Contenido de correo propuesto

Texto plano es suficiente, más robusto y apropiado para alertas operativas.

**Alerta** — asunto: `Meteo Ituzaingó — EMA sin transmitir`

```text
Meteo Ituzaingó detectó que no recibe observaciones nuevas de la EMA.

Última observación válida: DD/MM/AAAA HH:mm ART
Tiempo sin datos: X h Y min

Revisar consola EMA, conectividad y transmisión hacia Weather.com.
```

**Recordatorio** — asunto: `Meteo Ituzaingó — EMA continúa sin transmitir`; indica la duración actual y el mismo último dato.

**Recuperación** — asunto: `Meteo Ituzaingó — EMA recuperada`; incluye hora ART de la nueva observación y duración aproximada desde `stale_since` o desde el último dato válido. No debe afirmar que la consola fue reparada: sólo que volvió a recibirse una observación nueva.

El destinatario debe existir sólo como configuración server-side, nunca en Git, HTML, logs o documentación. Nombre futuro recomendado: `EMA_ALERT_RECIPIENT`.

## 3. Auditoría de correo gratuita (consultada el 11/09/2026)

### Resend

- Plan Free actual: USD 0, 3.000 correos/mes y 100/día ([precios oficiales](https://resend.com/pricing)). La documentación de precios no anuncia sobreuso en Free; debe revisarse de nuevo antes de configurar, porque precios y condiciones pueden cambiar.
- API HTTPS simple y compatible con `fetch` de Workers; soporta `Idempotency-Key` durante 24 h ([API oficial](https://resend.com/docs/api-reference/emails/send-email)).
- Una cuenta Free tiene acceso de producción, pero el dominio predeterminado `resend.dev` sólo permite enviar al email asociado a esa cuenta; para otros destinatarios exige verificar un dominio ([restricción oficial](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain)).
- No exige dominio propio **si el único destinatario es el email del propietario de la cuenta Resend**, escenario compatible con una alerta privada de administrador. No ofrece un remitente Meteo Ituzaingó verificable en ese caso.
- La documentación consultada no afirma que el plan Free requiera tarjeta; debe confirmarse durante el alta, sin asumirlo ni crear cuenta en esta fase.

### Cloudflare Email Service nativo

- Email Routing está en Free y los envíos a direcciones de destino verificadas son gratuitos; Email Sending a destinatarios arbitrarios requiere Workers Paid ([precios oficiales](https://developers.cloudflare.com/email-service/platform/pricing/)).
- Un binding `send_email` permite que un Worker envíe al destinatario verificado, pero la dirección remitente debe pertenecer a un dominio incorporado a Email Service ([configuración oficial](https://developers.cloudflare.com/email-service/configuration/send-bindings/)).
- El onboarding requiere dominio bajo Cloudflare DNS ([guía oficial](https://developers.cloudflare.com/email-service/get-started/send-emails/)). GitHub Pages y Blogger no proporcionan por sí mismos un dominio propio controlado.
- **No es seleccionable hoy sin confirmar que existe un dominio propio en Cloudflare.** Si en el futuro existiera, sería la mejor alternativa por integración nativa y destino único verificado.

### Brevo (alternativa evaluada, no recomendada para este caso sin dominio)

- Free actual: 300 envíos/día e incluye transaccionales ([precios oficiales](https://help.brevo.com/hc/en-us/articles/8292912279954-Add-or-remove-emails-from-your-plan)). API HTTPS apta para Workers y soporte de idempotencia documentado.
- Puede verificarse una dirección de remitente, pero la autenticación de un dominio propio es necesaria para entregabilidad sostenible; los dominios de correo gratuito no pueden autenticarse y Brevo puede sustituir el remitente ([documentación oficial](https://help.brevo.com/hc/en-us/articles/17286219877778-FAQs-About-domain-authentication-Brevo-code-DKIM-DMARC)).
- Requiere cuenta y API key; la documentación revisada no establece aquí si el alta Free exige tarjeta, por lo que no se debe asumir.

### Recomendación operativa

1. **Sin dominio propio confirmado:** Resend Free, sólo para el email propietario/verificado de la cuenta Resend, con `RESEND_API_KEY` y `EMA_ALERT_RECIPIENT` como secrets futuros. Es viable para un único administrador y USD 0, con limitación explícita de remitente/destino.
2. **Si se confirma un dominio en Cloudflare DNS:** reevaluar Cloudflare Email Service antes de crear una cuenta Resend; permite destino verificado gratis pero exige el dominio remitente incorporado.
3. No elegir Brevo para Fase 1 mientras no exista dominio autenticable.

Secrets futuros propuestos —sólo nombres, no creados—: `RESEND_API_KEY`, `EMA_ALERT_RECIPIENT`. Si se eligiera Cloudflare Email Service, el destinatario puede restringirse en el binding y no necesita estar en el código; no se propone secret de API externo.

## 4. Limitaciones fundamentales y coste estimado

| Falla | Qué puede detectar el monitor dentro del Worker | Límite |
| --- | --- | --- |
| EMA congelada; Worker/API/D1 operativos | `STALE` por edad de `observed_at`; alerta y recuperación. | Es el caso objetivo. |
| Weather.com/API o autenticación fallan | `UNKNOWN` y log/evento técnico. | No puede asegurar que la EMA esté caída. |
| D1 falla | Error técnico/`UNKNOWN` si es posible; log. | No puede persistir ni deduplicar estado de forma confiable. |
| Worker o Cron no ejecuta | Nada desde el mismo Worker. | No habrá detección ni correo: el monitor no puede vigilarse a sí mismo. |

Un heartbeat externo gratuito podría vigilar una ruta dedicada o una marca de última ejecución y distinguir el último caso, pero es un alcance separado para v1.11.x/v1.12. No es imprescindible para detectar la EMA congelada con Worker activo y no se agrega ahora.

Reutilizando el cron actual hay **0 invocaciones cron adicionales** y **0 requests Weather.com/Meteored adicionales**. Fase 1 agregaría por ejecución como máximo una lectura de estado/indexada y una escritura pequeña cuando corresponda: aproximadamente 144 ciclos/día, muy por debajo de Workers Free (100.000 requests/día) y D1 Free (5 millones de filas leídas y 100.000 escritas/día, según [precios de Workers](https://developers.cloudflare.com/workers/platform/pricing/)). La lógica y los textos son pequeños; debe medirse el CPU real porque Workers Free tiene 10 ms de CPU por invocación ([límites oficiales](https://developers.cloudflare.com/workers/platform/limits/)). Los correos sólo salen en transiciones/recordatorio, no por cron.

## 5. Panel y plan posterior

Un bloque estrictamente de lectura «Salud EMA» en `/admin/redes` es razonable en una fase futura: `ONLINE` + antigüedad o `SIN DATOS` + último timestamp ART/duración. Debe presentarse como estado operativo, separado del editor de pronóstico, y no agregarse a Home pública hasta validar su semántica.

### Fase 1 propuesta (no ejecutada)

1. Confirmar proveedor de correo y condición de dominio/destinatario; crear secrets/configuración sólo tras aprobación.
2. Crear migración para estado y outbox, sin tocar `weather_observations`.
3. Implementar módulo puro `ema-health` con reloj inyectable, clasificación `OK`/`STALE`/`UNKNOWN`, validación de timestamp y formateo ART.
4. Integrarlo dentro de la captura actual, reutilizando su único fetch Weather.com y el cron existente.
5. Implementar reserva idempotente de eventos y entrega/reintento acotado de correo texto plano.
6. Agregar tests determinísticos de los 20 casos y simulación local segura.
7. Documentar, desplegar de forma controlada y validar transición/sin spam antes de exponer un estado privado en panel.

Archivos candidatos para esa fase: `cloudflare/src/index.js`, `cloudflare/src/database.js`, nuevo `cloudflare/src/ema-health.js`, nueva migración bajo `cloudflare/migrations/`, nuevo test bajo `cloudflare/test/`, `cloudflare/wrangler.jsonc` sólo si el proveedor elegido necesita binding, y documentación/CHANGELOG/informe. No hay motivo para modificar Home, Históricos, alertas SMN, social v1.10 ni crear otro Worker en la primera implementación.

## 6. Pendientes antes de aprobar Fase 1

- Confirmar si el administrador acepta crear una cuenta Resend y que el destinatario sea el email propietario de esa cuenta, **o** confirmar la existencia de un dominio propio en Cloudflare DNS para Email Service.
- Confirmar el canal y los nombres finales de secrets, sin proporcionar valores todavía.
- Definir si `UNKNOWN` sostenido merece un correo técnico separado o sólo observabilidad/log inicial.
- Mantener un mecanismo externo de heartbeat como mejora futura, no como sustituto de la detección stale interna.

---

## 7. Fase 0.1 — Cierre arquitectónico previo a implementación

**Decisión de arquitectura:** se separan **frescura de datos** y **salud de captura**. Esta separación es necesaria y no añade complejidad innecesaria: responde a preguntas distintas y evita perder una verdad ya persistida cuando la consulta actual falla.

### 7.1 Modelo final de estados

```text
dataFreshness: FRESH | STALE | UNKNOWN
captureHealth: OK | ERROR | UNKNOWN
```

`dataFreshness` responde «¿la última observación guardada en D1 sigue siendo reciente?». `captureHealth` responde «¿la última ejecución de captura pudo consultar, validar e interactuar con D1?». No describen la causa física del problema de la EMA.

Ejemplo decisivo: con `MAX(observed_at)` de hace dos horas y un HTTP 500 actual, el resultado correcto es `dataFreshness=STALE` y `captureHealth=ERROR`, no un `UNKNOWN` que oculte el hueco objetivo. Si D1 no se puede leer o no hay un timestamp válido, entonces `dataFreshness=UNKNOWN`; si el cron no llegó a ejecutar, `captureHealth=UNKNOWN` para cualquier presentación basada en el último estado conocido, pero el propio Worker no puede emitir esa conclusión por sí mismo.

### 7.2 Regla exacta de frescura y recuperación

La fuente de verdad de frescura es exclusivamente:

```text
latestObservedAt = MAX(weather_observations.observed_at)
age = nowUtc - latestObservedAt

timestamp ausente, inválido o D1 ilegible → dataFreshness = UNKNOWN
timestamp futuro más allá de tolerancia operativa → dataFreshness = UNKNOWN
age < 30 min → dataFreshness = FRESH
age >= 30 min → dataFreshness = STALE
```

El umbral definitivo para Fase 1 es **30 minutos**. Con un cron cada diez minutos ofrece aproximadamente tres oportunidades antes de alertar, sin confundir éxito HTTP con información nueva. Weather.com HTTP, error de autenticación, error de parseo y error D1 actualizan únicamente `captureHealth` y el diagnóstico técnico; no alteran directamente el hecho histórico calculado con D1.

`stale_since` se define de forma determinística como `latestObservedAt + 30 minutos`, es decir, el primer instante absoluto en que esa observación dejó de ser fresca. `stale_detected_at` registra aparte el primer cron que pudo comprobarlo. Esta distinción evita que el identificador del incidente cambie por un deploy o por un cron tardío.

La recuperación exige simultáneamente:

1. una observación con timestamp autoritativo estrictamente posterior al `last_observation_at` que originó el incidente; y
2. que esa nueva observación sea `FRESH` al evaluarla (`nowUtc - observedAt < 30 min`).

HTTP 200, un cron exitoso o un timestamp nuevo pero con 30 minutos o más de antigüedad **no** recuperan el incidente. En este último caso se actualiza el máximo conocido y el estado continúa `STALE`.

### 7.3 Caso real simulado con regla exacta

| Momento ART | Hecho / cálculo | Resultado propuesto |
| --- | --- | --- |
| 10/09 16:30:59 | última observación nueva | aún `FRESH` |
| 16:40 aprox. | Weather.com devuelve el mismo `observed_at` | captura puede ser `OK`; frescura sigue `FRESH` |
| 16:50 aprox. | sin timestamp nuevo | `FRESH` (edad ~19 min) |
| 17:00 aprox. | sin timestamp nuevo | `FRESH` (edad ~29 min); el umbral exacto vence 17:00:59 |
| 17:10 aprox. | primer cron posterior al umbral | `STALE`; crea evento inicial |
| 20:10 aprox. | primer cron posterior a `stale_since + 3 h` (20:00:59) | un único recordatorio, si continúa stale |
| 11/09 09:40:02 | llega observación nueva; capturada alrededor de 09:40:32 | `FRESH` y evento de recuperación |

La hora 17:10 es la detección realista con cron de diez minutos: a las 17:00 la edad exacta de `16:30:59` aún era 29 min 01 s. Estos horarios son inferencia del cron; la evidencia D1 sólo prueba el primer dato nuevo y el hueco documentado antes.

### 7.4 Persistencia y outbox SQL propuestos

No se ejecutan en esta fase. El esquema propuesto mantiene estado operativo fuera del histórico:

```sql
CREATE TABLE ema_health_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data_freshness TEXT NOT NULL CHECK (data_freshness IN ('FRESH', 'STALE', 'UNKNOWN')),
  capture_health TEXT NOT NULL CHECK (capture_health IN ('OK', 'ERROR', 'UNKNOWN')),
  last_observation_at TEXT,
  stale_since TEXT,
  stale_detected_at TEXT,
  active_incident_id TEXT,
  last_capture_at TEXT,
  last_capture_error_code TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE ema_health_outbox (
  event_key TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('STALE', 'REMINDER', 'RECOVERY')),
  delivery_status TEXT NOT NULL CHECK (delivery_status IN ('PENDING', 'SENDING', 'SENT', 'FAILED', 'CANCELLED')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  provider_message_id TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_ema_health_outbox_pending
  ON ema_health_outbox(delivery_status, next_attempt_at);
```

El destinatario, API key, asunto y cuerpo no se guardan en D1. El incidente usa el identificador estable `incident_id = stale_since` en UTC. Las claves únicas son `stale:<incident_id>`, `reminder:<incident_id>` y `recovery:<incident_id>:<fresh_observed_at>`; por ello un reinicio, deploy o ejecución duplicada no puede crear otra notificación del mismo tipo para el mismo episodio.

Orden propuesto: calcular frescura → en una operación atómica/batch D1 actualizar estado e `INSERT OR IGNORE` del evento → enviar sólo eventos `PENDING` reservados → marcar `SENT` con identificador del proveedor. Si el envío falla, el evento queda pendiente; no se marca enviado antes del intento. Fase 1 debe confirmar la semántica transaccional de `D1Database.batch()` y conservar la unicidad de `event_key` como última barrera de deduplicación.

Si una recuperación ocurre antes de que la alerta inicial pendiente se haya enviado, se cancelan los eventos stale/reminder no enviados para no mandar tardíamente una alerta que ya no describe la realidad. Se crea recuperación sólo si la alerta inicial llegó a `SENT`; así no se envía una recuperación sin alerta previa. La incidencia y el intento fallido siguen auditables en D1.

### 7.5 Retry y desacople de correo

La interfaz futura será un adaptador independiente, por ejemplo `sendEmaHealthEmail(event, context)`. El detector no conoce Resend ni su API; un proveedor futuro puede reemplazarlo sin cambiar la máquina de estados.

Para una incidencia activa, el outbox intenta envío inmediato y, ante error, programa 10 min, 30 min, 1 h, 3 h y luego cada 6 h como máximo. Al pasar a `SENT` no vuelve a llamar al proveedor. La progresión evita una llamada cada diez minutos indefinidamente y es suficiente para el volumen operativo. Un error de Resend no transforma por sí mismo `dataFreshness`; actualiza el evento/outbox y el log técnico.

Fase 1 puede usar `Idempotency-Key` de Resend como segunda capa durante su ventana de 24 horas, pero la deduplicación de largo plazo depende de D1. No hay garantía distribuida de exactamente una entrega entre D1 y un proveedor externo; el diseño persigue no perder eventos y evitar duplicados prácticos.

### 7.6 Textos definitivos de correo

Los mensajes se enviarán en texto plano y no afirman una causa desconocida.

**Alerta** — asunto: `Meteo Ituzaingó — Sin nuevas observaciones`

```text
Meteo Ituzaingó detectó que no se reciben nuevas observaciones de la estación.

Última observación válida: DD/MM/AAAA HH:mm ART
Tiempo sin datos: X h Y min

Revisar consola EMA, conexión y transmisión hacia Weather.com.
```

**Recordatorio** — asunto: `Meteo Ituzaingó — Continúa sin recibir datos`

```text
Meteo Ituzaingó continúa sin recibir nuevas observaciones de la estación.

Última observación válida: DD/MM/AAAA HH:mm ART
Tiempo sin datos: X h Y min

Revisar consola EMA, conexión y transmisión hacia Weather.com.
```

**Recuperación** — asunto: `Meteo Ituzaingó — Observaciones recuperadas`

```text
Meteo Ituzaingó volvió a recibir observaciones frescas de la estación.

Nueva observación: DD/MM/AAAA HH:mm ART
Duración aproximada del episodio: X h Y min
```

### 7.7 Alcance definitivo de Fase 1

Resend Free se mantiene como opción condicional sin dominio propio: sólo se usará si el destinatario es el email propietario/verificado permitido por la cuenta. La implementación utiliza únicamente los nombres de secret `RESEND_API_KEY` y `EMA_ALERT_RECIPIENT`; no se crean ni se piden valores en esta fase. El panel privado queda fuera de Fase 1: detección, outbox y correo tienen prioridad. Un estado de lectura en `/admin/redes` se evalúa recién en v1.11.1 tras validar el monitor real.

No se incorpora monitor externo en Fase 1. Si Worker/Cron deja de ejecutar, el monitor interno no puede avisar; un heartbeat externo gratuito permanece como trabajo potencial de v1.12. El coste esperado conserva cero crons y cero requests Weather.com/Meteored adicionales; añade estado/outbox D1 y como máximo correos por transición, recordatorio y recuperación.

**Decisión final tras Fase 0.1: GO CONDICIONADO.** La condición pendiente es elegir/configurar el canal de correo sin dominio propio y sin coste; la arquitectura de detección, persistencia e idempotencia está cerrada para implementar después de esa aprobación.

---

## 8. Fase 1 — Implementación local sin deploy

Se implementó localmente `cloudflare/src/ema-health.js`, sin requests de email reales. El cron de observaciones conserva su única consulta Weather.com y, tras la captura, invoca el monitor con `captureHealth` separado de `dataFreshness`. La migración propuesta quedó como `cloudflare/migrations/0004_create_ema_health_monitor.sql`; no se aplicó a D1 local ni remoto en esta fase para evitar crear estado fuera de una validación controlada.

La lógica usa UTC para comparación y `America/Argentina/Buenos_Aires` sólo al renderizar los textos planos. `stale_since` es el timestamp autoritativo más 30 minutos; los eventos usan claves `ema:<incident_id>:<tipo>` y D1 los inserta con `INSERT OR IGNORE`. El adaptador `deliverEmaOutboxEvent()` admite mock de éxito/fallo; `sendEmaHealthEmail()` permanece deliberadamente no configurado y no usa Resend ni secrets.

La simulación determinística reproduce: datos normales, dato repetido, detección a las 17:10 ART del incidente real (con `stale_since` 17:00:59), recordatorio desde 20:10 ART, recuperación con la observación de 09:40:02 ART, HTTP 500 con D1 stale, timestamp inválido/futuro, cruces de fecha y retry 10 min → 30 min → 1 h → 3 h → 6 h. No se enviaron correos, no hubo requests Meteored ni modificaciones a Home, Históricos, alertas SMN o pronóstico social.

---

## 9. Fase 2A — Preparación de activación Resend

La migración `0004_create_ema_health_monitor.sql` se aplicó y validó **solamente** en D1 local (`.wrangler/state`). Confirmó las dos tablas, el índice `idx_ema_health_outbox_pending`, el singleton y que dos `INSERT OR IGNORE` con `ema:local-test:STALE` conservan una sola fila `PENDING`. No se ejecutó ningún comando `--remote` de migración o escritura.

`sendEmaHealthEmail(env, message)` usa `POST https://api.resend.com/emails`, `Authorization: Bearer` y `Content-Type: application/json`. El remitente centralizado es `Meteo Ituzaingó <onboarding@resend.dev>`, el sender de prueba permitido por Resend para el correo propietario/verificado de la cuenta; no se supone dominio propio. El destinatario y clave sólo provienen de `RESEND_API_KEY` y `EMA_ALERT_RECIPIENT`. El timeout es 8 segundos. Sólo un 2xx con JSON válido e `id` no vacío es éxito; HTTP 4xx/5xx, red, timeout, JSON inválido o secret ausente devuelven error controlado y no deben marcar un evento como enviado.

La prueba controlada queda aislada en `npm run test:ema-email`: construye el asunto `Meteo Ituzaingó — Prueba monitor EMA`, usa el mismo adapter y no toca estado EMA, outbox, observaciones ni el cron. Requiere variables de proceso explícitas y no existe endpoint público. En esta fase no se ejecutó con credenciales ni se envió email.

### Checklist exacto para Fase 2B (no ejecutado)

1. Crear/verificar la cuenta Resend y confirmar que `onboarding@resend.dev` puede enviar al correo propietario elegido.
2. Crear API key y cargar, sin mostrar valor: `wrangler secret put RESEND_API_KEY`.
3. Cargar el destinatario permitido: `wrangler secret put EMA_ALERT_RECIPIENT`.
4. Aplicar sólo entonces la migración: `npx wrangler d1 migrations apply meteoituzaingo-history --remote`.
5. Consultar esquema remoto con `SELECT` y desplegar Worker con `npm run deploy`.
6. Verificar endpoints existentes, estado EMA inicial y siguiente cron normal.
7. En un shell controlado con las dos variables temporales, ejecutar una sola vez `npm run test:ema-email`; confirmar recepción y que no existen eventos `STALE`, `REMINDER` o `RECOVERY` por esa prueba.
8. Revisar outbox, observaciones y logs seguros antes de considerar activación final.

### Rollback propuesto

Si el deploy o el monitor fallan, desplegar la última versión Worker conocida sin monitor o desactivar sólo la invocación de monitor manteniendo `captureWeatherObservation()` y el cron actual. Si Resend falla, dejar el outbox pendiente y mantener captura/históricos activos. No usar `DROP TABLE`, no borrar outbox ni observaciones como rollback. La migración es aditiva y puede permanecer inactiva sin afectar las tablas existentes.

## 10. Fase 2A.1 — Hardening de entrega

Cada envío Resend usa exactamente `ema_health_outbox.idempotency_key` como header `Idempotency-Key`; no se genera una clave por retry. `STALE`, `REMINDER` y `RECOVERY` usan sus claves de incidente distintas y estables. Un 409 no se marca `SENT`: `concurrent_idempotent_requests` queda pendiente para retry con la misma clave; `invalid_idempotent_request` queda como fallo seguro y señala un bug de payload a investigar.

Los secrets cargados con Wrangler remoto no aparecen automáticamente en un proceso Node local. La estrategia elegida para `npm run test:ema-email` es variables temporales de la terminal local o un `cloudflare/.dev.vars` local; `.gitignore` ya excluye `cloudflare/.dev.vars` y no se creó archivo con valores. La prueba crea una clave `ema-test:<UTC compactado>` distinta de incidentes reales, y no imprime secretos.

El lease conceptual para un estado `SENDING` es 10 minutos: una fila reciente no debe ser tomada por otro worker; una fila cuyo lease venció vuelve a ser elegible y conserva la misma clave Resend. Antes de producción, el procesador debe hacer la reserva condicional `PENDING → SENDING` y guardar `lease_until` en la fila para completar esa garantía contra concurrencia. La key de Resend recomendada es de alcance mínimo `sending_access` si la cuenta ofrece esa selección.

## 11. Fase 2A.2 — Claim atómico del outbox

`lease_until TEXT` forma parte ahora de 0004 y el índice final es `(status, next_attempt_at, lease_until)`. El claim selecciona como candidata sólo una fila `PENDING` vencida o `SENDING` con lease vencido y ejecuta un `UPDATE ... WHERE id = ? AND` las mismas condiciones; se considera adjudicada sólo con `meta.changes === 1`. Por ello el segundo Worker concurrente recibe cero filas y no llama al proveedor. El lease es de 10 minutos; tras un crash el retry conserva la misma `Idempotency-Key`.

Éxito pasa `SENDING → SENT`, borra `lease_until` y fija `sent_at`. Un fallo reintentable vuelve a `PENDING`, borra lease y calcula el retry. Un 409/`invalid_idempotent_request` pasa a `FAILED`, no se reintenta automáticamente y requiere revisión. `SENT`, `CANCELLED` y `FAILED` no son candidatos. Se validó el esquema ajustado sólo en D1 local; D1 remota no fue accedida.
