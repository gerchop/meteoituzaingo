# Auditoría técnica de alertas oficiales SMN / CAP — v1.9 fase 1

## Alcance y resultado

Auditoría solamente. No se modificaron Worker, D1, cron, frontend, producción ni despliegues. Las fuentes inspeccionadas son las publicadas por el propio [SMN en su página RSS](https://ws2.smn.gob.ar/rss).

Recomendación: **GO condicionado**. Los feeds oficiales y CAP son utilizables, la geometría permite filtrar localmente y no se necesita D1. La implementación futura debe introducir un parser XML seguro y conservar la semántica CAP; no debe inferir alertas desde HTML o usar `areaDesc` como criterio geográfico único.

## URLs oficiales confirmadas

| Producto | Feed RSS oficial | Estado auditado |
| --- | --- | --- |
| Alertas y advertencias | `https://ssl.smn.gob.ar/feeds/CAP/rss_alertaCAP_nuevo_2026.xml` | HTTP 200; 64 items CAP al auditar |
| Temperaturas extremas | `https://ssl.smn.gob.ar/feeds/CAP/oladecalor/rss_ola_calor_nuevo.xml` | HTTP 200; RSS válido, sin item vigente al auditar |
| ACP | `https://ssl.smn.gob.ar/feeds/CAP/avisocortoplazo/rss_acpCAP.xml` | HTTP 200; RSS válido, informa que no había ACP emitidos |
| Índice CAP SMN | `https://ssl.smn.gob.ar/CAP/AR.php` | publicado por la página RSS oficial |

El RSS general es un índice: cada `item` tiene `title`, `link`, `description`, `guid` y `pubDate`; `link` y `guid` apuntan al CAP individual. El encabezado RSS declara XML UTF-8, canal, `dc:publisher`, `language`, `pubDate` y `lastBuildDate`. El detalle operativo y geográfico vive en CAP, no en el RSS.

## Muestra CAP real

CAP auditado: `https://ssl.smn.gob.ar/feeds/CAP/xml_generados/CAP_20260906202519_Zonda_Cordillera_alertas_alertas_1.xml`.

| Campo | Valor observado |
| --- | --- |
| `identifier` | `urn:oid:2.49.0.1.32.0.2026.09.06.20.25.10.1` |
| `sender` / `senderName` | `smn@smn.gob.ar` / Servicio Meteorológico Nacional |
| `sent` | `2026-09-06T20:25:10-03:00` |
| `status` | `Actual` |
| `msgType` | `Update` |
| `scope` | `Public` |
| `references` | emisor, identificador y fecha del mensaje sustituido |
| `language`, `category`, `event` | `es-AR`, `Met`, Viento Zonda |
| `urgency`, `severity`, `certainty` | `Future`, `Moderate`, `Likely` |
| `onset`, `expires` | timestamps ISO 8601 con offset `-03:00` |
| texto | `headline`, `description`, `instruction`, `web` presentes |
| área | `areaDesc` vacío, `polygon` presente, sin `circle` ni `geocode` en esta muestra |

Los campos `effective`, `responseType`, `circle` y `geocode` no estuvieron presentes en la muestra: deben ser opcionales en el modelo. El parser debe considerar múltiples `info` y múltiples `area`.

## Geografía e Ituzaingó

La coordenada existente en `js/dashboard.js` es `-34.655,-58.667`; se reutiliza como punto representativo y no se agrega otra ubicación. El polígono CAP real se expresa como pares **latitud,longitud**, separados por espacios (ejemplo inicial: `-23.2,-65.06`).

La muestra de Viento Zonda usa un polígono real de Cordillera y no incluye el punto de Ituzaingó: el prototipo devuelve `false`. Un punto del interior del polígono real puede usarse para validar el caso `true`; esa prueba no modifica ni inventa el CAP. La futura función debe implementar ray casting, aceptar polígonos cerrados o no cerrados, negativos, espacios/saltos de línea, áreas y polígonos múltiples. Un punto de borde debe tratarse como caso explícito y conservador.

`areaDesc` es sólo texto visible/fallback de auditoría. No se debe inferir Ituzaingó por “Buenos Aires”. `circle`, si aparece, requiere distancia geodésica contra centro y radio; `geocode` sólo puede ser fallback después de identificar su catálogo, `valueName` y granularidad en CAP reales.

## Niveles, eventos y ciclo de vida

La muestra demuestra que el campo CAP estructurado es `severity` (`Moderate`), no el color de HTML. La página oficial de alertas define los niveles verde, amarillo, naranja y rojo; antes del lanzamiento se debe completar una tabla documentada con muestras CAP que prueben el mapeo de cada severidad oficial. Como medida segura inicial, publicar el texto/campo oficial y no reconstruir ni elevar niveles con datos PWS.

Eventos son `info.event` y deben conservar su terminología oficial (la muestra: Viento Zonda). ACP y temperaturas extremas son colecciones independientes; el RSS actual de ACP devolvió explícitamente “No se han emitido…” y el RSS de temperaturas no incluía un item vigente, por lo que no se fabricaron CAP de ejemplo.

El índice RSS oficial publica un único enlace para temperaturas extremas; el título de ese feed actual se refiere a “Calor”. No se encontró en ese índice un RSS separado de frío. La fase de implementación deberá tratar el evento CAP real como fuente de verdad y no asumir que un feed de calor cubre también frío sin una muestra o una URL oficial adicional.

Para vigencia: analizar `effective`, `onset` y `expires` con `Date.parse` del timestamp CAP original; nunca aplicar manualmente UTC-3. `Alert` crea, `Update` sustituye lo indicado en `references`, y `Cancel` retira el identificado/referenciado. La normalización debe resolver esa cadena antes de publicar. Nunca mostrar un CAP expirado.

## Arquitectura propuesta para fase posterior

`SMN RSS/CAP → Worker existente → Cache API de Cloudflare → GET /api/alerts → Home`.

No consultar SMN desde cada navegador. No agregar Worker, D1 ni cron: usar `fetch` bajo demanda con caché. TTL inicial recomendado: alertas 5 minutos; ACP 2 minutos; temperaturas extremas 20 minutos, ajustable tras observar `lastBuildDate`. Ante error distinguir respuesta correcta sin alertas, fallo HTTP/red, XML inválido, caché reciente y caché vencida. Una caché stale sólo puede mostrarse con fecha y nunca después de `expires`.

Modelo interno propuesto:

```js
{ id, source: 'SMN', type, event, severity, headline, description,
  instructions, areas, effective, onset, expires, msgType, references,
  applicableToItuzaingo, officialUrl }
```

`type` es `alert`, `acp` o `temperature`. El orden de presentación propuesto es ACP vigente, rojo, naranja, amarillo, temperatura extrema y demás productos. Accesibilidad: siempre texto “Alerta amarilla/naranja/roja”, nunca sólo color.

## Parser, seguridad, costo y atribución

Workers no debe depender de `DOMParser` de navegador. Se recomienda un parser XML pequeño, mantenido y sin resolución de entidades externas (por ejemplo `fast-xml-parser`, tras auditar su tamaño y configuración), o un parser SAX estricto. No usar regex para XML completo, no seguir URLs arbitrarias de `link/web` y deshabilitar DTD/XXE. El prototipo local `scripts/test_smn_cap.ps1` usa `XmlReaderSettings.DtdProcessing=Prohibit` y `XmlResolver=null` para inspeccionar CAP reales.

No se necesita D1 para estado vigente; Cache API basta inicialmente. La propuesta cabe en Cloudflare Free y feeds públicos SMN, por lo que mantiene costo estimado **USD 0**. La página RSS y feeds muestran atribución SMN; el feed actual declara CC BY 4.0, mientras la página institucional muestra CC BY 2.5 Argentina. La UI debe incluir “Fuente: Servicio Meteorológico Nacional (SMN)” con enlace oficial y la licencia exacta debe verificarse nuevamente al desplegar por esa discrepancia.

## Diseño conceptual y riesgos

Un único módulo compacto “Alertas oficiales” en Home: estado sin alertas sólo si el feed respondió correctamente; ACP vigente con prioridad visual alta; alertas y temperatura extrema separadas, con nivel, evento, área, vigencia, resumen, recomendaciones y enlace SMN. No duplicar indicadores de estación, no indexar páginas efímeras, no modificar Analytics ni panel social.

Riesgos: cambios anuales de URL de feed (`..._2026.xml`), ausencia actual de CAP ACP/térmico para cubrir todas las variantes, mapeo `severity`→nivel aún no demostrado para cada color, y geometrías `circle/geocode` no vistas en la muestra. Mitigación: descubrimiento/configuración de feed, parser tolerante, pruebas de fixtures oficiales guardadas con procedencia y no desplegar fallback geográfico débil.

**NO SE MODIFICÓ PRODUCCIÓN.**

## Implementación final v1.9

Decisión GO-B implementada: alertas meteorológicas oficiales SMN únicamente, sin ACP, temperaturas extremas, advertencias ni niveles interpretados. El Worker descubre el enlace CAP desde el HTML oficial `/rss` con validación SSRF; RSS y CAP individuales conservan rechazo de DOCTYPE/XXE. El fallo inicial fue enviar HTML al validador XML seguro; v1.9.3 separó ambos flujos y mantiene fallback a la última URL CAP validada.

La respuesta agregada usa Cache API por cinco minutos; D1 no se utiliza y el costo continúa en USD 0. Sólo se publican CAP vigentes cuyo polygon incluye Ituzaingó. Ante error se devuelve `temporarily_unavailable`, nunca una falsa ausencia. Home atribuye al SMN y no muestra severity, amarillo, naranja, rojo ni verde.

## Fase 1.3 — caso San Antonio de los Cobres

Se auditó el caso indicado contra infraestructura oficial actual. El RSS oficial de alertas respondió correctamente, pero no contenía “San Antonio” en sus items ni enlazó un CAP que pudiera relacionarse de forma segura con la alerta amarilla de viento indicada. Por esa razón no se confundió el CAP de Viento Zonda de Cordillera previamente auditado con San Antonio de los Cobres.

La página oficial `https://ws2.smn.gob.ar/alertas` respondió HTTP 200 y carga recursos públicos de `smn_alertas`, incluidos `alerta_jumbo.js`, `alertas.js` y `areas.js`, además de recursos del mapa `mapa.smn.gob.ar`. Sin embargo, las descargas directas de esos scripts desde el entorno de auditoría recibieron HTTP 403. No se encontró, mediante tráfico público reproducible, un endpoint JSON/GeoJSON de nivel, una respuesta con `level`/`color`, ni un mecanismo que pueda consumirse de forma estable sin token. No se intentó eludir ese control ni almacenar JWT.

| Pregunta decisiva | Resultado |
| --- | --- |
| A. Alerta amarilla San Antonio confirmada desde estructura accesible | No verificable en esta ejecución |
| B. CAP correspondiente encontrado | No |
| C. San Antonio dentro del polygon | No verificable sin CAP correspondiente |
| D. Nivel amarillo presente en CAP | No |
| E. Nivel amarillo en otra respuesta oficial estructurada | No |
| F. Endpoint/recurso de nivel reutilizable | No identificado; sólo scripts públicos referenciados por la página |
| G. Requiere JWT | No determinado; no se usaron ni extrajeron tokens |
| H. Viable consumir esa fuente adicional desde Worker | No demostrado |
| I. Mecanismo general para cualquier ciudad | No demostrado |
| J. Ejemplos naranja/rojo en misma estructura | No |

El caso no modifica el cierre anterior: **GO-B** sigue siendo la recomendación. CAP/RSS es la fuente oficial viable para presencia, texto, vigencia y geometría cuando el CAP está disponible; no existe evidencia nueva para mostrar colores. La arquitectura combinada CAP + backend interno de niveles no es recomendable mientras el segundo componente no sea público, reproducible y documentable sin autenticación efímera.

**NO SE MODIFICÓ PRODUCCIÓN.**

## Fase 1.2 — mapping final de niveles

Objetivo acotado: encontrar una correlación oficial CAP entre amarillo/naranja/rojo y campos estructurados. Se reutilizó el feed oficial y el CAP SMN real ya auditado; no se volvió a auditar arquitectura ni se utilizó HTML como fuente de mapping.

### Resultado de búsqueda

| Nivel solicitado | CAP correlacionado oficialmente | Resultado |
| --- | --- | --- |
| Amarillo | No | No se obtuvo una fuente oficial que asocie inequívocamente el CAP concreto con el color visible |
| Naranja | No | No se obtuvo CAP oficial accesible y correlacionado |
| Rojo | No | No se obtuvo CAP oficial accesible y correlacionado |

La muestra CAP oficial disponible es:

| Campo | Valor real |
| --- | --- |
| URL | `https://ssl.smn.gob.ar/feeds/CAP/xml_generados/CAP_20260906202519_Zonda_Cordillera_alertas_alertas_1.xml` |
| identifier | `urn:oid:2.49.0.1.32.0.2026.09.06.20.25.10.1` |
| event / headline | Viento Zonda / Viento Zonda |
| severity | `Moderate` |
| urgency | `Future` |
| certainty | `Likely` |
| category | `Met` |
| senderName | Servicio Meteorológico Nacional |
| eventCode | ausente |
| parameter | ausente |
| responseType | ausente |
| campo explícito color/nivel | ausente |
| msgType | `Update` |

La muestra contiene texto, vigencia, instrucciones, `references` y polígono, pero no `eventCode`, `parameter`, `responseType` ni un campo `color`, `level` o equivalente. Por lo tanto, aunque CAP estándar use valores conceptuales como `Moderate`, `Severe` y `Extreme`, esta auditoría no demuestra que el SMN los convierta uno a uno en amarillo, naranja y rojo. Esa inferencia queda prohibida.

### Conclusión y alcance recomendado

Resultado: **GO-B**.

Es seguro implementar una primera v1.9 limitada a “Alerta meteorológica oficial vigente” siempre que el CAP sea vigente, el polígono incluya Ituzaingó y se muestre evento, headline, vigencia, área, instrucciones, enlace y atribución SMN. En ese alcance no se muestra amarillo, naranja ni rojo, por lo que Meteo Ituzaingó no altera ni infiere la severidad oficial.

Recomendación: **OPCIÓN 2**.

- v1.9: alertas meteorológicas SMN georreferenciadas, sin color/nivel interpretado.
- v1.9.1: ACP, cuando exista una muestra CAP oficial completa.
- v1.9.2: temperaturas extremas, al confirmar producto estructurado de calor/frío.
- v1.9.3: advertencias, si SMN publica un feed estructurado verificable.

Esto preserva exactitud y utilidad: se conoce con seguridad que un CAP vigente afecta a Ituzaingó, sin afirmar una clasificación cromática no demostrada. El enlace oficial permite al usuario consultar la presentación completa del SMN.

**NO SE MODIFICÓ PRODUCCIÓN.**

## Fase 1.1 — cierre de auditoría

### Mapping de niveles: evidencia y límite

Se volvió a consultar el RSS oficial de alertas y sus CAP enlazados. La muestra CAP oficial disponible de Viento Zonda tiene `severity=Moderate`, `urgency=Future`, `certainty=Likely`, `msgType=Update`, `references` y polígono; no contiene `eventCode` ni `parameter` que codifiquen un color SMN. La página oficial describe los niveles amarillo, naranja y rojo, pero no constituye por sí sola una relación estructurada CAP entre color y `severity`.

| Nivel SMN | CAP severity | CAP urgency/certainty | eventCode/parameter | Evidencia | Resultado |
| --- | --- | --- | --- | --- | --- |
| Amarillo | `Moderate` observado | `Future` / `Likely` observado | no presentes en muestra | CAP real de Viento Zonda + definición oficial de niveles | asociación probable, no demostración inequívoca de color |
| Naranja | no observado en CAP auditado | no observado | no observado | no se encontró CAP oficial reciente accesible que lo pruebe | no validado |
| Rojo | no observado en CAP auditado | no observado | no observado | no se encontró CAP oficial reciente accesible que lo pruebe | no validado |
| Verde | no observado como CAP | no aplica | no aplica | SMN lo describe como ausencia de amenaza | no publicar como alerta CAP |

Conclusión: `severity` es el único campo estructurado de severidad observado, pero no hay evidencia CAP suficiente para publicar una tabla definitiva amarillo/naranja/rojo. En producción futura debe conservarse el valor oficial CAP y bloquear la publicación de un nivel con mapeo no validado. No debe inferirse un color desde HTML, evento ni datos PWS.

### Temperaturas extremas: calor y frío

El índice RSS oficial continúa publicando el feed `rss_ola_calor_nuevo.xml`; su canal se titula temperaturas extremas de **calor** y, durante la auditoría, no tenía items CAP. El índice no publicó un RSS separado de frío y no se encontró desde fuentes oficiales auditadas un CAP histórico accesible que documente su estructura. No se puede afirmar que el feed de calor cubra frío ni que comparta los mismos niveles CAP. La estrategia segura es tratar calor/frío como productos distintos y postergar ambos hasta disponer de un feed o CAP oficial verificable por tipo.

### ACP

El RSS ACP oficial respondió correctamente y de manera estructurada que no había avisos emitidos. No se encontró un CAP ACP vigente o reciente enlazado por SMN para auditar `onset/effective/expires`, instrucciones, duración y ciclo Update/Cancel propios del producto. La política futura segura es: sin CAP georreferenciado y vigente, ACP no se muestra como aplicable; nunca traducir el mensaje de ausencia del feed como una alerta.

### Geometría y política segura

Se observaron polígonos CAP reales y se validó point-in-polygon con la coordenada existente de Ituzaingó: `false` para la muestra de Cordillera y `true` para un punto interior del mismo polígono. `area.circle` y `area.geocode` no fueron observados en las muestras oficiales auditadas. No bloquean el diseño: soportar inicialmente todos los polígonos de todas las áreas; un CAP sin polígono interpretable queda descartado para Ituzaingó. Circle sólo se habilitará después de implementar distancia geodésica y geocode sólo con catálogo SMN oficialmente validado. `areaDesc` nunca es criterio suficiente.

### URL anual y frecuencia

La ruta actual de alertas incluye `2026`; por eso no debe hardcodearse. El índice `https://ws2.smn.gob.ar/rss` publica el enlace vigente y debe ser el mecanismo de descubrimiento bajo caché. Si el índice falla, conservar la última URL conocida sólo para revalidación, nunca como una garantía anual.

Las frecuencias de 5 min (alertas), 2 min (ACP) y 20 min (temperaturas) son una decisión de diseño, no una frecuencia oficial publicada. Son razonables sólo detrás de Cache API, con coalescencia de solicitudes y sin polling desde el navegador.

### Advertencias

La página SMN distingue Advertencias (niebla, humo, polvo, ceniza), pero el índice RSS auditado no expuso un feed CAP/RSS separado y estructurado para ese producto. Recomendación: posponer Advertencias para v1.9.x/v1.10; no ampliar alcance mediante scraping de su HTML.

### Cierre

Resultado: **NO-GO para implementar v1.9 todavía**. Se cumplen geometría polygon, política de descarte seguro, vigencia CAP y costo USD 0; no se cumplen aún mapping fiable amarillo/naranja/rojo, muestra ACP estructural real y estrategia verificable de temperaturas extremas calor/frío. Se requiere evidencia CAP oficial adicional para esos puntos antes de cualquier endpoint o módulo Home.

**NO SE MODIFICÓ PRODUCCIÓN.**
