# Auditoría de datos para pronóstico social avanzado — v1.10 Fase 0

**Estado:** auditoría técnica; no es una implementación.  
**Fecha de muestra:** 2026-09-09 (America/Argentina/Buenos_Aires).  
**Decisión:** **GO CONDICIONADO**. No debe evolucionar el texto automático hasta validar el catálogo exacto de `symbol` de la API JSON v1 y diseñar reglas explícitas para las afirmaciones derivadas.

Esta fase no modificó Worker, D1, crons, Home, panel privado, generador ni producción. Tampoco se guardaron muestras con credenciales ni se registraron secretos.

## 1. Arquitectura actual y consumo

| Componente | Función actual |
| --- | --- |
| Meteored | Fuente exclusiva de pronóstico horario y diario. Weather.com/PWS es exclusivamente observación actual e histórico propio. |
| Worker | Usa `GET https://api.meteored.com/api/forecast/v1/{hourly|daily}/{location-hash}` con `X-API-Key: [SECRET]`. |
| Caché compartida | `social_forecast_cache` en D1, una fila por tipo; conserva `payload_json` hasta `expires_at` recibido de Meteored. |
| Proxy público | `GET /api/forecast/hourly` y `GET /api/forecast/daily` llaman a la misma caché. |
| Home | Conserva una segunda caché de navegador por tipo en `localStorage`; el proxy le entrega una expiración local de 60 segundos. No hace polling de pronóstico. |
| Generador social | `buildSocialForecast()` solicita ambos tipos mediante el mismo `cachedForecast()`. El cron `1 3 * * *` lo ejecuta a las 00:01 de Argentina. |

Los dos endpoints de Meteored se invocan sólo ante un *cache miss* en D1. Una carga del dashboard, el cron y el panel no generan una llamada externa si la entrada D1 sigue vigente, aunque una recarga de Home con más de 60 segundos puede volver a consultar al Worker. El plan configurado se documenta como 50 solicitudes/día; el consumo exacto no se puede inferir desde el repositorio ni desde una respuesta de forecast, por lo que debe controlarse en el panel del proveedor. La Fase 1 debe reutilizar estas dos cargas y no crear requests adicionales. El costo objetivo puede mantenerse en **USD 0**.

La muestra real se obtuvo a través de los endpoints públicos cacheados ya existentes, nunca contra Meteored con la clave. La respuesta expone `ok`, `data` y `expiracion` (epoch en milisegundos), sin secretos. Importante: en el proxy actual ese valor se sintetiza como `Date.now() + 60000`; no revela ni reproduce la expiración original de Meteored, que sólo usa la caché D1.

Esto difiere de la redacción previa de `DATA_SOURCES.md`, que describía la expiración pública como si fuera la entregada por Meteored. No se corrigió ese archivo durante esta Fase 0 para limitar el cambio a la evidencia de auditoría; deberá alinearse en la siguiente fase documental aprobada.

## 2. Cobertura real observada

| Recurso | Método/proxy | Cobertura observada | Datos temporales |
| --- | --- | --- | --- |
| Horario | `GET /api/forecast/hourly` → `.../forecast/v1/hourly/{location-hash}` | 24 franjas de una hora | `end`, epoch ms; la primera fue 2026-09-09 01:00 ART y la última 2026-09-10 00:00 ART. |
| Diario | `GET /api/forecast/daily` → `.../forecast/v1/daily/{location-hash}` | 5 días | `start`, epoch ms al inicio del día ART. |

Las ventanas útiles futuras existen para madrugada (00:00–05:59), mañana (06:00–11:59), tarde (12:00–17:59) y noche (18:00–23:59), siempre que el cron se ejecute después de iniciado el día objetivo. El generador actual no usa madrugada y agrupa 06:00–19:59 como «Mañana y tarde»; la noche es 20:00–23:59. Tanto el código actual como una futura Fase 1 deben particionar con `America/Argentina/Buenos_Aires`, no con UTC.

## 3. Inventario de campos reales

Las unidades de temperatura, viento y lluvia están corroboradas por la presentación actual del proyecto y por los valores de la muestra. Para `rain`, la API JSON v1 no ofreció en esta auditoría un diccionario público que confirme si representa mm por intervalo, por día o una previsión acumulada: se lo registra como **cantidad numérica de precipitación con semántica pendiente de confirmar**. No se debe publicar un acumulado ni un rango de mm hasta resolverlo.

### Horario (`data.hours[]`, 24/24 salvo indicación)

