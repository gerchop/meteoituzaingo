# Changelog

## v0.9 - 2026-07-19

- Se auditó Weather.com/Weather Underground y Weathercloud; se incorporó `DATA_SOURCES.md` con endpoints, autenticación, licencias, resultados de autorización y funcionalidades pendientes.
- Se verificó que la clave actual autoriza las observaciones PWS actuales, pero devuelve `401` para históricos rápidos, históricos de 7 días, históricos por fecha e índice UV. No se habilitaron gráficos ni datos simulados.
- El pronóstico conserva la integración oficial de Weather.com y comunica la limitación de licencia cuando los endpoints de pronóstico no están habilitados.
- Se configuró el zoom inicial del mapa y se garantiza que el popup de la estación se sincronice aun si la observación llega antes de que Leaflet termine de inicializarse.
- Se añadieron metadatos Open Graph, robots y datos estructurados `WeatherStation` para mejorar SEO técnico sin alterar la interfaz.
- No se integraron radar, calidad del aire, alertas, astronomía ni capas satelitales: requieren productos/licencias no autorizados o una fuente compatible con monetización que no está disponible actualmente.

## v0.8 - 2026-07-19

- Se amplió el renderizado de pronósticos de Weather.com para incluir probabilidad de lluvia y velocidad de viento por hora; el extendido ahora muestra probabilidad de precipitación junto a mínima, máxima, icono y descripción.
- Se identificó visualmente la fuente de los pronósticos cuando los endpoints de Weather.com estén autorizados.
- Se mantiene el aviso de indisponibilidad cuando la clave no autoriza los productos de pronóstico, sin emplear datos simulados.
- No se integró una alternativa gratuita: Open-Meteo y RainViewer restringen sus capas gratuitas a usos no comerciales, incompatibles con la futura monetización prevista para el sitio.
- El mapa Leaflet ahora tiene marcador profesional de la estación, popup actualizado con datos locales y control para volver a centrarlo.
- Se documentó la limitación del radar: el SMN no publica una integración de radar documentada para terceros, por lo que no se incorporaron capas no autorizadas ni imágenes estáticas.

## v0.7 - 2026-07-18

- El estado actual usa `wxPhraseMedium`, `wxPhraseLong` o `wxPhraseShort` cuando la estación lo informa; se añadió una clasificación de respaldo basada en precipitación, humedad y viento.
- Se sustituyó la tarjeta de radiación solar por punto de rocío, obtenido de la API o calculado con la fórmula de Magnus.
- Se incorporaron secciones responsive de pronóstico horario (12 horas) y extendido (5 días), conectadas a los endpoints oficiales v3 de Weather.com.
- Los pronósticos solo se muestran cuando la clave dispone de autorización para esos productos; en caso contrario se informa claramente sin usar datos simulados.
- Se incorporó un mapa de ubicación con Leaflet y OpenStreetMap, compatible con GitHub Pages y Blogger.
- Se preparó la sección de radar meteorológico para conectar una fuente pública en una próxima versión; todavía no incluye capas de radar por no haber una fuente abierta validada en esta implementación.

## v0.6 - 2026-07-18

- Rediseño completo del dashboard con una cabecera y jerarquía visual renovadas.
- Diseño responsive creado con enfoque móvil primero.
- Tarjetas de condiciones modernizadas y agregado de la lectura de ráfagas.
- Corrección de textos UTF-8 y reemplazo de emojis por iconos de Font Awesome.
- Mejoras de accesibilidad, estados de carga/error y manejo seguro de datos incompletos.