| Campo | Tipo / ejemplo real | Unidad / lectura operativa | Uso actual |
| --- | --- | --- | --- |
| `end` | entero, `1788926400000` | epoch ms; fin de franja | Sí: selección y hora visible. |
| `symbol` | entero, `1`, `3`, `4`, `5`, `12` | código de estado; catálogo JSON v1 pendiente | Sí, con mapeo no validado. |
| `night` | booleano, `true` / `false` | indicador nocturno | No. |
| `temperature` | decimal, `10.49` | °C | Sí, Home; no texto social por período. |
| `temperature_feels_like` | decimal, `8.69` | °C de sensación | Home; ignorado por el generador. |
| `wind_speed` | entero, `8` | km/h | Sí, resumen social. |
| `wind_gust` | entero, `14` | km/h, ráfaga | Ignorado por el generador. |
| `wind_direction` | texto, `NE` | rumbo cardinal | Sí, dirección dominante social. |
| `rain` | número, `0`, `0.2`, `0.6` | cantidad de precipitación; semántica/unidad formal pendiente | Ignorado por el generador. |
| `rain_probability` | entero, `0`, `10`, `30` | porcentaje de probabilidad de precipitación | Home; ignorado socialmente. |
| `humidity` | entero, `72` | % | Home; ignorado socialmente. |
| `pressure` | entero, `1018` | hPa | Ignorado socialmente. |
| `clouds` | entero, `0`–`96` | aparente porcentaje de nubosidad; sin diccionario v1 confirmado | Ignorado. |
| `snowline` | entero, `3100` | altitud de cota de nieve, aparentemente m; no validada para redacción local | Ignorado. |
| `uv_index_max` | decimal, `0.2` | índice UV máximo horario | Ignorado. |

### Diario (`data.days[]`, 5/5)

| Campo | Tipo / ejemplo real | Unidad / lectura operativa | Uso actual |
| --- | --- | --- | --- |
| `start` | entero, `1788922800000` | epoch ms de inicio del día | Sí: fecha y mínima/máxima social. |
| `symbol` | entero, `3`, `4`, `12`, `13` | código de estado; catálogo JSON v1 pendiente | Sí, con mapeo no validado. |
| `temperature_min` / `temperature_max` | decimal, `7.64` / `19.81` | °C | Sí: texto social. |
| `wind_speed` / `wind_gust` | entero, `9` / `24` | km/h | Velocidad visible; ráfaga ignorada socialmente. |
| `wind_direction` | texto, `N` | rumbo cardinal | Ignorado por el texto diario. |
| `rain` | número, `1`, `1.4` | cantidad de precipitación; semántica formal pendiente | Ignorado. |
| `rain_probability` | entero, `40`, `60` | % de probabilidad diaria | Home; ignorado socialmente. |
| `humidity` | entero, `69` | % | Ignorado. |
| `pressure` | entero, `1017` | hPa | Ignorado. |
| `snowline` | entero, `2300` | cota de nieve aparente; sin uso local | Ignorado. |
| `uv_index_max` | decimal, `5.1` | índice UV máximo diario | Ignorado. |
| `sun_in` / `sun_mid` / `sun_out` | entero | epoch ms: salida, mediodía y puesta de sol aparentes | Ignorados. |
| `moon_in` / `moon_out` | entero | epoch ms de salida/puesta de luna aparentes | Ignorados. |
| `moon_symbol` / `moon_illumination` | entero / decimal, `2` / `2.91` | fase/código lunar e iluminación aparente | Ignorados. |

No aparecieron en la respuesta real: visibilidad, distancia de visibilidad, punto de rocío, índice de calor, wind chill explícito, precipitación por tipo, probabilidad de tormenta/nieve/granizo/niebla/helada, tasa de precipitación, `severity`, texto de condición ni descripción localizada.

## 4. Precipitación, tormentas y estado del cielo

### Datos disponibles

- **Probabilidad:** sí. `rain_probability` existe en todas las horas y los 5 días de la muestra; es un porcentaje por franja horaria o por día, respectivamente. Es apto para una futura frase literal como «probabilidad máxima de precipitación: 30 %» si se conserva el período al que corresponde.
- **Cantidad:** sí, campo `rain` horario y diario. La muestra horaria tuvo `0.2`, `0.6`, `0.2` en 20:00–22:00 ART y el día mostró `1`. La relación sugiere mm por intervalo/total diario, pero la semántica no quedó confirmada por documentación de la API JSON v1. Por ello no es apto aún para «se esperan X mm» ni para intensidad.
- **Acumulado:** no hay campo explícitamente denominado acumulado. No sumar `rain` horarios ni compararlo con el diario hasta confirmar la semántica y evitar doble conteo.
- **Tipo de precipitación:** no hay un campo separado para lluvia, llovizna, chaparrón, nieve, aguanieve o granizo. Sólo podría venir codificado en `symbol`, sujeto a la validación pendiente.
- **Tormenta e intensidad:** no existen campos explícitos de probabilidad de tormenta, intensidad, severidad, rayos o tormenta severa. Nunca derivar «tormenta fuerte» de POP, mm, viento o ráfagas.
- **Granizo:** no aparece un campo explícito. El catálogo histórico de iconos de Meteored asocia algunos códigos a granizo, pero aún no prueba que el `symbol` JSON v1 del proyecto use esa tabla. El generador **no debe anunciar granizo basado sólo en inferencia**.

### Catálogo de `symbol`: bloqueo de seguridad

La [documentación de iconos de Meteored](https://www.meteored.com.ar/documentacion_api/manual.pdf) publicada para su API histórica/XML lista: 1 despejado; 2 intervalos nubosos; 3 nuboso; 4 cubierto; 5–7 lluvia débil; 8–10 lluvia moderada; 11–13 chubascos tormentosos; 14–16 chubascos tormentosos con granizo; 17–19 nieve; 20–22 aguanieve.

| Código XML histórico | Descripción oficial publicada | ¿Visto en la muestra JSON? |
| --- | --- | --- |
| 1 | Despejado | Sí |
| 2 | Intervalos nubosos | No |
| 3 | Cielos nubosos | Sí |
| 4 | Cielos cubiertos | Sí |
| 5 | Intervalos nubosos con lluvia débil | Sí |
| 6 | Cielos nubosos con lluvia débil | No |
| 7 | Cielos cubiertos con lluvia débil | No |
| 8 | Intervalos nubosos con lluvia moderada | No |
| 9 | Cielos nubosos con lluvia moderada | No |
| 10 | Cielos cubiertos con lluvia moderada | No |
| 11 | Intervalos nubosos con chubascos tormentosos | No |
| 12 | Cielos nubosos con chubascos tormentosos | Sí |
| 13 | Cielos cubiertos con chubascos tormentosos | Sí |
| 14 | Intervalos nubosos con chubascos tormentosos y granizo | No |
| 15 | Cielos nubosos con chubascos tormentosos y granizo | No |
| 16 | Cielos cubiertos con chubascos tormentosos y granizo | No |
| 17 | Intervalos nubosos con nevadas | No |
| 18 | Cielos nubosos con nevadas | No |
| 19 | Cielos cubiertos con nevadas | No |
| 20 | Intervalos nubosos con aguanieve | No |
| 21 | Cielos nubosos con aguanieve | No |
| 22 | Cielos cubiertos con aguanieve | No |

Los códigos 23–41 que contempla el mapa de interfaz del proyecto no figuran en esa tabla oficial histórica; esa interfaz los etiqueta internamente como aguanieve, nieve, lluvia fuerte, lluvia/nieve, nevada intensa, tormenta, granizo, tormenta con granizo, tormenta de arena y ventisca. No son descripciones verificadas para el JSON v1 y, por ello, tampoco son aptas para una frase automática.

La muestra JSON v1 contiene 1, 3, 4, 5, 12 y 13, mientras que `js/dashboard.js` y `cloudflare/src/social-forecast.js` los clasifican con otro catálogo (por ejemplo, el dashboard interpreta 5 como «Cubierto» y 12–13 como lluvia, y el generador trata 12–19 como lluvia). La documentación encontrada no describe de manera verificable el contrato JSON v1 actual ni los códigos 23+ que el código también contempla.

| Código observado | Descripción del catálogo XML histórico | Interpretación actual del dashboard | Estado para redacción social |
| --- | --- | --- | --- |
| 1 | Despejado | Despejado | Coincide en la muestra, pero requiere confirmar que el catálogo JSON v1 es el mismo. |
| 3 | Cielos nubosos | Nubes y claros / parcial | Conflicto. |
| 4 | Cielos cubiertos | Parcialmente nublado | Conflicto. |
| 5 | Intervalos nubosos con lluvia débil | Cubierto | Conflicto crítico. |
| 12 | Cielos nubosos con chubascos tormentosos | Lluvia débil; social: lluvia | Conflicto crítico. |
| 13 | Cielos cubiertos con chubascos tormentosos | Lluvia débil; social: lluvia | Conflicto crítico. |

Conclusión: antes de hacer más específico el generador se debe obtener de Meteored el diccionario JSON v1 aplicable a este endpoint o una confirmación escrita de soporte. Hasta entonces sólo son seguros los textos que no conviertan `symbol` en un fenómeno. No se cambió el mapeo existente en esta fase.

## 5. Viento, humedad, niebla, frío y calor

- **Viento:** velocidad, dirección y ráfaga horarias y diarias están disponibles. En la muestra horaria: 3–9 km/h, racha máxima 24 km/h, direcciones N/NE. Una futura frase «ráfagas de hasta 24 km/h» es respaldada directamente por `wind_gust` y el máximo del período.
- **«Ventoso»:** no hay condición textual `windy`. Puede definirse en una fase posterior con umbral propio de velocidad/ráfaga, etiquetado como clasificación de Meteo Ituzaingó, no de Meteored.
- **Humedad:** existe en 100 % de las horas y días de la muestra, pero no justifica niebla, neblina ni «frío húmedo» por sí sola.
- **Niebla/neblina:** no hay visibilidad, visibilidad de niebla ni campo de fenómeno textual. El catálogo de símbolos histórico incluye fenómenos, pero sigue bloqueado por el conflicto de catálogo. No anunciar niebla/neblina/densa por humedad o `clouds`.
- **Frío y sensación:** `temperature`, `temperature_feels_like` y mínima diaria están presentes. «Temperatura prevista de X °C» y «sensación de X °C» son explícitos. «Fresco», «frío», «muy frío» y «caluroso» exigirían umbrales editoriales propios, no provistos por la fuente.
- **Heladas:** no hay `frost`, `freeze`, `frost risk`, punto de rocío ni tipo de precipitación congelada explícitos. Temperatura ≤ 0 °C no basta para anunciar helada prevista para toda la zona. Una regla futura necesitaría diseño y validación local; no puede salir de este dataset solo.
- **Calor/UV:** máxima y sensación explícitas; UV máximo horario/diario aparece en la muestra. «Calor» requiere regla propia. No hay heat index explícito.
- **Presión y nubosidad:** presión existe; `clouds` parece un porcentaje por sus valores 0–96, pero la API JSON v1 no lo confirmó formalmente. No convertir aún esas cifras en categorías editoriales.

## 6. Generador actual: reglas reales y límites

`cloudflare/src/social-forecast.js` usa únicamente estos elementos:

1. Carga `hourly` y `daily` en paralelo mediante la caché compartida.
2. Conserva sólo horas cuyo `end`, convertido a `America/Argentina/Buenos_Aires`, coincide con la fecha objetivo.
3. Agrupa 06:00–19:59 como «Mañana y tarde» y ≥20:00 como «Noche»; no produce bloque de madrugada ni separa mañana/tarde.
4. Obtiene mínima/máxima de `daily.days[]` para esa fecha; si faltan, usa mínimo/máximo de `hours[].temperature`.
5. Reduce `symbol` a `storm`, `rain`, `fog`, `cloudy`, `partly` o `clear`; prioriza el fenómeno más alto presente en todo el período. Sólo describe transición entre estados de cielo considerados no precipitación.
6. Usa `wind_speed`: rumbo dominante sólo si tiene al menos 55 % de las horas; si no, «variables». Expresa percentiles 20/80, redondeados a 5 km/h, no máximos ni ráfagas.
7. Genera cuatro bloques: encabezado/mañana-tarde, noche, mín./máx. y URL del Blog. `splitPosts()` mantiene bloques semánticos y apunta a ≤270 caracteres por publicación; si hay más de una, antepone `n/total`.
8. Si faltan horas, mañana, noche o temperaturas, devuelve `incomplete`; no inventa texto.

Campos hoy desperdiciados por el generador: sensación, ráfaga, POP, cantidad de lluvia, humedad, presión, nubosidad, UV, `night`, cota de nieve, horas exactas, luna y sol. La PWS/Weather.com no interviene en el pronóstico social: se usa para observaciones presentes e histórico, correctamente separada del futuro.

Limitaciones concretas: no comunica POP ni ráfagas; no detecta eventos por período; agrupa dos períodos; no usa el tramo 00:00–05:59; reduce todo el período al fenómeno de mayor prioridad; y, especialmente, usa un catálogo de símbolos no verificado frente al contrato JSON v1.

## 7. Alertas SMN y severidad

`GET /api/alerts` ya puede ser consumido en una futura fase desde el Worker sin añadir una fuente nueva. Si devuelve una alerta oficial aplicable, debe renderizarse como nota separada con fuente SMN, sin convertirla ni combinarla con el forecast Meteored. No debe usarse una alerta para inferir lluvia, tormenta, granizo o severidad del forecast.

| Afirmación | Clasificación | Fundamento |
| --- | --- | --- |
| «Probabilidad de precipitación: N %» | A, explícita | `rain_probability`, preservando período. |
| «Ráfagas de hasta N km/h» | A, explícita | máximo de `wind_gust` del período. |
| «Temperatura / sensación N °C» | A, explícita | `temperature`, `temperature_feels_like`, mín./máx. diaria. |
| «Viento del N/NE» | A, con agregación transparente | `wind_direction` y regla de predominancia. |
| «Ventoso», «frío», «caluroso» | B, regla propia futura | umbrales editoriales y documentación necesarios. |
| «Lluvia de N mm» / acumulado | B, pendiente de semántica | existe `rain`, pero no el contrato JSON v1 de su unidad/período. |
| «Lluvia débil/intensa» | B/rojo | requiere código validado o tasa/umbral futuro; no hay mm/h explícito. |
| «Chaparrones», «tormenta», «niebla» | Rojo hoy | dependerían del `symbol` no validado; no hay campo textual alternativo. |
| «Tormenta fuerte», «tiempo severo» | Rojo | no hay intensidad ni severidad explícita; sólo una alerta SMN podría respaldar una nota oficial separada. |
| «Granizo», «helada» | Rojo | no hay indicador JSON v1 explícito confirmado. |

## 8. Matriz de confianza interna

| Fenómeno | Dato disponible | Campo | Explícito / derivado | Confianza | ¿Apto para futura v1.10? | Observación |
| --- | --- | --- | --- | --- | --- |
| Lluvia como cantidad | Sí, semántica pendiente | `rain` | Derivado | Amarillo | No aún | No afirmar mm/acumulado. |
| Chaparrones | Sólo posible código | `symbol` | No seguro | Rojo | No | Catálogo en conflicto. |
| Probabilidad | Sí | `rain_probability` | Explícito | Verde | Sí | Máximo/rango por período, no promedio inventado. |
| Acumulado | No explícito | — | No seguro | Rojo | No | No sumar horas. |
| Tormenta | Sólo posible código | `symbol` | No seguro | Rojo | No | Validar contrato JSON v1 primero. |
| Tormenta fuerte | No | — | No seguro | Rojo | No | Nunca inferir desde POP/mm/viento. |
| Granizo | Sólo catálogo histórico | `symbol` | No seguro | Rojo | No | Prohibido por inferencia. |
| Viento | Sí | `wind_speed`, `wind_direction` | Explícito | Verde | Sí | Mostrar valor/rango sustentado. |
| Ventoso | Sí, sin etiqueta | velocidad/ráfaga | Regla propia | Amarillo | Tras diseño | Etiqueta editorial, no oficial. |
| Ráfagas | Sí | `wind_gust` | Explícito | Verde | Sí | Usar máximo real del período. |
| Frío / mucho frío | Sí, sin clasificación | temp./sensación | Regla propia | Amarillo | Tras diseño | Umbrales locales documentados. |
| Helada | No | — | No seguro | Rojo | No | Temperatura sola no basta. |
| Niebla / neblina | No confirmada | — / `symbol` | No seguro | Rojo | No | Humedad no basta. |
| Calor | Sí, sin clasificación | máxima/sensación | Regla propia | Amarillo | Tras diseño | No hay heat index explícito. |
| Sensación térmica | Sí | `temperature_feels_like` | Explícito | Verde | Sí | Por hora/período. |
| Tiempo severo | Sólo alertas separadas | `/api/alerts` | Oficial separado | Verde para alerta; rojo para forecast | Sólo como nota SMN | Nunca atribuirlo a Meteored sin señal explícita. |

## 9. Modelo conceptual para una fase posterior

Sin implementarlo, una normalización interna podría producir por cada período:

```js
{
  period,             // madrugada, mañana, tarde, noche; ART
  sky,                // sólo tras validar symbol
  precipitationProbability, // máximo/rango explícito
  precipitationAmount,      // null hasta validar rain
  storm, fog, frost,  // null/unknown hasta fuente explícita
  wind, gust,         // valores y agregación documentada
  temperature, feelsLike,
  severitySignals     // alerta SMN separada, no inferida
}
```

Dos modos conceptuales: **normal**, compacto y limitado a datos verdes; y **evento relevante**, con un bloque adicional sólo cuando haya POP/ráfagas explícitas o alerta SMN oficial aplicable. Ambos deben ser determinísticos, reproducibles, auditables, sin IA generativa y sin costo adicional.

## 10. Ejemplos de simulación (no publicados)

### Basados en la muestra real del 2026-09-09

1. «Para hoy: mínima prevista 7,6 °C y máxima 19,8 °C. Entre las 20:00 y las 22:00, la probabilidad de precipitación alcanza 30 %. Ráfagas previstas de hasta 24 km/h.»
2. «Durante la noche, temperatura de 15,0 °C a 12,3 °C; viento del NE/N entre 5 y 8 km/h, con ráfagas de hasta 17 km/h. Probabilidad de precipitación de hasta 30 % entre 20:00 y 22:00.»
3. «Para el 12/09: mínima 6,6 °C, máxima 11,8 °C, probabilidad diaria de precipitación 60 % y ráfagas previstas de hasta 39 km/h.»

No se describe en estos ejemplos el fenómeno de `symbol` 12/13 ni se comunica un acumulado: la fuente real trae esos datos, pero las dos interpretaciones aún requieren validación.

### Sintéticos, expresamente no basados en producción

- **SIMULACIÓN — viento:** «Viento predominante del SO, con ráfagas de hasta 55 km/h.» Sólo sería válido con el máximo horario real correspondiente.
- **SIMULACIÓN — helada:** «Mínima cercana a 0 °C.» No diría «helada» sin un indicador o regla futura validada.
- **SIMULACIÓN — niebla:** No debe emitirse a partir de humedad alta; requeriría visibilidad o código confirmado.
- **SIMULACIÓN — tormentas:** Sólo sería válido si el catálogo JSON v1 o una fuente oficial entrega una señal explícita; «fuertes» requeriría intensidad explícita o alerta oficial separada.

## 11. Recomendaciones para Fase 1

1. Solicitar a Meteored confirmación/documentación del esquema JSON v1 (`symbol`, `rain`, `clouds`, `snowline`) antes de cambiar cualquier descripción de cielo o precipitación.
2. Mantener la caché actual y reutilizar los payloads ya disponibles. No agregar endpoints ni cron ni polling.
3. Implementar primero sólo datos verdes: POP por período, temperatura/sensación y ráfaga máxima; normalizar horas en ART.
4. Definir, revisar y documentar aparte umbrales editoriales para «ventoso», frío y calor. No presentarlos como clasificaciones de Meteored o SMN.
5. Mantener `rain` y todos los fenómenos dependientes de `symbol` fuera del texto hasta aclarar su contrato.
6. Si se integra alerta SMN, conservarla como nota oficial independiente y nunca como sustituto o intensificador del forecast.

La auditoría permite una evolución segura y sin solicitudes Meteored adicionales para los campos verdes. La evolución completa de cielo, lluvia, chaparrones, tormentas, granizo y niebla queda condicionada a la validación del contrato de símbolos y precipitación.

---

## 12. Fase 0.1 — Validación de `symbol` y `rain`

**Fecha de validación:** 2026-09-09.  
**Decisión de esta fase:** **GO-C**: `rain` queda confirmado para la muestra y el endpoint horario; `symbol` queda validado sólo para los códigos correlacionados (3, 4, 5, 12 y 13), no como catálogo completo 1–41.

No se modificaron código, Worker, D1, crons, Home, panel, producción ni el mapeo existente. Tampoco se hizo deploy ni commit.

### Endpoint y contrato observado

El Worker usa, sin parámetros de query, estas rutas de Meteored:

| Tipo | Endpoint externo | Autenticación | Resultado observado |
| --- | --- | --- | --- |
| Horario | `GET https://api.meteored.com/api/forecast/v1/hourly/{location-hash}` | `X-API-Key: [SECRET]` | `ok`, `data.start`, `data.hours[]`; 24 objetos horarios. |
| Diario | `GET https://api.meteored.com/api/forecast/v1/daily/{location-hash}` | `X-API-Key: [SECRET]` | `ok`, `data.days[]`; 5 objetos diarios. |

`end` identifica el fin de cada franja de una hora. El endpoint no recibe un parámetro de zona horaria; el proyecto transforma esos epoch ms con `America/Argentina/Buenos_Aires`. El JSON no contiene `description`, `condition`, `phrase`, `weather`, `state`, `text` ni `iconText`; la descripción debe correlacionarse con la página pública, no inferirse de un campo inexistente.

### Evidencia oficial consultada

- La [página pública de Meteored para Ituzaingó](https://www.tiempo.com/ituzaingo.htm) expone en el mismo HTML las clases `sH-{symbol}`/`sD-{symbol}`, el `alt` descriptivo, hora, temperatura, POP y lluvia visible.
- El [manual de iconos oficial](https://www.meteored.com.ar/documentacion_api/manual.pdf) se revisó como catálogo XML histórico. No se lo usó como prueba del JSON v1, porque la propia evidencia web demuestra un catálogo numérico distinto para al menos los códigos 5, 12 y 13.
- La búsqueda local encontró sólo mapeos de aplicación: `METEORED_SIMBOLOS` fue incorporado en el commit `cf5bdb3` (v1.0) sin comentario ni fuente de procedencia registrada. `symbolKind()` fue creado en `4fe098f` (v1.8) como simplificación para el generador. No hay documentación local que defina la semántica de `rain` ni el contrato JSON v1.
- Se intentó una consulta remota estrictamente de lectura a `social_forecasts` para ampliar códigos históricos, pero la sesión local de Cloudflare no está autorizada para D1 (error 7403). No se reintentó con otro mecanismo, no se modificó D1 y la conclusión se limita a la muestra pública correlacionada.

### Inventario de la respuesta horaria real

La tabla conserva la muestra de `GET /api/forecast/hourly` usada en la correlación. No había texto meteorológico dentro del JSON.

| Hora ART | `symbol` | Temp. °C | POP % | `rain` | `clouds` % | Viento km/h | Ráfaga km/h | Texto JSON |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 01:00 | 1 | 10.49 | 0 | 0 | 0 | 8 | 14 | No existe |
| 02:00 | 1 | 10.11 | 0 | 0 | 0 | 9 | 16 | No existe |
| 03:00 | 1 | 9.61 | 0 | 0 | 0 | 9 | 17 | No existe |
| 04:00 | 1 | 8.93 | 0 | 0 | 10 | 8 | 16 | No existe |
| 05:00 | 3 | 8.58 | 0 | 0 | 38 | 7 | 16 | No existe |
| 06:00 | 3 | 8.24 | 0 | 0 | 48 | 7 | 14 | No existe |
| 07:00 | 3 | 8.04 | 0 | 0 | 51 | 6 | 12 | No existe |
| 08:00 | 4 | 9.47 | 0 | 0 | 63 | 7 | 13 | No existe |
| 09:00 | 4 | 11.69 | 0 | 0 | 89 | 8 | 18 | No existe |
| 10:00 | 4 | 13.89 | 0 | 0 | 95 | 7 | 19 | No existe |
| 11:00 | 4 | 16.33 | 0 | 0 | 72 | 7 | 21 | No existe |
| 12:00 | 5 | 18.38 | 0 | 0 | 96 | 8 | 23 | No existe |
| 13:00 | 4 | 19.41 | 0 | 0 | 93 | 8 | 24 | No existe |
| 14:00 | 4 | 19.16 | 0 | 0 | 74 | 6 | 23 | No existe |
| 15:00 | 4 | 19.14 | 0 | 0 | 95 | 7 | 19 | No existe |
| 16:00 | 5 | 18.34 | 0 | 0 | 96 | 7 | 19 | No existe |
| 17:00 | 4 | 17.77 | 0 | 0 | 74 | 5 | 17 | No existe |
| 18:00 | 4 | 17.31 | 10 | 0 | 86 | 3 | 13 | No existe |
| 19:00 | 5 | 15.87 | 10 | 0 | 96 | 5 | 10 | No existe |
| 20:00 | 12 | 14.99 | 30 | 0.2 | 76 | 6 | 12 | No existe |
| 21:00 | 12 | 13.57 | 30 | 0.6 | 93 | 8 | 15 | No existe |
| 22:00 | 12 | 12.98 | 30 | 0.2 | 29 | 8 | 17 | No existe |
| 23:00 | 3 | 12.28 | 10 | 0 | 25 | 7 | 15 | No existe |
| 00:00 | 3 | 11.51 | 0 | 0 | 11 | 8 | 16 | No existe |

### Correlación formal de `symbol`

La página pública y el JSON coincidieron no sólo por hora y código, sino por los mismos valores decimales de temperatura y los mismos valores de lluvia de 20:00–22:00. La siguiente correlación cubre cinco códigos distintos, no una única observación.

| `symbol` JSON | Evidencia pública Meteored | Descripción web observada | Manual XML histórico | Muestras correlacionadas | Resultado |
| ---: | --- | --- | --- | ---: | --- |
| 3 | 23:00 y 24:00; temperaturas 12.28 y 11.51 °C | Nubes y claros | Cielos nubosos | 2 | Confirmado para JSON/web; **no** coincide con XML. |
| 4 | 17:00 y 18:00; temperaturas 17.77 y 17.31 °C | Parcialmente nuboso | Cielos cubiertos | 2 | Confirmado para JSON/web; **no** coincide con XML. |
| 5 | 16:00 y 19:00; temperaturas 18.34 y 15.87 °C | Cubierto | Intervalos nubosos con lluvia débil | 2 | Confirmado para JSON/web; **no** coincide con XML. |
| 12 | 20:00–22:00; POP 30 % y `rain` 0.2/0.6/0.2 | Lluvia débil con cielo parcialmente nuboso | Chubascos tormentosos con cielo nuboso | 3 | Confirmado para JSON/web; **no** coincide con XML. |
| 13 | Pronóstico diario del 12/09; mínima 6.63, máxima 11.76, POP 60 %, `rain` 1.4 | Lluvia débil con cielo cubierto | Chubascos tormentosos con cielo cubierto | 1 diaria | Confirmado para JSON/web; **no** coincide con XML. |

El código 1 apareció cuatro veces en el JSON, pero no estaba entre las franjas públicas aún visibles en el momento de la captura; se mantiene como no corroborado por esta fase. No se observó en esta muestra ningún código de tormenta, granizo, niebla o nieve del catálogo de interfaz.

#### Implicación para el mapeo actual

- **Dashboard:** para los códigos correlacionados 3, 4, 5, 12 y 13, el mapa de `js/dashboard.js` coincide de forma sustancial con la página oficial actual. No requiere modificación en esta fase.
- **Generador social:** su clasificación es demasiado gruesa. Para `symbol=5` produce «Nublado.» donde la evidencia dice «Cubierto»; para 12/13 produce «Lluvias y chaparrones.» cuando la evidencia sólo avala «Lluvia débil». Debe corregirse en una fase funcional futura, pero no se cambió ahora.
- **Códigos sin correlación:** no se deben usar para anunciar tormentas, granizo, nieve, niebla o intensidad hasta reunir evidencia propia del JSON/web para cada código relevante.

### Validación de `rain`

La correlación horaria es explícita y suficiente:

| Hora ART | JSON `rain` | Página oficial | Conclusión |
| --- | ---: | --- | --- |
| 20:00 | 0.2 | `0.2 l/m²` | Coincidencia exacta. |
| 21:00 | 0.6 | `0.6 l/m²` | Coincidencia exacta. |
| 22:00 | 0.2 | `0.2 l/m²` | Coincidencia exacta. |

`l/m²` y milímetros de lámina de agua son equivalentes. Como cada fila correlacionada pertenece a una franja horaria identificada por `end` y la página muestra ese mismo valor junto a la hora, para este endpoint **`rain` es precipitación prevista en mm (l/m²) durante esa hora**, no POP ni acumulado desde el inicio. La suma positiva `0.2 + 0.6 + 0.2 = 1.0` coincide con el `rain=1` del objeto diario de la misma fecha, lo que aporta una verificación adicional de la semántica.

Por ello puede sumarse sólo con estas condiciones: horas completas del mismo día ART, sin huecos, valores numéricos válidos y sin mezclar la serie diaria. La suma puede respaldar un acumulado previsto del período. No autoriza por sí sola una etiqueta «lluvia intensa»: eso requeriría un umbral editorial futuro o una descripción explícita de Meteored.

`rain_probability` y `rain` son independientes: por ejemplo, a las 18:00 POP fue 10 % con `rain=0`, mientras que 20:00–22:00 combinaron 30 % con cantidades positivas. Nunca se debe derivar una cantidad desde POP.

### Matriz actualizada

| Elemento | Estado interno | Alcance habilitado | Restricción |
| --- | --- | --- | --- |
| POP | Verde | máximo/rango por período | Conservar hora/período. |
| `rain` | Verde | mm/l/m² horarios y suma de un período completo | Validado en muestra actual; no inferir intensidad. |
| `symbol` 3, 4, 5, 12, 13 | Verde limitado | descripciones web exactas corroboradas | No extender a códigos no correlacionados. |
| Lluvia débil (12, 13) | Verde limitado | Sólo con esos códigos corroborados | No sustituir por «chaparrones». |
| Chaparrones | Rojo | No habilitado | Ningún código correlacionado lo afirma. |
| Tormenta / granizo / niebla | Rojo | No habilitado | Códigos pertinentes no observados/correlacionados. |
| Acumulado de período | Verde condicionado | Suma de `rain` horario completo | Validar horas presentes y día ART. |
| Intensidad de lluvia | Amarillo | Ninguno todavía | Requiere regla editorial explícita. |

### Respuestas de cierre de Fase 0.1

| Pregunta | Respuesta |
| --- | --- |
| ¿JSON v1 usa el catálogo XML histórico? | No. Cinco códigos correlacionados contradicen ese catálogo. |
| ¿Qué son 5, 12 y 13? | 5: Cubierto; 12: Lluvia débil con cielo parcialmente nuboso; 13: Lluvia débil con cielo cubierto. |
| ¿El mapping actual es correcto? | Dashboard: sí para los cinco códigos auditados. Generador: debe refinar 5, 12 y 13 en una fase futura. |
| ¿`rain` está en mm? | Sí; la página oficial lo muestra como l/m², unidad equivalente a mm. |
| ¿Qué intervalo representa? | Una hora, corroborada por cada fila `end`/hora de la página. |
| ¿Puede sumarse/anunciarse acumulado? | Sí, para una ventana horaria completa y continua del mismo día ART. |
| ¿Puede anunciarse intensidad? | No sin un umbral editorial futuro. |
| ¿Lluvia/chaparrones? | Lluvia débil sí para 12/13; chaparrones no. |
| ¿Tormentas, granizo o niebla? | No con la evidencia actual; quedan prohibidos. |
| ¿Qué queda habilitado? | POP, lluvia débil de 12/13, mm horarios/acumulado condicionado, temperatura/sensación, viento y ráfagas. |

La próxima fase funcional puede usar únicamente el conjunto habilitado y debe conservar este alcance: no es una autorización para extender el significado de `symbol` a todo el catálogo ni para emitir fenómenos severos.

---

## 13. Fase 1 — Reglas implementadas pendientes de preview

La implementación local reutiliza los payloads `hourly`/`daily` existentes y crea resúmenes de madrugada, mañana, tarde y noche en `America/Argentina/Buenos_Aires`. `rain` se suma con un decimal sólo cuando las seis horas esperadas de un período existen exactamente una vez; POP, viento, temperatura y sensación siguen disponibles aun con cobertura incompleta.

Reglas editoriales de Meteo Ituzaingó: POP ≥40 %, o ≥20 % con precipitación validada; ráfagas desde 35 km/h; «Ventoso» con máximo sostenido ≥30 km/h o ráfaga ≥45 km/h; sensación cuando difiere ≥3 °C; fresco ≤10 °C, muy frío ≤5 °C, caluroso ≥30 °C y muy caluroso ≥35 °C. No son categorías oficiales.

Sólo se describen 3, 4, 5, 12 y 13. Los demás símbolos se informan en un log estructurado, deduplicado por ejecución, sin D1, endpoint ni cron nuevos. Se impide centralmente la generación de chaparrones, tormentas, granizo, niebla/neblina, heladas, tiempo severo, lluvia intensa/torrencial y temporal. La vista previa y la revisión humana deben completarse antes de despliegue.

---

## 14. Fase 1.1 — Cobertura semántica antes de deploy

La revisión del preview real del 09/09 detectó que madrugada (`[1,1,1,1,3]`) se describía como «Nubes y claros». `symbol=1` no estaba mapeado: la causa fue que el cálculo de dominante eliminaba los códigos desconocidos y elegía el único código conocido (`3`). No se halló ni se incorporó evidencia adicional para validar `symbol=1`; permanece **UNKNOWN** y el catálogo XML histórico continúa excluido.

La corrección añade por período `knownSymbolHours`, `unknownSymbolHours` y `symbolCoverage`. Una condición de cielo sólo es publicable con una cobertura de símbolos validados de al menos 60 % de las horas recibidas: una minoría de 1/5 (20 %) o 1/6 (16,7 %) omite el cielo, mientras 4/6 (66,7 %) permite «Parcialmente nuboso». Los campos numéricos seguros —temperatura, sensación, POP, lluvia validada, viento y ráfagas— no quedan bloqueados por esta regla. Se agregaron tres fixtures determinísticos para estos casos.
